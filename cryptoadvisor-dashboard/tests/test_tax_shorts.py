"""Tax report short sales: sell-to-open, buy-to-cover, multipliers, agreement with trades P&L. No network."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi import FastAPI, Request  # noqa: E402

from services.market import registry  # noqa: E402
from services.market.models import Instrument  # noqa: E402
from services.tax import calculate_tax_report, export_csv  # noqa: E402
from services.trades import replay  # noqa: E402


@pytest.fixture(autouse=True)
def world():
    registry.load_for_tests([
        Instrument("crypto:BTC", "crypto", "BTC", "Bitcoin", {"binance": "BTCUSDT"}),
        Instrument("commodity:GC", "commodity", "GC", "Gold futures", {"yahoo": "GC=F"}, sessions="futures",
                   multiplier=100),
    ])
    yield


def T(side, qty, price, date, fee=0.0, iid="crypto:BTC", n=0, pid=None):
    return {"instrument_id": iid, "side": side, "quantity": qty, "price": price, "date": date, "fee": fee,
            "created_at": n, "portfolio_id": pid}


def test_short_open_and_cover_realizes_on_cover_date():
    trades = [T("sell", 2, 100, "2025-11-01", fee=2), T("buy", 2, 80, "2026-01-10", fee=4)]
    r = calculate_tax_report(trades, "fifo", 2026)
    assert len(r["events"]) == 1
    e = r["events"][0]
    assert e["type"] == "short" and e["open_date"] == "2025-11-01" and e["close_date"] == "2026-01-10"
    assert e["sell_date"] == "2025-11-01" and e["buy_date"] == "2026-01-10" and e["holding_days"] == 70
    assert e["proceeds"] == 198 and e["cost_basis"] == 164 and e["gain_loss"] == 34
    assert r["summary"]["short_count"] == 1 and r["summary"]["skipped_trades"] == 0
    assert calculate_tax_report(trades, "fifo", 2025)["events"] == []  # opened in 2025, realized in 2026
    open_only = calculate_tax_report(trades[:1], "fifo", None)
    assert open_only["events"] == [] and open_only["summary"]["open_short_quantity"] == 2


def test_sell_beyond_long_flips_and_fees_split_pro_rata():
    trades = [T("buy", 1, 100, "2026-01-01"), T("sell", 3, 120, "2026-02-01", fee=3), T("buy", 2, 110, "2026-03-01")]
    r = calculate_tax_report(trades, "fifo", 2026)
    long_e, short_e = r["events"]
    assert long_e["type"] == "long" and long_e["proceeds"] == 119 and long_e["gain_loss"] == 19
    assert short_e["type"] == "short" and short_e["quantity"] == 2 and short_e["proceeds"] == 238
    assert short_e["cost_basis"] == 220 and short_e["gain_loss"] == 18


def test_cover_follows_fifo_or_lifo():
    trades = [T("sell", 1, 100, "2026-01-01"), T("sell", 1, 150, "2026-02-01"), T("buy", 1, 120, "2026-03-01")]
    assert calculate_tax_report(trades, "fifo", 2026)["events"][0]["proceeds"] == 100
    lifo = calculate_tax_report(trades, "lifo", 2026)["events"][0]
    assert lifo["proceeds"] == 150 and lifo["open_date"] == "2026-02-01" and lifo["gain_loss"] == 30


def test_multiplier_applies_to_both_sides():
    trades = [T("sell", 1, 2000, "2026-01-01", iid="commodity:GC", fee=5),
              T("buy", 1, 1990, "2026-01-05", iid="commodity:GC", fee=5)]
    e = calculate_tax_report(trades, "fifo", 2026, {"commodity:GC": 100})["events"][0]
    assert e["gain_loss"] == 10 * 100 - 10


def test_invalid_trades_are_counted_not_reported_as_shorts():
    r = calculate_tax_report([T("sell", 0, 100, "2026-01-01"), T("hold", 1, 100, "2026-01-01"),
                              T("buy", 1, 0, "2026-01-01")], "fifo", None)
    assert r["events"] == [] and r["summary"]["skipped_trades"] == 3


def test_portfolios_are_replayed_separately():
    # A sale in one portfolio must not close another portfolio's long: it opens a short there
    trades = [T("buy", 1, 100, "2026-01-01", pid="a"), T("sell", 1, 90, "2026-02-01", pid="b")]
    r = calculate_tax_report(trades, "fifo", None)
    assert r["events"] == [] and r["summary"]["open_short_quantity"] == 1


def _mixed_history():
    return [
        T("buy", 2, 100, "2025-01-01", fee=1, n=1),
        T("sell", 5, 130, "2025-02-01", fee=2.5, n=2),   # closes long 2, opens short 3
        T("sell", 1, 140, "2025-03-01", fee=0.5, n=3),   # adds to the short
        T("buy", 4, 110, "2026-01-15", fee=4, n=4),      # covers the short
        T("sell", 2, 2050, "2025-05-01", iid="commodity:GC", fee=6, n=5),
        T("buy", 1, 2000, "2025-06-01", iid="commodity:GC", fee=3, n=6),
        T("buy", 3, 1980, "2025-07-01", iid="commodity:GC", fee=9, n=7),  # covers 1, opens long 2
        T("sell", 2, 2100, "2026-03-01", iid="commodity:GC", fee=6, n=8),
    ]


@pytest.mark.parametrize("method", ["fifo", "lifo"])
def test_tax_net_matches_trades_realized_pnl(method):
    trades, mult = _mixed_history(), {"commodity:GC": 100.0}
    realized = sum(p["realized"] for p in replay(trades, mult).values())
    net = calculate_tax_report(trades, method, None, mult)["summary"]["net"]
    assert net == pytest.approx(realized, abs=0.05)
    by_year = sum(calculate_tax_report(trades, method, y, mult)["summary"]["net"] for y in (2025, 2026))
    assert by_year == pytest.approx(net, abs=0.05)


def _call(router, prefix, method, path, **kw):
    app = FastAPI()

    @app.middleware("http")
    async def fake_auth(request: Request, call_next):
        request.state.user = {"sub": "tester"}
        return await call_next(request)

    app.include_router(router, prefix=prefix)

    async def go():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            return await c.request(method, path, **kw)
    return asyncio.run(go())


def test_api_report_agrees_with_trades_service_across_portfolios():
    from api.tax import router
    from services import portfolios, trades
    default = portfolios.default_id("tester")
    other = portfolios.create("tester", "Other")["id"]
    for t in _mixed_history():
        trades.add_trade("tester", t["instrument_id"], t["side"], t["price"], t["quantity"], date=t["date"],
                         fee=t["fee"], portfolio_id=default)
    trades.add_trade("tester", "crypto:BTC", "sell", 50, 1, date="2025-04-01", fee=1, portfolio_id=other)
    trades.add_trade("tester", "crypto:BTC", "buy", 40, 1, date="2026-04-01", fee=1, portfolio_id=other)

    r = _call(router, "/api/tax", "GET", "/api/tax/report", headers={"X-Portfolio": "all"})
    assert r.status_code == 200, r.text
    expected = asyncio.run(trades.portfolio("tester"))["totals"]["realized_pnl"]
    assert r.json()["summary"]["net"] == pytest.approx(expected, abs=0.05)
    csv_text = _call(router, "/api/tax", "GET", "/api/tax/export", params={"year": 2026}).text
    assert csv_text.splitlines()[0].endswith("type,open_date,close_date,holding_days") and ",short," in csv_text


def test_csv_has_type_column():
    report = calculate_tax_report([T("sell", 1, 100, "2026-01-01"), T("buy", 1, 90, "2026-01-02")], "fifo", 2026)
    lines = export_csv(report).splitlines()
    assert lines[0].startswith("coin_id,sell_date") and "short" in lines[1]
