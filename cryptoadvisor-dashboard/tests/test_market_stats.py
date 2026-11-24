"""/api/market/prices and /api/market/global: caching, stale-while-error, fallbacks, persistence.

Network is fully stubbed. Run with: pytest tests/test_market_stats.py -q
"""

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402

from services import coingecko, market_stats, store  # noqa: E402
from services.market import registry  # noqa: E402
from services.market.models import Instrument, Quote  # noqa: E402

CG_GLOBAL = {"data": {"active_cryptocurrencies": 17000, "total_market_cap": {"usd": 2.5e12},
                      "total_volume": {"usd": 1.0e11}, "market_cap_percentage": {"btc": 55.0, "eth": 12.0}}}
PAPRIKA = {"market_cap_usd": 2.0e12, "volume_24h_usd": 1.4e11, "bitcoin_dominance_percentage": 56.0,
           "cryptocurrencies_number": 11964, "market_cap_change_24h": -1.1, "last_updated": 1795504405}
CG_MARKETS = [
    {"id": "bitcoin", "symbol": "btc", "name": "Bitcoin", "image": "https://img/btc.png", "current_price": 60000,
     "price_change_percentage_24h": -1.0, "total_volume": 3e10, "market_cap": 1.2e12, "circulating_supply": 20_000_000},
    {"id": "ethereum", "symbol": "eth", "name": "Ethereum", "image": "https://img/eth.png", "current_price": 3000,
     "price_change_percentage_24h": 2.0, "total_volume": 1e10, "market_cap": 3.6e11, "circulating_supply": 120_000_000},
]


def _429(*_a, **_k):
    req = httpx.Request("GET", "https://api.coingecko.com/x")
    raise httpx.HTTPStatusError("429", request=req, response=httpx.Response(429, request=req))


def _down(*_a, **_k):
    raise httpx.ConnectError("down", request=httpx.Request("GET", "https://example.invalid"))


class Upstream:
    """Controllable fakes for CoinGecko, Binance (market layer) and the fallback global providers."""

    def __init__(self):
        self.cg_global = CG_GLOBAL
        self.cg_markets = CG_MARKETS
        self.binance = {"crypto:BTC": 61000.0, "crypto:ETH": 3100.0}
        self.paprika = PAPRIKA
        self.coinlore = None
        self.calls = {"cg_global": 0, "cg_markets": 0, "binance": 0, "paprika": 0, "coinlore": 0}

    async def fetch_global(self):
        self.calls["cg_global"] += 1
        if self.cg_global is _429:
            return _429()
        return self.cg_global

    async def fetch_markets(self, ids):
        self.calls["cg_markets"] += 1
        if self.cg_markets is _429:
            return _429()
        return [m for m in self.cg_markets if m["id"] in ids]

    async def quotes(self, iids):
        self.calls["binance"] += 1
        if self.binance is _down:
            return {}  # the market layer swallows provider failures
        now = time.time()
        return {i: Quote(i, self.binance[i], 1.5, 5e9, now, "binance") for i in iids if i in self.binance}

    async def get_json(self, url):
        name = "paprika" if "coinpaprika" in url else "coinlore"
        self.calls[name] += 1
        val = getattr(self, name)
        if val is None or val is _down:
            return _down()
        return val


@pytest.fixture
def up(monkeypatch):
    registry.load_for_tests([
        Instrument("crypto:BTC", "crypto", "BTC", "Bitcoin", {"binance": "BTCUSDT", "coingecko": "bitcoin"}),
        Instrument("crypto:ETH", "crypto", "ETH", "Ethereum", {"binance": "ETHUSDT", "coingecko": "ethereum"}),
    ])
    market_stats._reset_for_tests()
    monkeypatch.setattr(coingecko, "_rate_limited_until", 0.0)
    u = Upstream()
    monkeypatch.setattr(market_stats.coingecko, "fetch_global", u.fetch_global)
    monkeypatch.setattr(market_stats.coingecko, "fetch_markets", u.fetch_markets)
    monkeypatch.setattr(market_stats.market, "quotes", u.quotes)
    monkeypatch.setattr(market_stats, "_get_json", u.get_json)
    monkeypatch.setattr("config.DEFAULT_COINS", ["bitcoin", "ethereum"])
    monkeypatch.setattr("api.market.DEFAULT_COINS", ["bitcoin", "ethereum"])
    yield u
    market_stats._reset_for_tests()


def get(path):
    from api.market import router
    app = FastAPI()
    app.include_router(router, prefix="/api/market")

    async def go():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            return await c.get(path)
    return asyncio.run(go())


