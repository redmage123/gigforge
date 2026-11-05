"""Unit tests for the in-play scanner: rules, per-user lists, catalyst matching, push text, AI summary.

Run with: pytest tests/test_in_play.py -v
"""

import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).parent.parent))

from services import in_play_news  # noqa: E402
from services.in_play import (  # noqa: E402
    DEFAULT_RULES,
    MAX_ENTRIES,
    Candle,
    Rules,
    matches,
    measure,
    measure_recent,
    rematch_user,
    user_list,
)
from services.in_play_news import headline_matches, is_price_action  # noqa: E402
from services.in_play_push import format_push  # noqa: E402

DAY = 86400


def _flat_history(n=60, volume=1_000_000.0):
    # Range 2, quote volume 1M per day
    return [Candle(i * DAY * 1000, 100, 101, 99, 100.5, volume) for i in range(n)]


def _candle(o, h, l, c, v, t=60):
    return Candle(t * DAY * 1000, o, h, l, c, v)


def _hit(candle, rules=DEFAULT_RULES):
    m = measure(candle, _flat_history())
    return m if m and matches(m, rules) else None


class TestDefaultRules:
    def test_bullish_breakout_with_small_top_wick(self):
        m = _hit(_candle(100, 108, 99.5, 107.5, 5_000_000))
        assert m and m.direction == "bullish"
        assert m.volume_ratio == 5.0 and m.range_ratio == 4.25
        assert round(m.body_pct) == 88

    def test_bearish_breakdown_with_small_bottom_wick(self):
        m = _hit(_candle(100, 100.5, 92, 92.5, 6_000_000))
        assert m and m.direction == "bearish" and m.change_pct < 0

    def test_volume_must_exceed_4x(self):
        assert _hit(_candle(100, 108, 99.5, 107.5, 4_000_000)) is None

    def test_range_must_exceed_3x(self):
        # range 6 = exactly 3x the 2.0 average -> not "more than" 3x
        assert _hit(_candle(100, 105.5, 99.5, 105.4, 9_000_000)) is None

    def test_bullish_rejected_when_top_wick_is_large(self):
        assert _hit(_candle(100, 110, 99.5, 104, 9_000_000)) is None

    def test_bearish_rejected_when_bottom_wick_is_large(self):
        assert _hit(_candle(100, 100.5, 90, 96, 9_000_000)) is None

    def test_small_body_rejected(self):
        # The CTK case: huge range, tiny -0.9% body, mostly a top wick
        assert _hit(_candle(100, 108, 98.9, 99.1, 9_000_000)) is None

    def test_needs_minimum_history(self):
        assert measure(_candle(100, 108, 99.5, 107.5, 9_000_000), _flat_history(10)) is None

    def test_doji_is_ignored(self):
        assert measure(_candle(100, 106, 94, 100, 9_000_000), _flat_history()) is None


class TestCustomRules:
    def test_looser_rules_admit_more(self):
        loose = Rules(volume_mult=3, range_mult=2.5, max_wick_pct=60, min_body_pct=0)
        assert _hit(_candle(100, 110, 99.5, 104, 9_000_000), loose) is not None

    def test_floors_are_enforced(self):
        assert Rules(volume_mult=1.5).validate()
        assert Rules(min_body_pct=120).validate()
        assert DEFAULT_RULES.validate() is None

    def test_from_dict_ignores_unknown_keys(self):
        assert Rules.from_dict({"volume_mult": "5", "bogus": 1}).volume_mult == 5.0


class TestMeasureRecent:
    def test_checks_last_closed_and_forming(self):
        closed = _candle(100, 108, 99.5, 107.5, 5_000_000, t=60)
        forming = _candle(107.5, 107.6, 99, 99.2, 6_000_000, t=61)
        got = measure_recent([*_flat_history(), closed, forming])
        assert [m.direction for _, m in got] == ["bullish", "bearish"]

    def test_quiet_market_has_nothing(self):
        assert measure_recent(_flat_history(62)) == []


def _cand(symbol, t, matched=None, **metrics):
    base = {"volume_ratio": 5, "range_ratio": 4, "opposing_wick_pct": 10, "body_pct": 80, "direction": "bullish"}
    base.update(metrics)
    return {"symbol": symbol, "base": symbol[:-4], "candle_open_ms": int(t * 1000), "first_seen": t, "matched": matched or {}, **base}


