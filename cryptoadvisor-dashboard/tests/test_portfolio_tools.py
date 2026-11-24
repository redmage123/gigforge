"""Portfolio tools: backtester, share links, saved wallet balances, on-chain activity. Network is stubbed."""

import json
import math
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx  # noqa: E402
import pytest  # noqa: E402

from services import onchain_pnl as op  # noqa: E402
from services import portfolio_backtest as bt  # noqa: E402
from services import share_portfolio as sp  # noqa: E402
from services import wallet_balances as wb  # noqa: E402
from services.market import registry  # noqa: E402
from services.market.models import Candle, Instrument, Quote  # noqa: E402

D0 = date(2025, 1, 6)  # a Monday
TODAY = D0 + timedelta(days=13)
ETH_ADDR = "0x" + "ab" * 20
OTHER = "0x" + "cd" * 20


def _ms(d: date) -> int:
    return int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp() * 1000)


def _candles(prices: dict[date, float]) -> list[Candle]:
    return [Candle(_ms(d), p, p, p, p, 0) for d, p in sorted(prices.items())]


@pytest.fixture(autouse=True)
def instruments():
    registry.load_for_tests([
        Instrument("crypto:BTC", "crypto", "BTC", "Bitcoin", {"binance": "BTCUSDT"}),
        Instrument("crypto:ETH", "crypto", "ETH", "Ethereum", {"binance": "ETHUSDT"}),
        Instrument("stock:AAPL", "stock", "AAPL", "Apple", {"yahoo": "AAPL"}, sessions="us_equity"),
        Instrument("fx:USDJPY", "fx", "USDJPY", "USD/JPY", {"yahoo": "JPY=X"}, currency="JPY", sessions="fx"),
    ])
    op._cache.clear()
    yield


def _client(router, prefix: str, user: str = "tester"):
    """App with the real auth + CSRF middleware; returns (client, headers) logged in as `user`."""
    from fastapi import FastAPI

    from middleware.auth import AuthMiddleware
    from middleware.csrf import CSRFMiddleware
    from services.auth import create_token

    app = FastAPI()
    app.add_middleware(CSRFMiddleware)
    app.add_middleware(AuthMiddleware)
    app.include_router(router, prefix=prefix)
    c = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
    c.cookies.set("access_token", create_token(user))
    c.cookies.set("csrf_token", "t" * 64)
    return c, {"X-CSRF-Token": "t" * 64}


# ── Backtest ───────────────────────────────────────────────────────────────

# BTC trades every day; AAPL only on weekdays. BTC doubles over 13 days with a dip; AAPL rises 10%.
BTC = {D0 + timedelta(days=i): p for i, p in enumerate([100, 120, 90, 110, 130, 150, 140, 160, 170, 180, 185, 190, 195, 200])}
AAPL = {d: 50 + i for i, d in enumerate(d for d in (D0 + timedelta(days=k) for k in range(14)) if d.weekday() < 5)}


@pytest.fixture
def candles(monkeypatch):
    calls = []

    async def fake(iid, tf, bars):
        calls.append((iid, tf, bars))
        if iid == "crypto:BTC":
            # two bars before the start date must be ignored
            return _candles({**BTC, D0 - timedelta(days=2): 1.0, D0 - timedelta(days=1): 1.0})
        if iid == "stock:AAPL":
            return _candles(AAPL)
        raise LookupError(iid)

    monkeypatch.setattr(bt.market, "candles", fake)
    return calls


def test_stats_return_drawdown_and_series():
    rows = [(f"2025-01-{d:02d}", p, p) for d, p in zip(range(1, 6), [100, 120, 90, 150, 135])]
    s = bt.stats(rows, 1000, 365)
    assert s["final_value"] == 1350 and s["total_return_pct"] == 35.0
    assert s["max_drawdown_pct"] == 25.0  # 120 -> 90
    assert s["series"][0] == {"date": "2025-01-01", "price": 100, "value": 1000.0}
    assert s["cagr_pct"] is None  # under a year: no annualized figure
    assert s["volatility_pct"] > 0