def age(seconds):
    """Pretend every cached payload was fetched/attempted `seconds` ago."""
    s = market_stats._state
    s.global_fetched_at -= seconds
    s.global_attempted_at -= seconds
    for d in (s.refreshed_at, s.attempted_at):
        for k in d:
            d[k] -= seconds


# ── Global ──────────────────────────────────────────────────────────────────

def test_global_fresh_from_coingecko(up):
    r = get("/api/market/global")
    assert r.status_code == 200
    body = r.json()
    assert body["data"]["total_market_cap"]["usd"] == 2.5e12
    assert body["source"] == "coingecko" and body["stale"] is False


def test_global_429_with_warm_cache_serves_cached(up):
    assert get("/api/market/global").status_code == 200
    up.cg_global = _429
    up.paprika = _down
    up.coinlore = _down
    age(3600 * 3)  # hours old, refresh due
    r = get("/api/market/global")
    assert r.status_code == 200
    body = r.json()
    assert body["data"]["total_market_cap"]["usd"] == 2.5e12 and body["stale"] is True


def test_global_min_refresh_interval_and_no_hammering(up):
    for _ in range(5):
        assert get("/api/market/global").status_code == 200
    assert up.calls["cg_global"] == 1
    # After a failed refresh with a warm cache, upstream isn't retried on every request either
    up.cg_global, up.paprika = _429, _down
    age(market_stats.GLOBAL_MIN_REFRESH_S + 1)
    for _ in range(5):
        assert get("/api/market/global").status_code == 200
    assert up.calls["cg_global"] == 2 and up.calls["paprika"] == 1


def test_global_single_flight(up, monkeypatch):
    async def slow():
        up.calls["cg_global"] += 1
        await asyncio.sleep(0.05)
        return CG_GLOBAL
    monkeypatch.setattr(market_stats.coingecko, "fetch_global", slow)

    async def burst():
        return await asyncio.gather(*(market_stats.get_global() for _ in range(10)))
    results = asyncio.run(burst())
    assert up.calls["cg_global"] == 1 and all(r["source"] == "coingecko" for r in results)


def test_global_falls_back_to_coinpaprika(up):
    up.cg_global = _429
    r = get("/api/market/global")
    assert r.status_code == 200
    body = r.json()
    d = body["data"]
    assert body["source"] == "coinpaprika" and body["stale"] is False
    assert d["total_market_cap"]["usd"] == 2.0e12 and d["total_volume"]["usd"] == 1.4e11
    assert d["active_cryptocurrencies"] == 11964
    assert d["market_cap_percentage"]["btc"] == 56.0
    # ETH dominance filled from our own price data: 3100 * 120M / 2e12
    assert d["market_cap_percentage"]["eth"] == pytest.approx(3100 * 120_000_000 / 2.0e12 * 100)
    assert list(d["market_cap_percentage"])[0] == "btc"  # sorted, as the dominance chart slices the top 6


def test_global_falls_back_to_coinlore(up):
    up.cg_global, up.paprika = _429, _down
    up.coinlore = [{"coins_count": 14992, "total_mcap": 2.1e12, "total_volume": 2.7e11, "btc_d": "58.37",
                    "eth_d": "9.98", "mcap_change": "0.44"}]
    body = get("/api/market/global").json()
    assert body["source"] == "coinlore"
    assert body["data"]["market_cap_percentage"]["btc"] == 58.37
    assert body["data"]["market_cap_percentage"]["eth"] == 9.98


def test_global_cold_cache_all_down_gives_readable_502(up):
    up.cg_global, up.paprika, up.coinlore = _429, _down, _down
    r = get("/api/market/global")
    assert r.status_code == 502
    msg = r.json()["error"]
    assert "temporarily unavailable" in msg and "rate limited" in msg and "coinpaprika" in msg


def test_global_restored_from_store_after_restart(up):
    assert get("/api/market/global").status_code == 200
    assert store.get(store.SHARED, market_stats.GLOBAL_KEY)["payload"]["source"] == "coingecko"
    market_stats._reset_for_tests()  # "restart": memory empty
    up.cg_global, up.paprika, up.coinlore = _429, _down, _down
    r = get("/api/market/global")
    assert r.status_code == 200 and r.json()["data"]["total_market_cap"]["usd"] == 2.5e12


# ── Prices ──────────────────────────────────────────────────────────────────