class TestUserLists:
    NOW = 2_000_000_000

    def test_newest_first_one_row_per_coin_with_hit_count(self):
        c = {
            "A:1": _cand("AAAUSDT", self.NOW - 3 * DAY, {"u": self.NOW - 3 * DAY}),
            "B:1": _cand("BBBUSDT", self.NOW - 1 * DAY, {"u": self.NOW - 1 * DAY}),
            "A:2": _cand("AAAUSDT", self.NOW - 100, {"u": self.NOW - 100}),
        }
        rows = user_list(c, "u", self.NOW)
        assert [r["symbol"] for r in rows] == ["AAAUSDT", "BBBUSDT"]
        assert rows[0]["hits"] == 2 and rows[0]["matched"] is None  # other users' names never leak

    def test_capped_at_25_and_30_days(self):
        c = {f"C{i}": _cand(f"C{i:02d}USDT", self.NOW - i * 3600, {"u": self.NOW - i * 3600}) for i in range(40)}
        c["old"] = _cand("OLDUSDT", self.NOW - 31 * DAY, {"u": self.NOW - 31 * DAY})
        rows = user_list(c, "u", self.NOW)
        assert len(rows) == MAX_ENTRIES and rows[0]["symbol"] == "C00USDT"
        assert all(r["symbol"] != "OLDUSDT" for r in rows)

    def test_lists_are_per_user(self):
        c = {"A": _cand("AAAUSDT", self.NOW, {"alice": self.NOW})}
        assert user_list(c, "bob", self.NOW) == []

    def test_rematch_adds_and_removes(self):
        c = {
            "strong": _cand("SSSUSDT", self.NOW, volume_ratio=9),
            "weak": _cand("WWWUSDT", self.NOW, {"u": self.NOW}, volume_ratio=4.5),
        }
        added = rematch_user(c, "u", Rules(volume_mult=6))
        assert added == ["strong"]
        assert "u" in c["strong"]["matched"] and "u" not in c["weak"]["matched"]


class TestCatalystMatching:
    def test_full_name_matches_without_context(self):
        assert headline_matches("DATA Network joins Sui and Walrus to scale AI data", "WAL", {"Walrus"}, set())

    def test_ticker_needs_crypto_context(self):
        assert not headline_matches("OGN stock set for blastoff on buyout deal", "OGN", {"OriginToken"}, {"Origin"})
        assert headline_matches("OGN token listed on Upbit", "OGN", {"OriginToken"}, {"Origin"})

    def test_short_ticker_alone_never_matches(self):
        assert not headline_matches("W crypto shorts overcrowded", "W", set(), set())
        assert headline_matches("Wormhole unlock hits W holders", "W", {"Wormhole"}, set())

    def test_price_action_headlines_are_not_catalysts(self):
        assert is_price_action("Walrus rises nearly 26% as strong technical breakout fuels rally")
        assert is_price_action("Wormhole drops 34%: are shorts overcrowded?")
        assert not is_price_action("DATA Network joins Sui and Walrus to scale the AI training data supply chain")

    def test_listicles_and_analysis_are_dropped(self):
        assert in_play_news._JUNK.search("Next Crypto To Explode: LUMIA Bets on Tokenized Assets")
        assert in_play_news._JUNK.search("IO Crypto Price Analysis: Can io.net Buybacks Offset Unlocks?")
        assert not in_play_news._JUNK.search("NFT Marketplace Blur to Shut Down Website")

    def test_event_words_beat_price_words(self):
        assert not is_price_action("Gitcoin jumps 100% after Upbit announces KRW market listing")
        assert not is_price_action("Token X plunges 40% after bridge exploit")


def _entry(catalyst):
    return {
        "base": "ABC", "direction": "bullish", "change_pct": 18.2, "volume_ratio": 5.1, "range_ratio": 3.4,
        "body_pct": 82, "close": 1.234, "candle_forming": True, "candle_date": "2026-10-14", "catalyst": catalyst,
    }


HEADLINE = {"title": "Exchange lists ABC", "source": "CoinDesk", "url": "u", "kind": "catalyst"}


class TestPushFormat:
    def test_includes_catalyst_headline_and_list(self):
        e = _entry({"found": True, "headlines": [HEADLINE]})
        title, body, _ = format_push(e, [e])
        assert "ABC" in title and "+18.2%" in title
        assert "Catalyst: Exchange lists ABC (CoinDesk)" in body
        assert "Body 82%" in body and "In play (1): ABC▲" in body

    def test_prefers_ai_summary(self):
        e = _entry({"found": True, "headlines": [HEADLINE], "ai_summary": "Listed on Upbit, sparking demand."})
        assert "Catalyst (AI): Listed on Upbit" in format_push(e, [])[1]

    def test_says_when_no_catalyst(self):
        assert "No news catalyst found" in format_push(_entry({"found": False, "headlines": []}), [])[1]


