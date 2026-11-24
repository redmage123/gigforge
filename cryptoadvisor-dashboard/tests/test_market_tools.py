"""Market tool pages: order book, liquidations, DCA calculator, DCA plans, exchanges, tax report.

No network: every provider call is stubbed.
"""

import asyncio
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi import FastAPI, Request  # noqa: E402

from services.market import registry  # noqa: E402
from services.market.models import Instrument  # noqa: E402

D = 86_400_000


@pytest.fixture(autouse=True)
def world():
    registry.load_for_tests([
        Instrument("crypto:BTC", "crypto", "BTC", "Bitcoin", {"binance": "BTCUSDT"}),
        Instrument("crypto:HYPE", "crypto", "HYPE", "Hyperliquid", {"binance_perp": "HYPEUSDT"}),
        Instrument("stock:AAPL", "stock", "AAPL", "Apple Inc.", {"yahoo": "AAPL"}, sessions="us_equity"),
    ])
    from services import orderbook
    orderbook._cache.clear()
    yield


def client_for(router, prefix, user="tester"):
    app = FastAPI()

    @app.middleware("http")
    async def fake_auth(request: Request, call_next):
        request.state.user = {"sub": user}
        return await call_next(request)

    app.include_router(router, prefix=prefix)
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


def call(router, prefix, method, path, **kw):
    async def go():
        async with client_for(router, prefix) as c:
            return await c.request(method, path, **kw)
    return asyncio.run(go())


# ── Order book ──────────────────────────────────────────────────────────────

DEPTH = {"lastUpdateId": 1,
         "bids": [["99.0", "2"], ["100.0", "1.5"], ["98.0", "0"]],
         "asks": [["101.0", "3"], ["100.5", "1"]]}


def test_parse_depth_spread_and_mid():
    from services.orderbook import parse_depth
    b = parse_depth(DEPTH, 20)
    assert [lv["price"] for lv in b["bids"]] == [100.0, 99.0]  # best first, zero-size level dropped
    assert [lv["price"] for lv in b["asks"]] == [100.5, 101.0]
    assert b["best_bid"] == 100.0 and b["best_ask"] == 100.5
    assert b["spread"] == pytest.approx(0.5) and b["mid_price"] == pytest.approx(100.25)
    assert b["spread_pct"] == pytest.approx(0.5 / 100.25 * 100)
    empty = parse_depth({"bids": [], "asks": DEPTH["asks"]}, 20)
    assert empty["spread"] is None and empty["mid_price"] is None


def test_orderbook_api_maps_instrument_and_falls_back_host():
    from api.orderbook import router
    calls = []

    async def fake_get(self, url, params=None, **kw):
        calls.append((url, params))
        if "api.binance.com" in url:
            raise httpx.ConnectError("blocked")
        return httpx.Response(200, json=DEPTH, request=httpx.Request("GET", url))

    with patch.object(httpx.AsyncClient, "get", fake_get):
        r = call(router, "/api/orderbook", "GET", "/api/orderbook/", params={"coin": "bitcoin", "depth": 1})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["pair"] == "BTCUSDT" and body["instrument_id"] == "crypto:BTC"
        assert len(body["bids"]) == 1 and body["mid_price"] == pytest.approx(100.25)
        assert calls[-1][0] == "https://data-api.binance.vision/api/v3/depth"
        assert calls[-1][1] == {"symbol": "BTCUSDT", "limit": 100}
        # Cached for a few seconds: no new request
        n = len(calls)
        call(router, "/api/orderbook", "GET", "/api/orderbook/", params={"instrument": "crypto:BTC"})
        assert len(calls) == n


def test_orderbook_errors_are_readable():
    from api.orderbook import router

    async def down(self, url, params=None, **kw):
        raise httpx.ConnectError("down")

    with patch.object(httpx.AsyncClient, "get", down):
        r = call(router, "/api/orderbook", "GET", "/api/orderbook/", params={"instrument": "crypto:BTC"})
        assert r.status_code == 502 and "unavailable" in r.json()["error"]
    r = call(router, "/api/orderbook", "GET", "/api/orderbook/", params={"instrument": "crypto:HYPE"})
    assert r.status_code == 404 and "no Binance spot market" in r.json()["error"]
    r = call(router, "/api/orderbook", "GET", "/api/orderbook/", params={"instrument": "stock:AAPL"})
    assert r.status_code == 404


