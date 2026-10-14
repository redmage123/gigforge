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
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test"}), \
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
