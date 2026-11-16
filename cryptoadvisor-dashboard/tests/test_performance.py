"""Performance: NAV reconstruction, TWR that ignores deposits, auto-funding, futures, benchmark."""

import asyncio
import math
import sys
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402

from services import cash, performance as perf, portfolios, trades  # noqa: E402
from services.market import registry  # noqa: E402
from services.market.models import Candle, Instrument  # noqa: E402

D0 = date(2026, 3, 2)
STOCK = {"asset_class": "stock", "multiplier": 1, "currency": "USD"}
GOLD = {"asset_class": "commodity", "multiplier": 100, "currency": "USD"}


def days(n):
    return [D0 + timedelta(days=i) for i in range(n)]


def t(iid, side, qty, px, d, fee=0):
    return {"instrument_id": iid, "side": side, "quantity": qty, "price": px, "date": d.isoformat(), "fee": fee}


def test_deposits_are_not_returns():
    # Deposit 1000, buy 10 @ 100; price -> 110; deposit 1000 more; price -> 121
    closes = {"stock:X": {D0: 100, D0 + timedelta(1): 110, D0 + timedelta(2): 121}}
    tr = [t("stock:X", "buy", 10, 100, D0)]
    ce = [{"type": "deposit", "amount": 1000, "date": D0.isoformat()},
          {"type": "deposit", "amount": 1000, "date": (D0 + timedelta(2)).isoformat()}]
    s = perf.nav_series(tr, ce, closes, {"stock:X": STOCK}, {"USD": 1.0}, D0 + timedelta(2))
    assert s["nav"][1:] == [1000, 1100, 2210]  # day before first is the zero point
    twr = perf.chain(perf.daily_returns(s["nav"], s["flows"])[1:])
    # Day 2: 2210 / (1100 + 1000) - 1 = 5.24%; total = 1.10 * 1.0524 - 1. Not (2210-2000)/2000 = 10.5%.
    assert math.isclose(twr, 1.10 * (2210 / 2100) - 1, rel_tol=1e-9)
    assert not s["auto_funded"] and s["cash"] == 1000


def test_auto_funding_without_deposits():
    closes = {"stock:X": {D0: 105, D0 + timedelta(1): 105}}
    s = perf.nav_series([t("stock:X", "buy", 10, 100, D0)], [], closes, {"stock:X": STOCK}, {"USD": 1.0}, D0 + timedelta(1))
    assert s["auto_funded"] and s["flows"][1] == 1000 and s["nav"][1] == 1050
    assert math.isclose(perf.chain(perf.daily_returns(s["nav"], s["flows"])[1:]), 0.05)  # first day's move counts


def test_sale_proceeds_stay_as_cash():
    closes = {"stock:X": {D0: 100, D0 + timedelta(1): 120, D0 + timedelta(2): 50}}
    tr = [t("stock:X", "buy", 10, 100, D0), t("stock:X", "sell", 10, 120, D0 + timedelta(1), fee=5)]
    s = perf.nav_series(tr, [], closes, {"stock:X": STOCK}, {"USD": 1.0}, D0 + timedelta(2))
    assert s["nav"][-1] == 1195 and s["cash"] == 1195  # price crash after the sale doesn't matter


def test_futures_move_only_pnl():
    closes = {"commodity:GC": {D0: 4000, D0 + timedelta(1): 4010}}
    ce = [{"type": "deposit", "amount": 10_000, "date": D0.isoformat()}]
    s = perf.nav_series([t("commodity:GC", "buy", 1, 4000, D0)], ce, closes, {"commodity:GC": GOLD}, {"USD": 1.0}, D0 + timedelta(1))
    assert s["nav"][1:] == [10_000, 11_000]  # +10 x 100 multiplier; notional 400k never touches cash


def test_income_counts_as_return_withdrawal_does_not():
    closes = {"stock:X": {d: 100 for d in days(3)}}
    ce = [{"type": "deposit", "amount": 1000, "date": D0.isoformat()},
          {"type": "dividend", "amount": 10, "date": (D0 + timedelta(1)).isoformat()},
          {"type": "withdrawal", "amount": 500, "date": (D0 + timedelta(2)).isoformat()}]
    s = perf.nav_series([t("stock:X", "buy", 5, 100, D0)], ce, closes, {"stock:X": STOCK}, {"USD": 1.0}, D0 + timedelta(2))
    r = perf.chain(perf.daily_returns(s["nav"], s["flows"])[1:])
    assert math.isclose(r, 0.01, rel_tol=1e-9) and s["income"] == 10


def test_xirr():
    r = perf.xirr([(date(2025, 1, 1), -1000), (date(2026, 1, 1), 1100)])
    assert math.isclose(r, 0.10, abs_tol=1e-4)


def test_end_to_end_with_benchmark():
    registry.load_for_tests([Instrument("stock:X", "stock", "X", "X Corp", {"yahoo": "X"}, sessions="us_equity"),
                             Instrument("index:SPX", "index", "SPX", "S&P 500", {"yahoo": "^GSPC"})])
    end = D0 + timedelta(days=60)
    px = {d: 100 * (1.001 ** i) for i, d in enumerate(days(61))}
    bx = {d: 5000 * (1.0005 ** i) for i, d in enumerate(days(61))}

    async def candles(iid, tf, n):
        src = px if iid == "stock:X" else bx
        return [Candle(int((d - date(1970, 1, 1)).total_seconds() * 1000), v, v, v, v, 0) for d, v in sorted(src.items())]

    pid = portfolios.default_id("pm")
    trades.add_trade("pm", "stock:X", "buy", 100, 10, D0.isoformat(), portfolio_id=pid)
    cash.add_entry("pm", pid, "deposit", 1000, D0.isoformat())
    with patch.object(perf.market, "candles", candles):
        out = asyncio.run(perf.performance("pm", [pid], "index:SPX", "all", today=end))
    assert math.isclose(out["twr_pct"], (1.001 ** 60 - 1) * 100, abs_tol=0.01)
    assert math.isclose(out["benchmark_pct"], (1.0005 ** 60 - 1) * 100, abs_tol=0.01)
    assert out["excess_pct"] > 0 and out["net_deposits"] == 1000 and out["cash"] == 0
    assert out["monthly"][0]["month"] == "2026-05" and out["series"][0]["index"] == 100.0
    with patch.object(perf.market, "candles", candles):
        m1 = asyncio.run(perf.performance("pm", [pid], "index:SPX", "1m", today=end))
    assert math.isclose(m1["twr_pct"], (1.001 ** 30 - 1) * 100, abs_tol=0.01) and m1["net_deposits"] == 0