def _response(text, stop="end_turn"):
    return SimpleNamespace(stop_reason=stop, content=[SimpleNamespace(type="thinking"), SimpleNamespace(type="text", text=text)])


class TestAiSummary:
    def _run(self, text, stop="end_turn"):
        cat = {"found": True, "headlines": [HEADLINE], "coin_name": "Abc"}
        create = AsyncMock(return_value=_response(text, stop))
        fake = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(create=create)))
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test"}, clear=True), \
                patch.object(in_play_news.anthropic, "AsyncAnthropic", return_value=fake):
            return asyncio.run(in_play_news.summarize_catalyst(_entry(cat), cat)), create

    def test_summary_added(self):
        out, create = self._run("ABC jumped after Exchange listed it.")
        assert out["ai_summary"] == "ABC jumped after Exchange listed it." and out["found"]
        kwargs = create.call_args.kwargs
        assert kwargs["model"] == in_play_news.AI_MODEL and "Exchange lists ABC" in kwargs["messages"][0]["content"]

    def test_no_catalyst_verdict_overrides_regex(self):
        out, _ = self._run("NO_CATALYST")
        assert out["found"] is False and out["ai_summary"] is None

    def test_refusal_leaves_catalyst_unchanged(self):
        out, _ = self._run("", stop="refusal")
        assert "ai_summary" not in out

    def test_disabled_without_key(self):
        cat = {"found": True, "headlines": [HEADLINE]}
        with patch.dict("os.environ", {}, clear=True):
            assert asyncio.run(in_play_news.summarize_catalyst(_entry(cat), cat)) is cat


class TestClaudeCli:
    def test_run_claude_flags_and_success(self):
        from services import claude_cli

        proc = SimpleNamespace(returncode=0, communicate=AsyncMock(return_value=(b"  4 \n", b"")))
        with patch.object(claude_cli.asyncio, "create_subprocess_exec", AsyncMock(return_value=proc)) as spawn:
            res = asyncio.run(claude_cli.run_claude("2+2?", system="terse"))
        assert res == claude_cli.ClaudeResult(True, "4")
        args = spawn.call_args.args
        assert args[:3] == ("claude", "-p", "2+2?")
        assert args[args.index("--tools") + 1] == "" and "--system-prompt" in args
        assert "/home/bbrelin" not in " ".join(args)  # no machine-specific paths
        assert spawn.call_args.kwargs["cwd"] == claude_cli._WORKDIR

    def test_run_claude_reports_auth_errors(self):
        from services import claude_cli

        proc = SimpleNamespace(returncode=1, communicate=AsyncMock(return_value=(b"Invalid API key", b"")))
        with patch.object(claude_cli.asyncio, "create_subprocess_exec", AsyncMock(return_value=proc)):
            res = asyncio.run(claude_cli.run_claude("hi"))
        assert not res.ok and "Invalid API key" in res.text
        with patch.object(claude_cli.asyncio, "create_subprocess_exec", AsyncMock(return_value=proc)):
            assert asyncio.run(claude_cli.ask_claude("hi")).startswith("Error:")

    def test_summary_uses_cli_when_token_set(self):
        from services import claude_cli

        cat = {"found": False, "headlines": [HEADLINE], "coin_name": "Abc"}
        run = AsyncMock(return_value=claude_cli.ClaudeResult(True, "ABC was listed on a major exchange."))
        with patch.dict("os.environ", {"CLAUDE_CODE_OAUTH_TOKEN": "t"}, clear=True), \
                patch.object(claude_cli, "run_claude", run):
            out = asyncio.run(in_play_news.summarize_catalyst(_entry(cat), cat))
        assert out["found"] and out["ai_summary"].startswith("ABC was listed")
        assert run.call_args.kwargs["system"] == in_play_news._SYSTEM


# ── Timeframes, separate lookbacks, retention (feedback 2026-11) ─────────────

from services import in_play  # noqa: E402
from services.in_play import aggregate, backfill_bars, max_lookback  # noqa: E402

HOUR = 3600