# ── Liquidations ────────────────────────────────────────────────────────────

def test_parse_liquidation_event():
    from services.liquidations import parse_event
    msg = {"e": "forceOrder", "E": 1, "o": {"s": "BTCUSDT", "S": "SELL", "q": "0.5", "p": "59000", "ap": "60000",
                                             "z": "0.5", "T": 1_700_000_000_000}}
    ev = parse_event(msg)
    assert ev == {"symbol": "BTCUSDT", "side": "long", "quantity": 0.5, "price": 60000.0,
                  "usd_value": 30000.0, "time_ms": 1_700_000_000_000}
    assert parse_event({"o": {**msg["o"], "S": "BUY"}})["side"] == "short"
    assert parse_event({"o": {"s": "X"}}) is None and parse_event({"bad": 1}) is None


def test_liquidations_window_summary_and_api():
    from api.liquidations import router
    from services import liquidations as liq
    liq._reset_for_tests()
    now_ms = int(time.time() * 1000)
    liq.record({"symbol": "OLDUSDT", "side": "long", "quantity": 1, "price": 1, "usd_value": 999.0,
                "time_ms": now_ms - 25 * 3600 * 1000})  # outside the 24 h window
    liq.record({"symbol": "BTCUSDT", "side": "long", "quantity": 1, "price": 300, "usd_value": 300.0, "time_ms": now_ms - 1000})
    liq.record({"symbol": "ETHUSDT", "side": "short", "quantity": 1, "price": 100, "usd_value": 100.0, "time_ms": now_ms})
    liq._state["started_at"] = time.time() - 600
    started = []
    with patch.object(liq, "ensure_collector", lambda: started.append(1)):
        s = call(router, "/api/liquidations", "GET", "/api/liquidations/summary").json()
        rows = call(router, "/api/liquidations", "GET", "/api/liquidations/").json()
    assert started  # the page view starts the collector lazily
    assert s["count"] == 2 and s["total_long_usd"] == 300.0 and s["total_short_usd"] == 100.0
    assert s["long_pct"] == 75.0 and s["most_liquidated_symbol"] == "BTCUSDT" and s["largest"]["usd_value"] == 300.0
    assert 0.15 < s["status"]["covered_hours"] < 0.2 and s["status"]["window_hours"] == 24
    assert [r["symbol"] for r in rows["liquidations"]] == ["ETHUSDT", "BTCUSDT"]
    liq._reset_for_tests()
    empty = liq.summarize([])
    assert empty["count"] == 0 and empty["long_pct"] is None and empty["largest"] is None


# ── DCA calculator ──────────────────────────────────────────────────────────

T0 = int(datetime(2026, 1, 31, tzinfo=timezone.utc).timestamp() * 1000)


