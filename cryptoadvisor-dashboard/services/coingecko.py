"""CoinGecko API client for market data.

Includes a stale-cache mechanism: when the API returns 429 (rate-limited) or
any other error, the last successful response for that cache key is returned
so the dashboard degrades gracefully instead of showing empty data.
"""

import logging
import time

import httpx
from config import COINGECKO_API, CACHE_TTL_PRICES, CACHE_TTL_GLOBAL, CACHE_TTL_OHLCV
from services.cache import cached

logger = logging.getLogger(__name__)

# Stale cache: stores the last successful response per logical cache key so we
# can serve it when the live API is unavailable (429 / network errors / etc.).
_stale_cache: dict[str, dict] = {}

# After a 429 every CoinGecko call is skipped until this epoch time, so a rate-limited server stops
# hammering the API (which only extends the ban). Calls during the cooldown fail like a real 429.
RATE_LIMIT_COOLDOWN_S = 300
MAX_COOLDOWN_S = 3600
_rate_limited_until = 0.0


def rate_limited() -> bool:
    return time.time() < _rate_limited_until


def _note_rate_limit(resp: httpx.Response) -> None:
    global _rate_limited_until
    try:
        wait = float(resp.headers.get("retry-after", RATE_LIMIT_COOLDOWN_S))
    except ValueError:
        wait = RATE_LIMIT_COOLDOWN_S
    _rate_limited_until = time.time() + min(max(wait, 30.0), MAX_COOLDOWN_S)


def _cooldown_error(url: str) -> httpx.HTTPStatusError:
    req = httpx.Request("GET", url)
    return httpx.HTTPStatusError("CoinGecko rate limited (cooling down)", request=req,
                                 response=httpx.Response(429, request=req))


async def _get_raw(url: str, params: dict | None = None):
    """One GET against CoinGecko, honoring the 429 cooldown. Raises httpx errors on failure."""
    if rate_limited():
        raise _cooldown_error(url)
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, params=params)
        if resp.status_code == 429:
            _note_rate_limit(resp)
        resp.raise_for_status()
        return resp.json()


async def fetch_global() -> dict:
    """Uncached /global (callers do their own caching)."""
    return await _get_raw(f"{COINGECKO_API}/global")


async def fetch_markets(coin_ids: tuple[str, ...]) -> list:
    """Uncached /coins/markets for the given ids (price, market cap, supply, image, …)."""
    return await _get_raw(
        f"{COINGECKO_API}/coins/markets",
        params={"vs_currency": "usd", "ids": ",".join(coin_ids), "order": "market_cap_desc",
                "sparkline": "false", "per_page": 250},
    )


async def _fetch_json(url: str, params: dict | None = None, stale_key: str = "") -> dict:
    """HTTP GET helper that falls back to the stale cache on failure."""
    try:
        if rate_limited():
            raise _cooldown_error(url)
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params)
            if resp.status_code == 429:
                _note_rate_limit(resp)
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
