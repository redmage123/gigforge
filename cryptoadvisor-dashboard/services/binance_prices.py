"""Spot USD prices from Binance's public ticker (no key, generous limits).

CoinGecko's free tier rate-limits this server often, which left every price at 0 and showed
-100% P&L. Binance answers all symbols in one call; it is cached briefly and shared by callers.
"""

import time

import httpx

from services.coin_ids import SYMBOL_TO_ID

HOSTS = ("https://api.binance.com", "https://data-api.binance.vision")
CACHE_S = 30
_ID_TO_SYMBOL = {v: k for k, v in SYMBOL_TO_ID.items()}
_cache: dict = {"at": 0.0, "prices": {}}


def _symbol(coin_id: str) -> str:
    # Mapped CoinGecko ids, else the id is already a ticker (CSV imports of unmapped coins)
    return _ID_TO_SYMBOL.get(coin_id, coin_id.upper())


async def _all_usdt_prices() -> dict[str, float]:
    if time.time() - _cache["at"] < CACHE_S and _cache["prices"]:
        return _cache["prices"]
    async with httpx.AsyncClient(timeout=10) as client:
        for host in HOSTS:
            try:
                resp = await client.get(f"{host}/api/v3/ticker/price")
                resp.raise_for_status()
                prices = {
                    row["symbol"][:-4]: float(row["price"])
                    for row in resp.json()
                    if row["symbol"].endswith("USDT")
                }
                _cache.update(at=time.time(), prices=prices)
                return prices
            except (httpx.HTTPError, ValueError, KeyError):
                continue
    return _cache["prices"]  # stale beats nothing


async def get_usd_prices(coin_ids) -> dict[str, float]:
    """{coin_id: USD price} for the ids Binance lists against USDT; missing ids are omitted."""
    tickers = await _all_usdt_prices()
    out = {}
    for cid in coin_ids:
        price = tickers.get(_symbol(cid))
        if price:
            out[cid] = price
    return out
