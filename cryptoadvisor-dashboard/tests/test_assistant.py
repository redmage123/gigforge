"""Chat assistant actions: parsing, validation, confirm-only execution. Run: pytest tests/test_assistant.py -q"""

import asyncio
import sys
import time
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402

from services import assistant_actions as aa  # noqa: E402
from services import in_play  # noqa: E402
from services.market import registry  # noqa: E402
from services.market.models import Instrument, Quote  # noqa: E402


@pytest.fixture(autouse=True)
def world():
    registry.load_for_tests([
        Instrument("stock:AAPL", "stock", "AAPL", "Apple Inc.", {"yahoo": "AAPL"}, sessions="us_equity", tags=("popular",)),
        Instrument("crypto:BTC", "crypto", "BTC", "Bitcoin", {"binance": "BTCUSDT", "coingecko": "bitcoin"}, tags=("popular",)),
    ])
    store = {}
    load = lambda u, n: store.get((u, n), [] if n != "in_play_rules" else {})  # noqa: E731
    save = lambda u, n, d: store.__setitem__((u, n), d)  # noqa: E731
    prices = {"stock:AAPL": 345.0, "commodity:GC": 4100.0}

    async def quotes(ids):
        return {i: Quote(i, prices[i], 0.0, None, time.time(), "test") for i in ids if i in prices}

    from services import alerts, favorites, trades
    with patch.object(aa.market, "quotes", quotes), \
            patch.object(trades, "load_user_data", load), patch.object(trades, "save_user_data", save), \
            patch.object(alerts, "load_user_data", load), patch.object(alerts, "save_user_data", save), \
            patch.object(favorites, "load_user_data", load), patch.object(favorites, "save_user_data", save), \
            patch.object(in_play, "load_user_data", load), patch.object(in_play, "save_user_data", save), \
            patch.object(in_play, "load_candidates", lambda: {}), patch.object(in_play, "save_candidates", lambda *a, **k: None), \
            patch.object(in_play, "_all_usernames", lambda: ["u"]), patch.object(in_play, "profile_ready", lambda r: True):
        yield {"store": store, "prices": prices}


def run(coro):
    return asyncio.run(coro)


class TestParsing:
    def test_splits_reply_and_actions(self):
        text, props = aa.split_reply('Sure, here you go.\n```actions\n[{"type": "add_watchlist", "instrument": "gold"}]\n```')
        assert text == "Sure, here you go." and props == [{"type": "add_watchlist", "instrument": "gold"}]

    def test_no_or_bad_block(self):
        assert aa.split_reply("Just an answer.") == ("Just an answer.", [])
        assert aa.split_reply("x ```actions\n[not json]\n```")[1] == []

    def test_caps_number_of_actions(self):
        block = "```actions\n" + str([{"type": "add_watchlist", "instrument": "AAPL"}] * 9).replace("'", '"') + "\n```"
        assert len(aa.split_reply(block)[1]) == aa.MAX_ACTIONS


class TestValidate:
    def test_trade_at_market_is_quoted(self):
        a = run(aa.validate({"type": "add_trade", "instrument": "AAPL", "side": "buy", "quantity": 10, "price": "market"}, "u"))
        assert a["status"] == "proposed" and a["params"]["price"] == 345.0 and a["params"]["instrument_id"] == "stock:AAPL"
        assert "BUY 10 AAPL" in a["summary"] and "market" in a["summary"]

    def test_trade_resolves_names_and_ids(self):
        a = run(aa.validate({"type": "add_trade", "instrument": "gold", "side": "sell", "quantity": 1, "price": 4000}, "u"))
        assert a["params"]["instrument_id"] == "commodity:GC"
        b = run(aa.validate({"type": "add_trade", "instrument": "crypto:BTC", "side": "buy", "quantity": 0.1, "price": 70000}, "u"))
        assert b["params"]["instrument_id"] == "crypto:BTC"

    @pytest.mark.parametrize("bad,why", [
        ({"type": "add_trade", "instrument": "NOSUCH", "side": "buy", "quantity": 1, "price": 1}, "couldn't find"),
        ({"type": "add_trade", "instrument": "AAPL", "side": "hold", "quantity": 1, "price": 1}, "side"),
        ({"type": "add_trade", "instrument": "AAPL", "side": "buy", "quantity": -1, "price": 1}, "quantity"),
        ({"type": "add_trade", "instrument": "rate:US10Y", "side": "buy", "quantity": 1, "price": 1}, "tradable"),
        ({"type": "delete_everything"}, "unknown action"),
        ({"type": "create_alert", "instrument": "AAPL", "direction": "sideways", "price": 1}, "direction"),
        ({"type": "remove_watchlist", "instrument": "AAPL"}, "isn't on your watchlist"),
        ({"type": "set_inplay_rules", "timeframe": "4h"}, "Timeframe"),
    ])
    def test_invalid(self, bad, why, world):
        world["store"][("u", "favorites")] = ["crypto:BTC"]
        a = run(aa.validate(bad, "u"))
        assert a["status"] == "invalid" and why in a["error"]

    def test_inplay_rules_merge_with_current(self):
        a = run(aa.validate({"type": "set_inplay_rules", "timeframe": "1h", "universes": ["stocks"], "surgex_filter": "velocity"}, "u"))
        r = a["params"]["rules"]
        assert a["status"] == "proposed" and r["timeframe"] == "1h" and r["universes"] == ["stocks"]
        assert r["volume_mult"] == in_play.DEFAULT_RULES.volume_mult and r["surgex_filter"] == "velocity"


class TestExecute:
    def test_market_trade_uses_price_at_confirmation(self, world):
        a = run(aa.validate({"type": "add_trade", "instrument": "AAPL", "side": "buy", "quantity": 10, "price": "market"}, "u"))
        world["prices"]["stock:AAPL"] = 350.0
        msg = run(aa.execute(a, "u"))
        t = world["store"][("u", "trades")][0]
        assert t["price"] == 350.0 and t["source"] == "assistant" and "350" in msg

    def test_alert_watchlist_rules(self, world):
        run(aa.execute(run(aa.validate({"type": "create_alert", "instrument": "gold", "direction": "above", "price": 4300}, "u")), "u"))
        assert world["store"][("u", "alerts")][0]["instrument_id"] == "commodity:GC"
        run(aa.execute(run(aa.validate({"type": "add_watchlist", "instrument": "AAPL"}, "u")), "u"))
        assert "stock:AAPL" in world["store"][("u", "favorites")]
        run(aa.execute(run(aa.validate({"type": "set_inplay_rules", "retention_days": 7}, "u")), "u"))
        assert world["store"][("u", "in_play_rules")]["retention_days"] == 7


class TestSurgexFilter:
    def test_confirms_by_direction(self):
        bull = {"direction": "bullish", "sx_velocity": 2.0, "sx_acceleration": -0.1}
        assert in_play.surgex_confirms(bull, "off") and in_play.surgex_confirms(bull, "velocity")
        assert not in_play.surgex_confirms(bull, "acceleration")
        bear = {"direction": "bearish", "sx_velocity": -1.0, "sx_acceleration": -0.5}
        assert in_play.surgex_confirms(bear, "acceleration")
        assert not in_play.surgex_confirms({"direction": "bullish"}, "velocity")  # unknown never confirms

    def test_rules_validate_filter(self):
        assert in_play.Rules(surgex_filter="velocity").validate() is None
        assert in_play.Rules(surgex_filter="maybe").validate()