def test_prices_shape_binance_prices_coingecko_logos(up):
    r = get("/api/market/prices")
    assert r.status_code == 200
    btc = r.json()["bitcoin"]
    # CoinGecko /simple/price fields (CoinDetail, legacy callers)
    assert btc["usd"] == 61000.0 and btc["usd_24h_change"] == 1.5 and btc["usd_24h_vol"] == 5e9
    assert btc["usd_market_cap"] == 61000.0 * 20_000_000
    # list-style extras (Dashboard logos / favorites)
    assert btc["symbol"] == "btc" and btc["image"] == "https://img/btc.png" and btc["current_price"] == 61000.0
    assert btc["source"] == "binance" and btc["stale"] is False


def test_prices_min_refresh_interval(up):
    for _ in range(4):
        assert get("/api/market/prices").status_code == 200
    assert up.calls["binance"] == 1 and up.calls["cg_markets"] == 1
    assert get("/api/market/prices/bitcoin").json().keys() == {"bitcoin"}  # served from the same cache
    assert up.calls["binance"] == 1
    age(market_stats.PRICES_MIN_REFRESH_S + 1)
    get("/api/market/prices")
    assert up.calls["binance"] == 2 and up.calls["cg_markets"] == 1  # logos/supply still fresh


def test_prices_upstream_down_with_warm_cache_returns_cached(up):
    assert get("/api/market/prices").status_code == 200
    up.binance, up.cg_markets = _down, _429
    age(3600 * 5)
    r = get("/api/market/prices")
    assert r.status_code == 200
    btc = r.json()["bitcoin"]
    assert btc["usd"] == 61000.0 and btc["stale"] is True


def test_prices_coingecko_429_still_priced_by_binance(up):
    up.cg_markets = _429
    btc = get("/api/market/prices").json()["bitcoin"]
    assert btc["usd"] == 61000.0 and btc["symbol"] == "btc" and btc["name"] == "Bitcoin"
    assert btc["image"] is None  # logos need CoinGecko; nothing cached yet


def test_prices_coingecko_used_when_binance_lacks_coin(up):
    up.binance = {}
    btc = get("/api/market/prices/bitcoin").json()["bitcoin"]
    assert btc["usd"] == 60000 and btc["source"] == "coingecko" and btc["usd_market_cap"] == 60000 * 20_000_000


def test_prices_cold_cache_all_down_gives_readable_502(up):
    up.binance, up.cg_markets = _down, _429
    r = get("/api/market/prices")
    assert r.status_code == 502
    assert "temporarily unavailable" in r.json()["error"] and "rate limited" in r.json()["error"]


def test_prices_unknown_coin_is_empty_not_error(up):
    r = get("/api/market/prices/not-a-coin")
    assert r.status_code == 200 and r.json() == {}


def test_prices_restored_from_store_after_restart(up):
    assert get("/api/market/prices").status_code == 200
    market_stats._reset_for_tests()
    up.binance, up.cg_markets = _down, _429
    r = get("/api/market/prices")
    assert r.status_code == 200 and r.json()["ethereum"]["usd"] == 3100.0


# ── CoinGecko 429 cooldown ──────────────────────────────────────────────────

def test_coingecko_cooldown_after_429(monkeypatch):
    monkeypatch.setattr(coingecko, "_rate_limited_until", 0.0)
    hits = []

    def handler(request):
        hits.append(request.url)
        return httpx.Response(429, headers={"retry-after": "120"}, json={"status": {"error_code": 429}})

    real = httpx.AsyncClient
    monkeypatch.setattr(coingecko.httpx, "AsyncClient",
                        lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    for _ in range(3):
        with pytest.raises(httpx.HTTPStatusError) as ei:
            asyncio.run(coingecko.fetch_global())
        assert ei.value.response.status_code == 429
    assert len(hits) == 1 and coingecko.rate_limited()


def test_prices_single_flight(up):
    async def burst():
        return await asyncio.gather(*(market_stats.get_prices(("bitcoin", "ethereum")) for _ in range(10)))
    results = asyncio.run(burst())
    assert up.calls["binance"] == 1 and up.calls["cg_markets"] == 1
    assert all(r["bitcoin"]["usd"] == 61000.0 for r in results)


def test_prices_coinlore_supplies_market_cap_when_coingecko_down(up):
    up.cg_markets = _429
    up.coinlore = {"data": [{"symbol": "BTC", "name": "Bitcoin", "nameid": "bitcoin", "price_usd": "60000",
                             "percent_change_24h": "-0.4", "volume24": 1e11, "csupply": "19970852.00",
                             "market_cap_usd": "1.2e12"}]}
    btc = get("/api/market/prices").json()["bitcoin"]
    assert btc["usd"] == 61000.0 and btc["source"] == "binance"  # price still from Binance
    assert btc["usd_market_cap"] == pytest.approx(61000.0 * 19970852)
    assert up.calls["coinlore"] == 1