@pytest.mark.anyio
async def test_backtest_aligns_start_and_resolves_coingecko_ids(candles):
    out = await bt.backtest_portfolio("bitcoin", "stock:AAPL", D0, 10_000, today=TODAY)
    o, a = out["original"], out["alternative"]
    assert o["instrument_id"] == "crypto:BTC" and a["instrument_id"] == "stock:AAPL"
    assert out["effective_start"] == D0.isoformat() and o["start_date"] == D0.isoformat()
    assert o["final_value"] == 20_000.0 and o["total_return_pct"] == 100.0
    assert o["max_drawdown_pct"] == 25.0
    assert math.isclose(a["final_value"], 10_000 * 59 / 50, abs_tol=0.01)
    assert out["winner"] == "crypto:BTC"
    assert math.isclose(out["difference_usd"], a["final_value"] - o["final_value"], abs_tol=0.01)
    assert all(tf == "1d" for _, tf, _ in candles)


@pytest.mark.anyio
async def test_backtest_errors_are_readable(candles):
    with pytest.raises(bt.BacktestError, match="Unknown instrument"):
        await bt.backtest_portfolio("crypto:NOPE", "crypto:BTC", D0, 100, today=TODAY)
    with pytest.raises(bt.BacktestError, match="USD-priced"):
        await bt.backtest_portfolio("fx:USDJPY", "crypto:BTC", D0, 100, today=TODAY)
    with pytest.raises(bt.BacktestError, match="in the past"):
        await bt.backtest_portfolio("crypto:BTC", "stock:AAPL", TODAY, 100, today=TODAY)
    with pytest.raises(bt.BacktestError, match="No daily price history"):
        await bt.backtest_portfolio("crypto:ETH", "crypto:BTC", D0, 100, today=TODAY)


@pytest.mark.anyio
async def test_compare_each_and_equal_weight_basket(candles):
    out = await bt.compare(["crypto:BTC", "stock:AAPL", "bitcoin"], D0, 1000, today=TODAY)
    assert [r["instrument_id"] for r in out["results"]] == ["crypto:BTC", "stock:AAPL"]  # duplicates dropped
    assert out["best_performer"] == "crypto:BTC" and out["worst_performer"] == "stock:AAPL"
    basket = out["portfolio"]
    # 500 in each: BTC -> 1000, AAPL -> 500 * 59/50 on the last weekday, carried over the weekend
    assert math.isclose(basket["final_value"], 1000 + 500 * 59 / 50, abs_tol=0.01)
    assert basket["series"][0]["date"] == D0.isoformat()
    with pytest.raises(bt.BacktestError, match="between 2 and 10"):
        await bt.compare(["crypto:BTC", "bitcoin"], D0, 1000, today=TODAY)


@pytest.mark.anyio
async def test_backtest_api_accepts_page_payload(candles):
    from api.backtest import router

    c, h = _client(router, "/api/backtest")
    async with c:
        r = await c.post("/api/backtest/portfolio", headers=h, json={
            "original_coin": "crypto:BTC", "alternative_coin": "stock:AAPL", "start_date": D0.isoformat(), "amount_usd": 1000})
        assert r.status_code == 200 and r.json()["original"]["final_value"] > 0
        r = await c.post("/api/backtest/compare", headers=h, json={
            "coins": ["crypto:BTC", "stock:AAPL"], "start_date": D0.isoformat(), "amount_usd": 1000})
        assert r.status_code == 200 and len(r.json()["results"]) == 2
        r = await c.post("/api/backtest/portfolio", headers=h, json={
            "original_coin": "crypto:ETH", "alternative_coin": "crypto:BTC", "start_date": D0.isoformat(), "amount_usd": 1000})
        assert r.status_code == 400 and "No daily price history" in r.json()["detail"]
        r = await c.post("/api/backtest/portfolio", headers=h, json={
            "original_coin": "crypto:BTC", "alternative_coin": "crypto:ETH", "start_date": D0.isoformat(), "amount_usd": 0})
        assert r.status_code == 422


# ── Share links ────────────────────────────────────────────────────────────

POSITIONS = [
    {"symbol": "BTC", "name": "Bitcoin", "asset_class": "crypto", "quantity": 0.5, "side": "long",
     "market_value": 30_000.0, "cost_basis": 20_000.0, "unrealized_pnl": 10_000.0, "unrealized_pct": 50.0},
    {"symbol": "AAPL", "name": "Apple", "asset_class": "stock", "quantity": 100, "side": "long",
     "market_value": 10_000.0, "cost_basis": 12_000.0, "unrealized_pnl": -2_000.0, "unrealized_pct": -16.67},
    {"symbol": "XYZ", "name": "No price", "asset_class": "stock", "quantity": 5, "side": "long", "market_value": None},
]


