"""Broker connections: provider mapping, dedup, Alpaca sync with paging, encryption, cleanup."""

import asyncio
import json
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402

from services import brokers  # noqa: E402
from services.market import registry  # noqa: E402
from services.market.models import Instrument  # noqa: E402
from tests.conftest import requires_pg  # noqa: E402


@pytest.fixture(autouse=True)
def world():
    registry.load_for_tests([
        Instrument("stock:AAPL", "stock", "AAPL", "Apple Inc.", {"yahoo": "AAPL"}, sessions="us_equity"),
        Instrument("etf:SPY", "etf", "SPY", "SPDR S&P 500", {"yahoo": "SPY"}, sessions="us_equity"),
        Instrument("stock:BRK-B", "stock", "BRK-B", "Berkshire B", {"yahoo": "BRK-B"}, sessions="us_equity"),
        Instrument("crypto:BTC", "crypto", "BTC", "Bitcoin", {"binance": "BTCUSDT"}),
    ])


ALPACA = [
    {"id": "20261101::a1", "activity_type": "FILL", "transaction_time": "2026-11-01T14:30:00Z", "type": "fill", "price": "220.5",
     "qty": "10", "side": "buy", "symbol": "AAPL", "order_id": "o1"},
    {"id": "20261102::a2", "activity_type": "FILL", "transaction_time": "2026-11-02T15:00:00Z", "type": "fill", "price": "70000",
     "qty": "0.01", "side": "sell", "symbol": "BTC/USD"},
    {"id": "20261103::a3", "activity_type": "DIV", "date": "2026-11-03", "net_amount": "4.12", "symbol": "AAPL"},
    {"id": "20261104::a4", "activity_type": "DIVNRA", "date": "2026-11-03", "net_amount": "-0.62", "symbol": "AAPL"},
    {"id": "20261105::a5", "activity_type": "CSD", "date": "2026-10-30", "net_amount": "5000"},
    {"id": "20261106::a6", "activity_type": "FILL", "transaction_time": "2026-11-06T15:00:00Z", "price": "5", "qty": "3",
     "side": "sell_short", "symbol": "ZZZZ"},
]


def test_map_alpaca():
    t, c = brokers.map_alpaca(ALPACA)
    assert [(x["symbol"], x["side"], x["quantity"], x["price"]) for x in t] == [
        ("AAPL", "buy", 10.0, 220.5), ("BTC/USD", "sell", 0.01, 70000.0), ("ZZZZ", "sell", 3.0, 5.0)]
    assert [(x["type"], x["amount"]) for x in c] == [("dividend", 4.12), ("fee", 0.62), ("deposit", 5000.0)]


def test_map_plaid():
    secs = [{"security_id": "s1", "ticker_symbol": "SPY", "type": "etf"}, {"security_id": "s2", "ticker_symbol": None, "type": "cash"}]
    txs = [{"investment_transaction_id": "t1", "security_id": "s1", "date": "2026-11-01", "type": "buy", "subtype": "buy",
            "quantity": 2, "price": 600, "amount": 1200, "fees": 1},
           {"investment_transaction_id": "t2", "security_id": "s2", "date": "2026-11-02", "type": "cash", "subtype": "deposit",
            "amount": -3000, "name": "ACH"},
           {"investment_transaction_id": "t3", "security_id": "s1", "date": "2026-11-03", "type": "cash", "subtype": "dividend", "amount": -7.5}]
    t, c = brokers.map_plaid(txs, secs)
    assert t == [{"symbol": "SPY", "kind": "etf", "side": "buy", "quantity": 2.0, "price": 600.0, "fee": 1.0,
                  "date": "2026-11-01", "external_id": "plaid:t1"}]
    assert [(x["type"], x["amount"]) for x in c] == [("deposit", 3000.0), ("dividend", 7.5)]