def test_dca_schedule_uses_calendar_intervals():
    from services.dca import schedule
    weekly = schedule(T0, T0 + 20 * D, "weekly")
    assert [(t - T0) // D for t in weekly] == [0, 7, 14]
    monthly = [datetime.fromtimestamp(t / 1000, tz=timezone.utc).date().isoformat()
               for t in schedule(T0, T0 + 70 * D, "monthly")]
    assert monthly == ["2026-01-31", "2026-02-28", "2026-03-31"]


def test_dca_weekly_on_hourly_data_buys_every_7_days():
    from services.dca import simulate
    hourly = [[T0 + h * 3_600_000, 100.0 + h * 0.1] for h in range(24 * 21)]  # 21 days of hourly points
    r = simulate(hourly, "weekly", 50)
    assert r["num_buys"] == 3  # days 0, 7, 14: not every 7 hourly points
    assert r["first_buy_date"] == "2026-01-31" and r["last_buy_date"] == "2026-02-14"
    assert r["total_invested"] == 150
    assert len(r["chart_data"]) == 21 and r["chart_data"][0]["date"] == "2026-01-31"
    last = r["chart_data"][-1]
    assert {"date", "value", "lump_sum_value", "invested"} <= set(last)
    assert last["lump_sum_value"] == pytest.approx(150 / 100.0 * hourly[-1][1], abs=0.01)
    assert last["invested"] == 150


def test_dca_api_post_and_errors():
    from api.dca import router
    daily = [[T0 + d * D, 100.0 + d] for d in range(40)]

    async def chart(coin_id, days):
        return {"prices": daily}

    with patch("services.dca.get_market_chart", chart):
        r = call(router, "/api/dca", "POST", "/api/dca/backtest",
                 json={"coin": "bitcoin", "frequency": "monthly", "amount": 100, "days": 40})
        assert r.status_code == 200, r.text
        assert r.json()["num_buys"] == 2 and r.json()["chart_data"][-1]["date"] == "2026-03-11"
        bad = call(router, "/api/dca", "POST", "/api/dca/backtest", json={"coin": "bitcoin", "days": 9999})
        assert bad.status_code == 400 and "365" in bad.json()["error"]

    async def limited(coin_id, days):
        req = httpx.Request("GET", "https://api.coingecko.com/x")
        raise httpx.HTTPStatusError("429", request=req, response=httpx.Response(429, request=req))

    with patch("services.dca.get_market_chart", limited):
        r = call(router, "/api/dca", "POST", "/api/dca/backtest", json={"coin": "bitcoin", "days": 30})
        assert r.status_code == 502 and "rate limited" in r.json()["error"]


# ── DCA plans ───────────────────────────────────────────────────────────────

def test_dca_plans_create_list_delete():
    from api.dca_plans import router
    r = call(router, "/api/dca-plans", "POST", "/api/dca-plans/",
             json={"coin": "BTC", "exchange": "Binance", "amount_usd": 25, "frequency": "weekly"})
    assert r.status_code == 200, r.text
    plan = r.json()
    assert plan["amount_usd"] == 25 and plan["next_execution"]
    assert call(router, "/api/dca-plans", "POST", "/api/dca-plans/",
                json={"coin": "BTC", "exchange": "Binance", "amount": 25, "frequency": "weekly"}).status_code == 422
    rows = call(router, "/api/dca-plans", "GET", "/api/dca-plans/").json()
    assert rows[0]["plan_id"] == plan["plan_id"] and rows[0]["next_execution"]
    assert call(router, "/api/dca-plans", "DELETE", f"/api/dca-plans/{plan['plan_id']}").status_code == 200
    assert call(router, "/api/dca-plans", "DELETE", f"/api/dca-plans/{plan['plan_id']}").status_code == 404


def test_dca_next_execution_and_simulated_buy():
    from services.dca_automation import execute_dca_buy, next_execution
    now = datetime(2026, 3, 10, tzinfo=timezone.utc)
    plan = {"status": "active", "start_date": "2026-03-01", "frequency": "weekly",
            "last_executed": "2026-03-08T00:00:00+00:00"}
    assert next_execution(plan, now) == "2026-03-15T00:00:00+00:00"
    assert next_execution({**plan, "status": "paused"}, now) is None
    ev = asyncio.run(execute_dca_buy({"coin": "BTC", "exchange": "binance", "amount_usd": 10}))
    assert ev["status"] == "simulated"


# ── Exchanges ───────────────────────────────────────────────────────────────

def test_exchanges_connect_status_and_remove():
    from api.exchanges import router
    from services import exchanges
    r = call(router, "/api/exchanges", "POST", "/api/exchanges/",
             json={"name": "binance", "label": "Main", "api_key": "k", "api_secret": "s"})
    assert r.status_code == 200 and "s" not in r.json().values()
    assert call(router, "/api/exchanges", "POST", "/api/exchanges/",
                json={"name": "binance", "api_key": "k", "secret": "s"}).status_code == 422
    assert call(router, "/api/exchanges", "POST", "/api/exchanges/",
                json={"name": "kraken", "api_key": "k", "api_secret": "s"}).status_code == 422
    listed = call(router, "/api/exchanges", "GET", "/api/exchanges/").json()
    assert listed == [{"id": 0, "name": "binance", "label": "Main"}]  # no keys sent back

    async def ok(key, secret):
        return [{"asset": "BTC", "free": 1.0, "locked": 0.0, "total": 1.0}]

    async def rejected(key, secret):
        req = httpx.Request("GET", "https://api.binance.com/api/v3/account?signature=abc")
        raise httpx.HTTPStatusError("401", request=req, response=httpx.Response(401, request=req))

    with patch.object(exchanges, "_binance_balances", ok):
        bal = call(router, "/api/exchanges", "GET", "/api/exchanges/balances").json()
        assert bal[0]["id"] == 0 and bal[0]["status"] == "connected"
    with patch.object(exchanges, "_binance_balances", rejected):
        bal = call(router, "/api/exchanges", "GET", "/api/exchanges/balances").json()
        assert bal[0]["status"] == "error" and "rejected the API key" in bal[0]["error"]
        assert "signature" not in bal[0]["error"]
    assert call(router, "/api/exchanges", "DELETE", "/api/exchanges/0").status_code == 200
    assert call(router, "/api/exchanges", "GET", "/api/exchanges/").json() == []


# ── Tax report ──────────────────────────────────────────────────────────────

def _t(side, qty, price, date, fee=0.0, iid="crypto:BTC"):
    return {"instrument_id": iid, "side": side, "quantity": qty, "price": price, "date": date, "fee": fee}


def test_tax_cost_basis_uses_earlier_years_and_filters_sales_by_year():
    from services.tax import calculate_tax_report
    trades = [
        _t("buy", 1, 100, "2024-03-01"),
        _t("buy", 1, 200, "2025-06-01"),
        _t("sell", 1, 300, "2025-12-01"),  # FIFO: matched against the 2024 buy
        _t("sell", 1, 150, "2026-02-01", fee=10),  # FIFO: the 2025 buy
    ]
    r = calculate_tax_report(trades, "fifo", 2026)
    assert len(r["events"]) == 1
    e = r["events"][0]
    assert e["buy_date"] == "2025-06-01" and e["cost_basis"] == 200 and e["proceeds"] == 140 and e["gain_loss"] == -60
    assert r["summary"]["net"] == -60 and r["summary"]["total_losses"] == 60
    r25 = calculate_tax_report(trades, "fifo", 2025)
    assert [x["gain_loss"] for x in r25["events"]] == [200]


def test_tax_lifo_only_uses_buys_before_the_sale():
    from services.tax import calculate_tax_report
    trades = [_t("buy", 1, 100, "2026-01-01"), _t("buy", 1, 120, "2026-02-01"),
              _t("sell", 1, 130, "2026-03-01"), _t("buy", 1, 500, "2026-04-01")]
    r = calculate_tax_report(trades, "lifo", 2026)
    assert [e["cost_basis"] for e in r["events"]] == [120]  # not the later 500 buy
    orphan = calculate_tax_report([_t("sell", 2, 10, "2026-01-01")], "fifo", 2026)
    assert orphan["events"] == [] and orphan["summary"]["unmatched_quantity"] == 2


def test_tax_api_follows_portfolio_scope():
    from api.tax import router
    from services import portfolios, trades
    default = portfolios.default_id("tester")
    other = portfolios.create("tester", "Other")["id"]
    trades.add_trade("tester", "crypto:BTC", "buy", 100, 1, date="2025-01-01", portfolio_id=default)
    trades.add_trade("tester", "crypto:BTC", "sell", 150, 1, date="2026-01-05", portfolio_id=default)
    trades.add_trade("tester", "crypto:BTC", "buy", 100, 1, date="2025-01-01", portfolio_id=other)
    trades.add_trade("tester", "crypto:BTC", "sell", 90, 1, date="2026-01-05", portfolio_id=other)

    def net(scope):
        r = call(router, "/api/tax", "GET", "/api/tax/report", params={"year": 2026}, headers={"X-Portfolio": scope})
        assert r.status_code == 200, r.text
        return r.json()["summary"]["net"]

    assert net(default) == 50 and net(other) == -10 and net("all") == 40
    bad = call(router, "/api/tax", "GET", "/api/tax/report", params={"method": "hifo"})
    assert bad.status_code == 400
    csv_text = call(router, "/api/tax", "GET", "/api/tax/export", params={"year": 2026}).text
    assert csv_text.startswith("coin_id,sell_date") and csv_text.count("crypto:BTC") == 2
