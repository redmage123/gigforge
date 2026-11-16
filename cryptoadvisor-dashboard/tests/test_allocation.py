"""Target allocations: validation, drift, rounded rebalance orders, drift alerts."""

import asyncio
import sys
import time
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402

from services import allocation, cash, portfolios, trades  # noqa: E402
from services.market import registry  # noqa: E402
from services.market.models import Instrument, Quote  # noqa: E402


@pytest.fixture(autouse=True)
def world():
    registry.load_for_tests([
        Instrument("stock:AAPL", "stock", "AAPL", "Apple Inc.", {"yahoo": "AAPL"}, sessions="us_equity"),
        Instrument("etf:AGG", "etf", "AGG", "iShares Core US Aggregate Bond", {"yahoo": "AGG"}, sessions="us_equity"),
        Instrument("crypto:BTC", "crypto", "BTC", "Bitcoin", {"binance": "BTCUSDT"}),
        Instrument("rate:US10Y", "rate", "US10Y", "US 10Y yield", {"yahoo": "^TNX"}),
    ])
    prices = {"stock:AAPL": 200.0, "etf:AGG": 100.0, "crypto:BTC": 50_000.0}

    async def quotes(ids):
        return {i: Quote(i, prices[i], 0.0, None, time.time(), "test") for i in ids if i in prices}

    from services import market
    with patch.object(market, "quotes", quotes):
        yield prices


def run(c):
    return asyncio.run(c)


def setup_book():
    pid = portfolios.default_id("pm")
    cash.add_entry("pm", pid, "deposit", 10_000, "2026-01-01")
    trades.add_trade("pm", "stock:AAPL", "buy", 200, 40, "2026-01-02", portfolio_id=pid)  # 8,000 of 10,000
    return pid


def test_validation():
    with pytest.raises(ValueError, match="more than 100"):
        allocation.validate_targets([{"key": "stock:AAPL", "weight": 70}, {"key": "etf:AGG", "weight": 40}])
    with pytest.raises(ValueError, match="either"):
        allocation.validate_targets([{"key": "stock:AAPL", "weight": 10}, {"key": "class:crypto", "weight": 10}])
    with pytest.raises(ValueError, match="reference"):
        allocation.validate_targets([{"key": "rate:US10Y", "weight": 10}])
    with pytest.raises(ValueError, match="Unknown"):
        allocation.validate_targets([{"key": "stock:NOPE", "weight": 10}])


def test_drift_and_orders_instrument_targets():
    pid = setup_book()
    run(allocation.set_targets("pm", pid, [{"key": "stock:AAPL", "weight": 60}, {"key": "etf:AGG", "weight": 35}], threshold=5))
    a = run(allocation.analyze("pm", pid))
    rows = {r["key"]: r for r in a["rows"]}
    assert a["nav"] == 10_000 and a["cash"] == 2_000
    assert rows["stock:AAPL"]["current_pct"] == 80 and rows["stock:AAPL"]["drift_pct"] == 20 and rows["stock:AAPL"]["breach"]
    assert rows["etf:AGG"]["current_pct"] == 0 and rows["cash"]["target_pct"] == 5
    orders = {o["instrument_id"]: o for o in a["orders"]}
    assert orders["stock:AAPL"] == {**orders["stock:AAPL"], "side": "sell", "quantity": 10.0}   # 2,000 / 200
    assert orders["etf:AGG"] == {**orders["etf:AGG"], "side": "buy", "quantity": 35.0}          # 3,500 / 100
    logged = run(allocation.log_orders("pm", pid, a["orders"], "pm"))
    assert len(logged) == 2 and all(t["source"] == "rebalance" for t in logged)
    after = run(allocation.analyze("pm", pid))
    assert after["breaches"] == 0


def test_class_targets_scale_holdings():
    pid = setup_book()
    run(allocation.set_targets("pm", pid, [{"key": "class:stock", "weight": 40}, {"key": "class:crypto", "weight": 20}]))
    a = run(allocation.analyze("pm", pid))
    rows = {r["key"]: r for r in a["rows"]}
    assert rows["class:stock"]["drift_pct"] == 40 and "Nothing held" in rows["class:crypto"]["note"]
    assert a["orders"] == [{**a["orders"][0], "instrument_id": "stock:AAPL", "side": "sell", "quantity": 20.0}]


def test_drift_alert_once_a_day():
    pid = setup_book()
    run(allocation.set_targets("pm", pid, [{"key": "stock:AAPL", "weight": 50}]))
    sent = []
    with patch.object(allocation, "add_notification", lambda u, t, m, category: sent.append((u, t))):
        run(allocation.check_drift_all())
        run(allocation.check_drift_all())
    assert sent == [("pm", "My portfolio has drifted from its targets")]
