"""Simulated CME offset-futures exchange: matching, risk checks, P&L, and the trading API."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from services.carbon_exchange import (
    SimulatedVenue, Order, CONTRACT_SIZE, FEE_PER_CONTRACT, MAX_ORDER_QTY, _listed_expiries,
)
from datetime import date


@pytest.fixture
def venue():
    v = SimulatedVenue(seed=42)
    sym = next(iter(v.instruments))
    inst = v.instruments[sym]
    # Replace the simulated book with a known, quiet one.
    inst.bids.clear(), inst.asks.clear(), inst.stops.clear()
    inst.last = 1.20
    for side, price, qty in (("BUY", 1.19, 10), ("BUY", 1.18, 20), ("SELL", 1.21, 10), ("SELL", 1.22, 20)):
        v.submit("@mm", sym, side, qty, "LMT", "GTC", price)
    return v, sym


def test_listed_expiries_are_next_four_quarterlies():
    assert _listed_expiries(date(2026, 10, 30)) == [(2026, 12), (2027, 3), (2027, 6), (2027, 9)]
    assert _listed_expiries(date(2026, 12, 5)) == [(2027, 3), (2027, 6), (2027, 9), (2027, 12)]


def test_symbols_follow_cme_month_codes():
    v = SimulatedVenue(seed=1)
    assert {s[:3] for s in v.instruments} == {"GEO", "NGO", "CGO"}
    assert all(s[3] in "HMUZ" for s in v.instruments)


def test_market_order_sweeps_levels_at_resting_prices(venue):
    v, sym = venue
    o = v.submit("alice", sym, "BUY", 15, "MKT", "IOC")
    assert o["status"] == "FILLED"
    assert o["avg_fill"] == pytest.approx((10 * 1.21 + 5 * 1.22) / 15, abs=1e-4)   # API rounds to 4 dp
    pos = v.account("alice")["positions"][0]
    assert pos["qty"] == 15 and pos["offsets"] == 15 * CONTRACT_SIZE


def test_limit_order_rests_then_fills_with_price_time_priority(venue):
    v, sym = venue
    first = v.submit("alice", sym, "BUY", 5, "LMT", "DAY", 1.20)
    second = v.submit("bob", sym, "BUY", 5, "LMT", "DAY", 1.20)
    assert first["status"] == second["status"] == "WORKING"
    v.submit("@flow", sym, "SELL", 5, "MKT", "IOC")
    assert v.account("alice")["positions"][0]["qty"] == 5     # earlier order filled first
    assert v.account("bob")["working_orders"][0]["remaining"] == 5


def test_ioc_and_fok_never_rest(venue):
    v, sym = venue
    ioc = v.submit("alice", sym, "BUY", 15, "LMT", "IOC", 1.21)
    assert ioc["filled"] == 10 and ioc["status"] == "CANCELLED"
    fok = v.submit("bob", sym, "BUY", 100, "LMT", "FOK", 1.22)
    assert fok["filled"] == 0 and fok["status"] == "CANCELLED"
    assert not v.account("alice")["working_orders"]


def test_stop_order_triggers_on_trade_through(venue):
    v, sym = venue
    stop = v.submit("alice", sym, "SELL", 3, "STP", "DAY", stop=1.19)
    assert stop["status"] == "PENDING"
    v.submit("@flow", sym, "SELL", 10, "MKT", "IOC")       # trades at 1.19 → elects the stop
    hist = {o["id"]: o for o in v.account("alice")["order_history"]}
    assert hist[stop["id"]]["status"] == "FILLED"
    assert v.account("alice")["positions"][0]["qty"] == -3


@pytest.mark.parametrize("kwargs,reason", [
    ({"side": "BUY", "qty": 0, "type": "MKT"}, "Quantity"),
    ({"side": "BUY", "qty": MAX_ORDER_QTY + 1, "type": "MKT"}, "Quantity"),
    ({"side": "BUY", "qty": 1, "type": "LMT"}, "Limit price required"),
    ({"side": "BUY", "qty": 1, "type": "LMT", "price": 2.00}, "price band"),
    ({"side": "BUY", "qty": 1, "type": "STP", "stop": 1.10}, "Buy stop must be above"),
    ({"side": "HOLD", "qty": 1, "type": "MKT"}, "Side"),
])
def test_rejections(venue, kwargs, reason):
    v, sym = venue
    o = v.submit("alice", sym, tif="DAY", **kwargs)
    assert o["status"] == "REJECTED" and reason in o["reason"]


def test_unknown_instrument_rejected(venue):
    v, _ = venue
    assert v.submit("alice", "XYZZ9", "BUY", 1, "MKT", "IOC")["reason"].startswith("Unknown instrument")


def test_margin_check_blocks_oversized_positions(venue):
    v, sym = venue
    v.account_for("alice").cash = 1_000
    o = v.submit("alice", sym, "BUY", 10, "LMT", "DAY", 1.19)
    assert o["status"] == "REJECTED" and "buying power" in o["reason"]


def test_round_trip_pnl_and_fees(venue):
    v, sym = venue
    v.submit("alice", sym, "BUY", 10, "MKT", "IOC")                 # lifts the offer: 10 @ 1.21
    v.submit("alice", sym, "SELL", 10, "MKT", "IOC")                # hits the bid:    10 @ 1.19
    a = v.account("alice")
    expected = (1.19 - 1.21) * 10 * CONTRACT_SIZE                   # crossing the spread costs $200
    assert a["positions"][0]["realized_pnl"] == pytest.approx(expected)
    assert a["fees"] == pytest.approx(20 * FEE_PER_CONTRACT)
    assert a["positions"][0]["qty"] == 0 and a["margin_used"] == 0


def test_cancel_and_flatten(venue):
    v, sym = venue
    o = v.submit("alice", sym, "BUY", 2, "LMT", "GTC", 1.15)
    assert v.cancel("alice", o["id"])["status"] == "CANCELLED"
    assert "error" in v.cancel("alice", o["id"])
    v.submit("alice", sym, "BUY", 4, "MKT", "IOC")
    assert v.flatten("alice", sym)["status"] == "FILLED"
    assert v.account("alice")["positions"][0]["qty"] == 0


def test_market_steps_without_error_and_trades():
    v = SimulatedVenue(seed=3)
    before = sum(i.volume for i in v.instruments.values())
    for _ in range(50):
        v._last_step -= 0.5
        v.step()
    assert sum(i.volume for i in v.instruments.values()) > before
    for i in v.instruments.values():
        assert i.best_bid() < i.best_ask()                         # never crossed


def test_candles_aggregate():
    v = SimulatedVenue(seed=5)
    sym = next(iter(v.instruments))
    one = v.candles(sym, 1, limit=1000)
    five = v.candles(sym, 5, limit=1000)
    assert len(five) < len(one)
    assert sum(c["v"] for c in five) == sum(c["v"] for c in one)


# ── API ─────────────────────────────────────────────────────────────────

def _h(token):
    return {"Authorization": f"Bearer {token}"}


async def test_trading_api_round_trip(client: AsyncClient, auth_token: str):
    specs = (await client.get("/api/trading/specs", headers=_h(auth_token))).json()
    assert {p["product"] for p in specs["products"]} == {"GEO", "NGO", "CGO"}
    sym = specs["products"][0]["listed"][0]

    r = await client.post("/api/trading/orders", headers=_h(auth_token),
                          json={"symbol": sym, "side": "BUY", "qty": 2, "type": "MKT", "tif": "IOC"})
    assert r.status_code == 200 and r.json()["filled"] == 2

    r = await client.post("/api/trading/orders", headers=_h(auth_token),
                          json={"symbol": sym, "side": "BUY", "qty": 2, "type": "LMT", "price": 99})
    assert r.status_code == 400 and "price band" in r.json()["reason"]

    acct = (await client.get("/api/trading/account", headers=_h(auth_token))).json()
    assert any(p["symbol"] == sym and p["qty"] >= 2 for p in acct["positions"])

    assert (await client.post(f"/api/trading/positions/{sym}/flatten", headers=_h(auth_token))).status_code == 200
    assert (await client.delete("/api/trading/orders/999999", headers=_h(auth_token))).status_code == 400
    assert (await client.get("/api/trading/candles/NOPE", headers=_h(auth_token))).status_code == 404
    market = (await client.get("/api/trading/market?depth=5", headers=_h(auth_token))).json()
    assert market["simulated"] is True and len(market["quotes"]) == 12


async def test_trading_requires_auth(client: AsyncClient):
    assert (await client.get("/api/trading/account")).status_code == 401


async def test_corsia_obligation(client: AsyncClient, auth_token: str):
    flights = [{"callsign": f"T{i}", "category": "heavy"} for i in range(4)]
    with patch("api.trading.fetch_flights", new_callable=AsyncMock, return_value=flights):
        body = (await client.get("/api/trading/corsia-obligation", headers=_h(auth_token))).json()
    # 4 heavy × 0.5 h × 3500 kg/h × 3.16 = 22.12 t snapshot → ×(8760/0.5) annualised, ×10 % to offset
    assert body["tracked_flights"] == 4
    assert body["annualised_co2_tonnes"] == round(22.12 / 0.5 * 8760)
    assert body["required_offsets"] == round(22.12 / 0.5 * 8760 * 0.10)
    assert body["hedge_symbol"].startswith("GEO")
    assert body["contracts_to_hedge"] >= 1