def test_map_snaptrade_and_signature():
    acts = [{"id": "x1", "type": "BUY", "symbol": {"symbol": "BRK.B", "type": {"code": "cs"}}, "units": 3, "price": 450,
             "fee": 0.5, "trade_date": "2026-11-01T00:00:00Z"},
            {"id": "x2", "type": "CONTRIBUTION", "amount": 1000, "trade_date": "2026-10-31T00:00:00Z", "description": "Deposit"}]
    t, c = brokers.map_snaptrade(acts)
    assert t[0]["symbol"] == "BRK.B" and brokers.instrument_for("BRK.B") == "stock:BRK-B"
    assert c == [{"type": "deposit", "amount": 1000.0, "date": "2026-10-31", "notes": "Deposit", "external_id": "snaptrade:x2"}]
    s1 = brokers.snap_signature("key", "/api/v1/accounts", "clientId=c&timestamp=1", None)
    assert s1 == brokers.snap_signature("key", "/api/v1/accounts", "clientId=c&timestamp=1", None)
    assert s1 != brokers.snap_signature("other", "/api/v1/accounts", "clientId=c&timestamp=1", None)


def test_instrument_mapping():
    assert brokers.instrument_for("SPY", "etf") == "etf:SPY" and brokers.instrument_for("AAPL") == "stock:AAPL"
    assert brokers.instrument_for("BTC/USD") == "crypto:BTC" and brokers.instrument_for("NOPE") is None


def test_apply_dedups_and_skips_unknown():
    t, c = brokers.map_alpaca(ALPACA)
    nt, nc, skipped = brokers.apply("u", "p1", "bc1", t, c)
    assert (nt, nc) == (2, 3) and skipped == ["ZZZZ: not an instrument AssetAdvisor knows"]
    assert brokers.apply("u", "p1", "bc1", t, c)[:2] == (0, 0)  # second sync adds nothing
    from services.trades import get_trades
    rows = get_trades("u")
    assert {r["external_id"] for r in rows} == {"alpaca:20261101::a1", "alpaca:20261102::a2"} and rows[0]["portfolio_id"] == "p1"


class FakeResp:
    def __init__(self, status, data):
        self.status_code, self._d = status, data

    def json(self):
        return self._d

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(self.status_code)


def fake_client(pages):
    calls = []

    class C:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, headers=None, params=None):
            calls.append((url, dict(params or {})))
            if url.endswith("/v2/account"):
                return FakeResp(200, {"account_number": "PA1234"})
            return FakeResp(200, pages.pop(0) if pages else [])
    return C, calls


@requires_pg
def test_alpaca_connect_sync_paging_and_encryption():
    from services import db, portfolios
    pid = portfolios.default_id("u")
    page1 = [dict(ALPACA[0], id=f"p{i}") for i in range(100)]
    client, calls = fake_client([page1, ALPACA[1:3]])
    with patch.object(brokers.httpx, "AsyncClient", client):
        conn = asyncio.run(brokers.connect_alpaca("u", pid, "AKID", "SECRET", True, "", "u"))
        out = asyncio.run(brokers.sync(conn["id"], "u"))
    assert out["ok"] and out["trades_added"] == 101 and out["cash_added"] == 1
    assert calls[-1][1]["page_token"] == "p99"  # second page follows the cursor
    with db.conn() as c:
        raw = c.execute("SELECT secret_enc, meta FROM broker_connections").fetchone()
    assert "SECRET" not in raw[0] and raw[1]["cursor"] == "20261103::a3"
    # Next sync continues from the cursor and adds nothing new
    client2, calls2 = fake_client([[]])
    with patch.object(brokers.httpx, "AsyncClient", client2):
        assert asyncio.run(brokers.sync(conn["id"], "u"))["trades_added"] == 0
    assert calls2[0][1]["page_token"] == "20261103::a3"
    # Bad key -> recorded on the connection, not raised
    class Denied(client2):
        async def get(self, *a, **k):
            return FakeResp(401, {})
    with patch.object(brokers.httpx, "AsyncClient", Denied):
        res = asyncio.run(brokers.sync(conn["id"], "u"))
    assert not res["ok"] and "no longer accepts" in res["message"]
    assert brokers.list_for("u")[0]["last_sync_ok"] is False


@requires_pg
def test_portfolio_deletion_drops_connection():
    from services import portfolios
    pid = portfolios.create("u", "Broker book")["id"]
    client, _ = fake_client([[]])
    with patch.object(brokers.httpx, "AsyncClient", client):
        asyncio.run(brokers.connect_alpaca("u", pid, "AKID", "SECRET", True, "", "u"))
    assert len(brokers.list_for("u")) == 1
    portfolios.delete("u", pid)
    assert brokers.list_for("u") == []