class TestSeparateLookbacks:
    def test_volume_and_price_use_their_own_windows(self):
        # Volume was 10x higher 40+ candles ago: a 60-candle volume average is inflated, a 20-candle one is not
        hist = [Candle(i * DAY * 1000, 100, 101, 99, 100.5, 10_000_000 if i < 40 else 1_000_000) for i in range(60)]
        spike = _candle(100, 108, 99.5, 107.5, 5_000_000)
        long_avg = measure(spike, hist, volume_lookback=60, price_lookback=60)
        short_avg = measure(spike, hist, volume_lookback=20, price_lookback=60)
        assert long_avg is None  # 5M vs ~4M average: below the 2x floor
        assert short_avg and short_avg.volume_ratio == 5.0 and short_avg.avg_volume == 1_000_000

    def test_min_history_follows_the_longer_lookback(self):
        spike = _candle(100, 108, 99.5, 107.5, 9_000_000)
        assert measure(spike, _flat_history(20), 20, 20) is not None
        assert measure(spike, _flat_history(20), 20, 100) is None  # needs 50 candles


class TestAggregate:
    def test_3h_bars_from_1h_with_forming_tail(self):
        hourly = [Candle((i + 1) * HOUR * 1000, 10 + i, 11 + i, 9 + i, 10.5 + i, 100) for i in range(8)]
        bars = aggregate(hourly, 3, 3 * HOUR)
        # hours 1-2 are a partial first bucket (dropped); 3-5 and 6-8 are full, 6-8 is... complete
        assert [b.open_time for b in bars] == [3 * HOUR * 1000, 6 * HOUR * 1000]
        first = bars[0]
        assert (first.open, first.high, first.low, first.close, first.quote_volume) == (12, 15, 11, 14.5, 300)

    def test_last_partial_bucket_is_the_forming_bar(self):
        hourly = [Candle(i * HOUR * 1000, 1, 2, 0.5, 1.5, 10) for i in range(7)]  # 0-2, 3-5, 6
        bars = aggregate(hourly, 3, 3 * HOUR)
        assert len(bars) == 3 and bars[-1].quote_volume == 10

    def test_9d_from_3d_candles_offset_by_one_day(self):
        # Binance 3d candles open on epoch days 1, 4, 7 (mod 9) -> three per 9d bucket
        three_day = [Candle((1 + 3 * i) * DAY * 1000, 1, 2, 0.5, 1.5, 5) for i in range(9)]
        bars = aggregate(three_day, 3, 9 * DAY)
        assert len(bars) == 3 and all(b.quote_volume == 15 for b in bars)
        assert bars[0].open_time == DAY * 1000

    def test_native_timeframes_pass_through(self):
        hist = _flat_history(5)
        assert aggregate(hist, 1, DAY) is hist


class TestRulesV2:
    def test_defaults_and_profile(self):
        assert DEFAULT_RULES.timeframe == "1d" and DEFAULT_RULES.retention_days == 14
        assert DEFAULT_RULES.profile == "1d:60:60"
        assert Rules(timeframe="1h", volume_lookback=24, price_lookback=48).profile == "1h:24:48"

    def test_from_dict_types(self):
        r = Rules.from_dict({"timeframe": "3h", "volume_lookback": "30", "price_lookback": 45.0, "retention_days": "7"})
        assert (r.timeframe, r.volume_lookback, r.price_lookback, r.retention_days) == ("3h", 30, 45, 7)

    def test_validation(self):
        assert Rules(timeframe="4h").validate()
        assert Rules(volume_lookback=5).validate()
        assert Rules(timeframe="9d", price_lookback=400).validate()  # 9d is built from 3x 3d candles
        assert Rules(timeframe="9d", price_lookback=300).validate() is None
        assert Rules(retention_days=0).validate() and Rules(retention_days=91).validate()
        assert all(Rules(timeframe=tf).validate() is None for tf in in_play.TIMEFRAMES)

    def test_max_lookback_fits_one_request(self):
        assert max_lookback("1h") == 500 and max_lookback("3h") == 331 and max_lookback("9d") == 331

    def test_backfill_covers_retention_where_it_fits(self):
        assert backfill_bars("1d", 60, 14) == 14
        assert backfill_bars("1h", 60, 14) == 336
        assert backfill_bars("1h", 60, 90) == 1000 - 60 - 2  # 90 days of hours does not fit; take what fits