def test_snapshot_keeps_only_what_the_owner_chose():
    snap = sp.build_snapshot(POSITIONS, show_values=False, show_returns=False)
    assert [h["symbol"] for h in snap["holdings"]] == ["BTC", "AAPL"]  # unpriced left out
    assert [h["weight_pct"] for h in snap["holdings"]] == [75.0, 25.0]
    assert "total_value" not in snap and all("value_usd" not in h and "return_pct" not in h for h in snap["holdings"])
    assert all("quantity" not in h for h in snap["holdings"])
    full = sp.build_snapshot(POSITIONS, show_values=True, show_returns=True)
    assert full["total_value"] == 40_000.0 and full["total_return_pct"] == 25.0
    with pytest.raises(sp.ShareError):
        sp.build_snapshot([POSITIONS[2]], True, True)


def test_share_lifecycle_and_public_view():
    snap = sp.build_snapshot(POSITIONS, show_values=False, show_returns=True)
    link = sp.create_share("alice", snap, "Long term <b>", False, True)
    token = link["token"]
    assert len(token) >= 32 and link["title"] == "Long term b"
    assert [s["token"] for s in sp.get_user_shares("alice")] == [token]
    assert sp.get_user_shares("bob") == []

    view = sp.get_shared_portfolio(token)
    assert "username" not in view and "alice" not in json.dumps(view)
    assert "total_value" not in view and view["total_return_pct"] == 25.0
    assert set(view["holdings"][0]) <= {"symbol", "name", "asset_class", "weight_pct", "return_pct", "side"}

    assert sp.get_shared_portfolio("not-a-token") is None
    assert sp.get_shared_portfolio(token[:-1] + ("A" if token[-1] != "A" else "B")) is None
    assert sp.revoke_share("bob", token) is False and sp.get_shared_portfolio(token)
    assert sp.revoke_share("alice", token) is True
    assert sp.get_shared_portfolio(token) is None and sp.get_user_shares("alice") == []


@pytest.mark.anyio
async def test_share_api_generate_view_revoke(monkeypatch):
    from api import share as share_api

    async def fake_portfolio(username, pids):
        return {"positions": POSITIONS}

    monkeypatch.setattr(share_api.trades, "portfolio", fake_portfolio)
    c, h = _client(share_api.router, "/api/share", user="alice")
    async with c:
        r = await c.post("/api/share/", headers=h, json={"title": "Mine", "show_values": True})
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        listed = (await c.get("/api/share/")).json()
        assert listed[0]["token"] == token and listed[0]["show_values"] is True

        # The public view needs no login
        anon = httpx.AsyncClient(transport=c._transport, base_url="http://test")
        async with anon:
            v = await anon.get(f"/api/share/view/{token}")
            assert v.status_code == 200 and v.json()["total_value"] == 40_000.0
            assert "return_pct" not in v.json()["holdings"][0]

            assert (await c.delete("/api/share/unknown-token-xxxxxxxxxxxx", headers=h)).status_code == 404
            assert (await c.delete(f"/api/share/{token}", headers=h)).status_code == 200
            gone = await anon.get(f"/api/share/view/{token}")
            assert gone.status_code == 404 and "revoked" in gone.json()["detail"]


# ── Wallet balances ────────────────────────────────────────────────────────

def test_address_validation():
    assert wb.validate(ETH_ADDR, "base") is None
    assert wb.validate("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", "bitcoin") is None
    assert wb.validate("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "solana") is None
    assert "valid" in wb.validate("0x123", "ethereum")
    assert "Unsupported" in wb.validate(ETH_ADDR, "dogechain")


def _mock_network(monkeypatch, handler):
    orig = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: orig(transport=httpx.MockTransport(handler), **kw))


async def _quotes(ids):
    px = {"crypto:ETH": 2000.0, "crypto:BTC": 50_000.0, "crypto:SOL": 100.0}
    return {i: Quote(i, px[i], 0, 0, 0, "test") for i in ids if i in px}


