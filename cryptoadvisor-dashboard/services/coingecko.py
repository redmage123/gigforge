"""CoinGecko API client for market data.

Includes a stale-cache mechanism: when the API returns 429 (rate-limited) or
any other error, the last successful response for that cache key is returned
so the dashboard degrades gracefully instead of showing empty data.
"""

import logging

import httpx
from config import COINGECKO_API, CACHE_TTL_PRICES, CACHE_TTL_GLOBAL, CACHE_TTL_OHLCV
from services.cache import cached

logger = logging.getLogger(__name__)

# Stale cache: stores the last successful response per logical cache key so we
# can serve it when the live API is unavailable (429 / network errors / etc.).
_stale_cache: dict[str, dict] = {}


async def _fetch_json(url: str, params: dict | None = None, stale_key: str = "") -> dict:
    """HTTP GET helper that falls back to the stale cache on failure."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            # Persist successful response in stale cache
            if stale_key:
                _stale_cache[stale_key] = data
            return data
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        logger.warning("CoinGecko request failed (%s): %s", stale_key, exc)
        if stale_key and stale_key in _stale_cache:
            logger.info("Returning stale cached data for %s", stale_key)
            return _stale_cache[stale_key]
        raise


@cached(ttl=CACHE_TTL_PRICES)
async def get_prices(coin_ids: tuple[str, ...] = ("bitcoin", "ethereum", "solana")) -> dict:
    """Get current prices for coins."""
    ids = ",".join(coin_ids)
    return await _fetch_json(
        f"{COINGECKO_API}/simple/price",
        params={
            "ids": ids,
            "vs_currencies": "usd",
            "include_24hr_change": "true",
            "include_market_cap": "true",
            "include_24hr_vol": "true",
        },
        stale_key=f"prices:{ids}",
    )


@cached(ttl=CACHE_TTL_GLOBAL)
async def get_global_data() -> dict:
    """Get global crypto market data."""
    return await _fetch_json(
        f"{COINGECKO_API}/global",
        stale_key="global",
    )


@cached(ttl=CACHE_TTL_PRICES)
async def get_prices_list(coin_ids: tuple[str, ...] = ("bitcoin", "ethereum", "solana")) -> list:
    """Get full market data for coins (price, market cap, volume, change, image).
    Returns list of dicts in CoinGecko /coins/markets format."""
    ids = ",".join(coin_ids)
    return await _fetch_json(
        f"{COINGECKO_API}/coins/markets",
        params={
            "vs_currency": "usd",
            "ids": ids,
            "order": "market_cap_desc",
            "sparkline": "false",
        },
        stale_key=f"markets:{ids}",
    )


@cached(ttl=CACHE_TTL_OHLCV)
async def get_ohlcv(coin_id: str, days: int = 30) -> dict:
    """Get OHLCV data for a coin."""
    return await _fetch_json(
        f"{COINGECKO_API}/coins/{coin_id}/ohlc",
        params={"vs_currency": "usd", "days": days},
        stale_key=f"ohlcv:{coin_id}:{days}",
    )


@cached(ttl=CACHE_TTL_OHLCV)
async def get_market_chart(coin_id: str, days: int = 30) -> dict:
    """Get market chart data (prices, volumes, market caps)."""
    return await _fetch_json(
        f"{COINGECKO_API}/coins/{coin_id}/market_chart",
        params={"vs_currency": "usd", "days": days},
        stale_key=f"market_chart:{coin_id}:{days}",
    )