class TestProfilesAndRetention:
    NOW = 2_000_000_000

    def test_only_the_users_profile_matches_and_switching_drops_old_hits(self):
        c = {
            "d": {**_cand("DDDUSDT", self.NOW), "profile": "1d:60:60"},
            "h": {**_cand("HHHUSDT", self.NOW), "profile": "1h:60:60"},
        }
        assert rematch_user(c, "u", DEFAULT_RULES) == ["d"]
        assert rematch_user(c, "u", Rules(timeframe="1h")) == ["h"]
        assert "u" not in c["d"]["matched"]
        rows = user_list(c, "u", self.NOW, profile="1h:60:60")
        assert [r["symbol"] for r in rows] == ["HHHUSDT"]

    def test_coins_fall_off_after_retention_days(self):
        c = {
            "new": _cand("NEWUSDT", self.NOW - 3 * DAY, {"u": self.NOW - 3 * DAY}),
            "old": _cand("OLDUSDT", self.NOW - 10 * DAY, {"u": self.NOW - 10 * DAY}),
        }
        assert [r["symbol"] for r in user_list(c, "u", self.NOW, retention_days=14)] == ["NEWUSDT", "OLDUSDT"]
        assert [r["symbol"] for r in user_list(c, "u", self.NOW, retention_days=7)] == ["NEWUSDT"]

    def test_legacy_candidates_become_daily_default_profile(self):
        legacy = {"ABCUSDT:123": {**_cand("ABCUSDT", 123), "quote_volume": 5_000_000, "volume_ratio": 5.0, "candle_date": "2026-10-01"}}
        with patch.object(in_play, "load_shared_data", return_value=legacy):
            got = in_play.load_candidates()
        (key, c), = got.items()
        assert key == "1d:60:60|crypto:ABC|123000" and c["timeframe"] == "1d" and c["avg_quote_volume"] == 1_000_000
        assert c["universe"] == "crypto" and c["asset_class"] == "crypto"
        assert c["candle_label"] == "2026-10-01"

    def test_old_scan_state_counts_as_daily_history_built(self):
        assert in_play._backfilled_profiles({"backfilled": True}) == {"1d:60:60@crypto"}
        assert in_play._backfilled_profiles({"backfilled_profiles": ["1h:24:24"]}) == {"1h:24:24@crypto"}
        assert in_play._backfilled_profiles({"backfilled_profiles": ["1d:60:60@stocks"]}) == {"1d:60:60@stocks"}


class TestPushV2:
    def test_shows_volume_in_dollars_and_timeframe(self):
        e = {**_entry({"found": False, "headlines": []}), "quote_volume": 12_345_678, "timeframe": "1h"}
        body = format_push(e, [])[1]
        assert "Volume $12.3M (5.1x avg)" in body and "forming 1h candle" in body

    def test_daily_still_says_daily(self):
        e = {**_entry({"found": False, "headlines": []}), "quote_volume": 812_000}
        assert "Volume $812.0K" in format_push(e, [])[1] and "daily candle" in format_push(e, [])[1]


# ── Asset-class universes (AssetAdvisor) ────────────────────────────────────

from services.market import universes  # noqa: E402
from services.in_play_news import instrument_names  # noqa: E402


