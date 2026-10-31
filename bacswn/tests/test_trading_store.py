"""Carbon Desk persistence: write-behind flush, restore after restart, expiry, failure requeue."""

from unittest.mock import patch

import pytest

from services import trading_store
from services.carbon_exchange import CONTRACT_SIZE, SimulatedVenue, STARTING_CASH
from services.database import get_db


def _front(v, product="GEO"):
    return next(s for s, i in v.instruments.items() if i.product == product)


async def _restart(old):
    """Save everything from `old`, then build a fresh venue from the store."""
    await trading_store.flush(old, market=True)
    new = SimulatedVenue(seed=99)
    restored = await trading_store.load(new)
    return new, restored


async def test_round_trip_restores_account_positions_orders_fills():
    v = SimulatedVenue(seed=1)
    sym = _front(v)
    assert v.submit("alice", sym, "BUY", 5, "MKT", "IOC")["status"] == "FILLED"
    bid = v.instruments[sym].best_bid()
    rest = v.submit("alice", sym, "BUY", 3, "LMT", "GTC", price=round((bid - 20) * 0.01, 2))
    assert rest["status"] == "WORKING"
    last = v.instruments[sym].last
    stop = v.submit("alice", sym, "SELL", 2, "STP", "GTC", stop=round(last * 0.9, 2))
    assert stop["status"] == "PENDING"
    before = v.account("alice")

    new, restored = await _restart(v)
    after = new.account("alice")
    assert restored["accounts"] == 1
    for k in ("cash", "fees", "realized_pnl"):
        assert after[k] == before[k]
    assert [(p["symbol"], p["qty"], p["avg_price"]) for p in after["positions"]] == \
        [(p["symbol"], p["qty"], p["avg_price"]) for p in before["positions"]]
    assert {o["id"] for o in after["working_orders"]} == {rest["id"], stop["id"]}
    assert after["fills"] == before["fills"]
    # The resting limit is back in the book and the stop is armed.
    inst = new.instruments[sym]
    assert any(o.id == rest["id"] for q in inst.bids.values() for o in q)
    assert [o.id for o in inst.stops] == [stop["id"]]
    # Order ids continue past the restored ones.
    nxt = new.submit("alice", sym, "BUY", 1, "MKT", "IOC")
    assert nxt["id"] > max(rest["id"], stop["id"])
    # A restored order can still be cancelled.
    assert new.cancel("alice", rest["id"])["status"] == "CANCELLED"


async def test_prices_and_charts_continue_across_restart():
    v = SimulatedVenue(seed=2)
    for _ in range(20):
        v.step()
    sym = _front(v)
    bars, last = v.candles(sym)[-5:], v.instruments[sym].last
    new, _ = await _restart(v)
    assert new.candles(sym)[-5:] == bars
    assert new.instruments[sym].last == last
    assert new._spot == pytest.approx(v._spot)


async def test_flush_writes_only_changes():
    v = SimulatedVenue(seed=3)
    sym = _front(v)
    v.submit("bob", sym, "BUY", 1, "MKT", "IOC")
    assert await trading_store.flush(v) > 0
    assert await trading_store.flush(v) == 0             # nothing changed since
    async with get_db() as db:
        n_orders = (await (await db.execute("SELECT COUNT(*) FROM trading_orders")).fetchone())[0]
        n_fills = (await (await db.execute("SELECT COUNT(*) FROM trading_fills")).fetchone())[0]
    assert n_orders == 1 and n_fills >= 1
    v.submit("bob", sym, "SELL", 1, "MKT", "IOC")
    await trading_store.flush(v)
    async with get_db() as db:
        rows = await (await db.execute("SELECT qty FROM trading_positions WHERE owner = 'bob'")).fetchall()
    assert [r[0] for r in rows] == [0]


async def test_resting_order_filled_by_market_while_running_is_saved():
    v = SimulatedVenue(seed=4)
    sym = _front(v)
    ask = v.instruments[sym].best_ask()
    o = v.submit("carol", sym, "SELL", 2, "LMT", "GTC", price=round((ask + 3) * 0.01, 2))
    await trading_store.flush(v)
    # Someone else lifts the offer: carol's account changes without carol acting.
    v.submit("@flow", sym, "BUY", 200, "MKT", "IOC")
    await trading_store.flush(v)
    new, _ = await _restart(v)
    hist = {x["id"]: x for x in new.account("carol")["order_history"]}
    assert hist[o["id"]]["status"] == "FILLED"
    assert new.account("carol")["positions"][0]["qty"] == -2


async def test_expired_contract_settles_and_cancels_on_restore():
    old_sym = "GEOH0"                                    # long-expired March contract
    state = {
        "accounts": [("dave", STARTING_CASH, 0.0, STARTING_CASH)],
        "positions": [("dave", old_sym, 2, 1.00, 0.0)],
        "instruments": [(old_sym, 1.0, 1.0, 1.2, 0.9, 1.10, 1, 10, 100)],
        "orders": [(7, "dave", old_sym, "BUY", 1, "LMT", "GTC", 100, None, 0, 0.0, "WORKING", "", 0.0, 0.0)],
    }
    v = SimulatedVenue(seed=5)
    restored = v.restore(state)
    assert restored["expired_positions_settled"] == 1 and restored["expired_orders_cancelled"] == 1
    acct = v.account("dave")
    assert acct["cash"] == pytest.approx(STARTING_CASH + 0.10 * 2 * CONTRACT_SIZE)
    assert acct["positions"] == []
    assert acct["fills"][0]["liquidity"] == "EXPIRY"
    assert acct["order_history"][0]["status"] == "CANCELLED"
    assert acct["order_history"][0]["reason"] == "Contract expired"
    # The settlement is persisted, and the stale position row is removed.
    await trading_store.flush(v)
    async with get_db() as db:
        pos = await (await db.execute("SELECT * FROM trading_positions WHERE owner = 'dave'")).fetchall()
        fills = await (await db.execute("SELECT liquidity FROM trading_fills WHERE owner = 'dave'")).fetchall()
    assert pos == [] and [f[0] for f in fills] == ["EXPIRY"]


async def test_failed_write_is_requeued_not_lost():
    v = SimulatedVenue(seed=6)
    sym = _front(v)
    v.submit("erin", sym, "BUY", 1, "MKT", "IOC")
    with patch("services.trading_store.get_db", side_effect=RuntimeError("disk full")):
        with pytest.raises(RuntimeError):
            await trading_store.flush(v, market=True)
    assert await trading_store.flush(v, market=True) > 0  # retried in full
    new, _ = await _restart(v)
    assert new.account("erin")["positions"][0]["qty"] == 1
    assert len(new.account("erin")["fills"]) == len(v.account("erin")["fills"])


async def test_load_on_empty_store_keeps_fresh_market():
    v = SimulatedVenue(seed=7)
    sym = _front(v)
    bars = len(v.candles(sym, limit=10_000))
    restored = await trading_store.load(v)
    assert restored["accounts"] == 0
    assert len(v.candles(sym, limit=10_000)) == bars