@pytest.mark.anyio
async def test_balances_from_public_sources(monkeypatch):
    def handler(req: httpx.Request):
        url = str(req.url)
        if url.endswith(f"/addresses/{ETH_ADDR}"):
            return httpx.Response(200, json={"coin_balance": str(2 * 10**18), "has_tokens": True})
        if f"/addresses/{ETH_ADDR}/tokens" in url:
            return httpx.Response(200, json={"items": [
                {"token": {"symbol": "USDC", "name": "USD Coin", "decimals": "6", "exchange_rate": "1.0",
                           "address_hash": "0xusdc", "reputation": "ok"}, "value": "2500000"},
                {"token": {"symbol": "SCAM", "decimals": "18", "exchange_rate": "999", "address_hash": "0xbad",
                           "reputation": "scam"}, "value": str(10**18)},
                {"token": {"symbol": "NOPX", "decimals": "18", "address_hash": "0xnopx", "reputation": "ok"}, "value": str(10**18)},
            ], "next_page_params": None})
        if "blockstream.info" in url:
            return httpx.Response(503)
        if "mempool.space" in url:
            return httpx.Response(200, json={"chain_stats": {"funded_txo_sum": 150_000_000, "spent_txo_sum": 50_000_000}})
        if req.method == "POST":
            body = json.loads(req.content)
            if body["method"] == "getBalance":
                return httpx.Response(200, json={"result": {"value": 3 * 10**9}})
            if "arb1" in url:
                return httpx.Response(500)  # first arbitrum endpoint down: falls back to the next
            return httpx.Response(200, json={"result": hex(10**18)})
        return httpx.Response(404)

    _mock_network(monkeypatch, handler)
    monkeypatch.setattr(wb.market, "quotes", _quotes)
    out = await wb.balances([
        {"label": "main", "address": ETH_ADDR, "chain": "ethereum"},
        {"label": "l2", "address": ETH_ADDR, "chain": "arbitrum"},
        {"label": "cold", "address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", "chain": "bitcoin"},
        {"label": "sol", "address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "chain": "solana"},
        {"label": "bad", "address": "nope", "chain": "ethereum"},
    ])
    eth, arb, btc, sol, bad = out["wallets"]
    assert eth["balance"] == 2 and eth["usd_value"] == 4000 and eth["tokens_usd"] == 2.5
    assert [t["symbol"] for t in eth["tokens"]] == ["USDC", "NOPX"] and eth["unpriced_tokens"] == 1
    assert arb["balance"] == 1 and arb["usd_value"] == 2000
    assert btc["balance"] == 1 and btc["usd_value"] == 50_000
    assert sol["balance"] == 3 and sol["usd_value"] == 300
    assert "valid" in bad["error"]
    assert out["total_usd"] == 4002.5 + 2000 + 50_000 + 300 and out["errors"] == 1


@pytest.mark.anyio
async def test_provider_failure_is_a_readable_error(monkeypatch):
    _mock_network(monkeypatch, lambda req: httpx.Response(502))
    monkeypatch.setattr(wb.market, "quotes", _quotes)
    out = await wb.balances([{"label": "x", "address": ETH_ADDR, "chain": "base"}])
    assert "did not respond" in out["wallets"][0]["error"] and out["total_usd"] == 0


@pytest.mark.anyio
async def test_wallet_api_saves_and_removes_by_address(monkeypatch):
    from api import wallet as wallet_api
    from services.user_data import load_user_data

    async def fake_balances(wallets):
        return {"wallets": wallets, "total_usd": 0, "errors": 0}

    monkeypatch.setattr(wallet_api.wallet_balances, "balances", fake_balances)
    c, h = _client(wallet_api.router, "/api/wallet", user="walt")
    async with c:
        assert (await c.post("/api/wallet/saved", headers=h, json={"label": "A", "address": ETH_ADDR, "chain": "ethereum"})).status_code == 200
        assert (await c.post("/api/wallet/saved", headers=h, json={"label": "B", "address": ETH_ADDR, "chain": "base"})).status_code == 200
        assert (await c.post("/api/wallet/saved", headers=h, json={"label": "A", "address": ETH_ADDR.upper().replace("0X", "0x"), "chain": "ethereum"})).status_code == 409
        r = await c.post("/api/wallet/saved", headers=h, json={"label": "C", "address": "not-an-address-at-all", "chain": "ethereum"})
        assert r.status_code == 400 and "valid" in r.json()["detail"]
        assert len(load_user_data("walt", "wallets")) == 2  # the shared store other features read
        assert len((await c.get("/api/wallet/saved/balances")).json()["wallets"]) == 2

        r = await c.delete(f"/api/wallet/saved/{ETH_ADDR}?chain=base", headers=h)
        assert r.status_code == 200
        assert [w["chain"] for w in (await c.get("/api/wallet/saved")).json()] == ["ethereum"]
        assert (await c.delete(f"/api/wallet/saved/{OTHER}", headers=h)).status_code == 404


# ── On-chain activity ──────────────────────────────────────────────────────

def _party(h):
    return {"hash": h}


def test_onchain_summary_flows_value_and_gas():
    usdc = {"address_hash": "0xUSDC", "symbol": "USDC", "name": "USD Coin", "decimals": "6", "exchange_rate": "1", "reputation": "ok"}
    spam = {"address_hash": "0xSPAM", "symbol": "FREE", "decimals": "18", "exchange_rate": "5", "reputation": "scam"}
    transfers = [
        {"token": usdc, "total": {"value": "100000000", "decimals": "6"}, "from": _party(OTHER), "to": _party(ETH_ADDR.upper().replace("0X", "0x"))},
        {"token": usdc, "total": {"value": "40000000", "decimals": "6"}, "from": _party(ETH_ADDR), "to": _party(OTHER)},
        {"token": spam, "total": {"value": str(10**18), "decimals": "18"}, "from": _party(OTHER), "to": _party(ETH_ADDR)},
    ]
    balances = [{"token": usdc, "value": "60000000"}, {"token": spam, "value": str(10**18)}]
    txs = [
        {"from": _party(ETH_ADDR), "to": _party(OTHER), "value": str(10**18), "status": "ok",
         "fee": {"type": "actual", "value": str(10**15)}, "historic_exchange_rate": "1500", "timestamp": "2025-01-02T00:00:00Z"},
        {"from": _party(ETH_ADDR), "to": _party(OTHER), "value": str(10**18), "status": "error",
         "fee": {"type": "actual", "value": str(10**15)}, "timestamp": "2025-01-03T00:00:00Z"},
        {"from": _party(OTHER), "to": _party(ETH_ADDR), "value": str(3 * 10**18), "status": "ok",
         "fee": {"value": str(10**15)}, "historic_exchange_rate": "1600", "timestamp": "2025-01-01T00:00:00Z"},
    ]
    out = op.summarize(ETH_ADDR, {"coin_balance": str(2 * 10**18)}, balances, transfers, txs, 2000.0,
                       {"transfers": False, "transactions": True})
    [tok] = out["tokens"]
    assert (tok["received"], tok["sent"], tok["net_flow"], tok["balance"], tok["value_usd"]) == (100, 40, 60, 60, 60)
    assert out["eth"]["received"] == 3 and out["eth"]["sent"] == 1  # the failed send moved nothing
    assert out["eth"]["value_usd"] == 4000 and out["total_value_usd"] == 4060
    assert math.isclose(out["gas"]["eth"], 0.002) and out["gas"]["transactions_paid"] == 2
    assert out["gas"]["usd_at_tx_time"] == 1.5 and out["gas"]["usd_at_today"] == 4.0
    assert out["pnl_available"] is False and out["first_activity"] is None
    notes = " ".join(out["notes"])
    assert "spam" in notes and "more history" in notes and "Cost basis is not available" in notes


@pytest.mark.anyio
async def test_onchain_api_errors(monkeypatch):
    from api.onchain_pnl import router

    c, h = _client(router, "/api/onchain-pnl")
    _mock_network(monkeypatch, lambda req: httpx.Response(503))
    async with c:
        r = await c.get(f"/api/onchain-pnl/?address={ETH_ADDR}&chain=base")
        assert r.status_code == 400 and "Only Ethereum" in r.json()["detail"]
        r = await c.get("/api/onchain-pnl/?address=0x12")
        assert r.status_code == 400 and "Ethereum address" in r.json()["detail"]
        r = await c.get(f"/api/onchain-pnl/?address={ETH_ADDR}")
        assert r.status_code == 502 and "unavailable" in r.json()["detail"]