class TestUniverses:
    NOW = 2_000_000_000

    def test_rules_universes(self):
        assert DEFAULT_RULES.universes == ("crypto",)
        r = Rules.from_dict({"universes": ["crypto", "stocks", "crypto"]})
        assert r.universes == ("crypto", "stocks") and r.builds() == {"1d:60:60@crypto", "1d:60:60@stocks"}
        assert Rules(universes=()).validate() and Rules(universes=("forex",)).validate()
        assert Rules(universes=("stocks", "etfs", "futures")).validate() is None

    def test_lists_and_matching_respect_universes(self):
        c = {
            "c": {**_cand("BTC", self.NOW), "universe": "crypto", "instrument_id": "crypto:BTC"},
            "s": {**_cand("AAPL", self.NOW), "universe": "stocks", "instrument_id": "stock:AAPL"},
        }
        assert rematch_user(c, "u", Rules(universes=("stocks",))) == ["s"]
        assert [r["instrument_id"] for r in user_list(c, "u", self.NOW, universe_set=("stocks",))] == ["stock:AAPL"]
        assert rematch_user(c, "u", Rules(universes=("crypto", "stocks"))) == ["c"]

    def test_same_session_hour_volume(self):
        # 10 sessions of 7 hourly bars; the opening hour always trades 5x the rest
        H = 3600 * 1000
        hist = []
        for d in range(10):
            for h in range(7):
                v = 5_000_000 if h == 0 else 1_000_000
                hist.append(Candle(d * DAY * 1000 + 13 * H + h * H, 100, 101, 99, 100.5, v))
        slots = in_play.session_slots(hist, 3600)
        assert slots[hist[0].open_time] == 0 and slots[hist[6].open_time] == 6 and slots[hist[7].open_time] == 0
        slot_of = lambda c: slots.get(c.open_time, 0)  # noqa: E731
        opening = Candle(10 * DAY * 1000 + 13 * H, 100, 108, 99.5, 107.5, 12_000_000)
        slots[opening.open_time] = 0
        # vs all hours the open looks like 7.5x; vs earlier opens it is only 2.4x (below the 2x floor? no: above)
        plain = measure(opening, hist, 60, 60)
        same = measure(opening, hist, 60, 60, slot_of)
        assert plain.volume_ratio > 6 and 2 < same.volume_ratio < 3

    def test_market_hours(self):
        from datetime import datetime, timezone
        ts = lambda *a: datetime(*a, tzinfo=timezone.utc).timestamp()  # noqa: E731
        assert universes.market_open("crypto", ts(2026, 11, 7, 3))  # Saturday night
        assert universes.market_open("stocks", ts(2026, 11, 5, 15))  # Thursday 15:00 UTC
        assert not universes.market_open("stocks", ts(2026, 11, 5, 23))
        assert not universes.market_open("stocks", ts(2026, 11, 7, 15))  # Saturday
        assert not universes.market_open("futures", ts(2026, 11, 7, 12))  # Saturday
        assert universes.market_open("futures", ts(2026, 11, 8, 23))  # Sunday evening reopen

    def test_parse_sp500(self):
        html = ('<table id="constituents"><tr><th>Symbol</th></tr><tr><td><a>MMM</a></td><td>3M</td></tr>'
                '<tr><td>BRK.B</td></tr><tr><td>bad sym</td></tr></table>')
        assert universes.parse_sp500(html) == ["MMM", "BRK.B"]


class TestNewsByClass:
    def test_company_names(self):
        assert instrument_names("stock", "Apple Inc.", "AAPL") == {"Apple", "Apple Inc."}
        assert "Alphabet" in instrument_names("stock", "Alphabet Inc. Class A", "GOOGL")
        assert instrument_names("commodity", "Gold", "GC") == {"Gold"}
        assert "Treasury" in instrument_names("bond", "10-Year T-Note", "ZN")

    def test_stock_ticker_needs_market_context(self):
        from services.in_play_news import _STOCK_CONTEXT
        assert headline_matches("AAPL slides after weak iPhone guidance", "AAPL", set(), set(), _STOCK_CONTEXT)
        assert not headline_matches("AAPL conference recap", "AAPL", set(), set(), _STOCK_CONTEXT)
        assert headline_matches("Apple cuts outlook", "AAPL", {"Apple"}, set(), _STOCK_CONTEXT)

    def test_stock_events_are_catalysts(self):
        assert not is_price_action("Nvidia jumps 8% after earnings beat and raised guidance")
        assert not is_price_action("Oil surges 5% as OPEC+ agrees deeper output cuts")


class TestForexInPlay:
    def test_no_volume_candles_match_on_shape(self):
        hist = [Candle(i * DAY * 1000, 100, 101, 99, 100.5, 0) for i in range(60)]
        big = _candle(100, 108, 99.5, 107.5, 0)
        assert measure(big, hist) is None  # volume rule would need volume
        m = measure(big, hist, use_volume=False)
        assert m and m.volume_ratio is None and matches(m, DEFAULT_RULES)
        assert not matches(measure(_candle(100, 104, 99.5, 103.5, 0), hist, use_volume=False), DEFAULT_RULES)  # 2.25x range

    def test_forex_universe_and_hours(self):
        from datetime import datetime, timezone
        from services.market import registry as reg
        reg.load_for_tests([])
        fx = universes.members("fx")
        assert len(fx) >= 20 and all(not i.has_volume and i.sessions == "fx" for i in fx)
        usdjpy = reg.get("fx:USDJPY")
        assert usdjpy.currency == "JPY" and usdjpy.providers["yahoo"] == "USDJPY=X" and usdjpy.tradable
        ts = lambda *a: datetime(*a, tzinfo=timezone.utc).timestamp()  # noqa: E731
        assert universes.market_open("fx", ts(2026, 11, 5, 3)) and not universes.market_open("fx", ts(2026, 11, 7, 12))

    def test_push_without_volume(self):
        e = {**_entry({"found": False, "headlines": []}), "volume_ratio": None, "quote_volume": 0, "timeframe": "1h"}
        assert "No volume data" in format_push(e, [])[1]
