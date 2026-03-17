"""Liquidation tracking service."""

import time
from datetime import datetime, timezone

import httpx
from cachetools import TTLCache

_cache = TTLCache(maxsize=16, ttl=10)
_TIMEOUT = 10.0

# CoinGlass public API (no key required for basic data)
COINGLASS_URL = "https://open-api.coinglass.com/public/v2/liquidation/info"
BINANCE_FUTURES_URL = "https://fapi.binance.com/fapi/v1/allForceOrders"


async def get_recent_liquidations() -> list[dict]:
    """Fetch recent liquidation events from Binance futures or CoinGlass."""
    cache_key = "recent_liquidations"
    if cache_key in _cache:
        return _cache[cache_key]

    liquidations: list[dict] = []

    # Try CoinGlass public endpoint first
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(COINGLASS_URL)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("code") == "0" and data.get("data"):
                    for item in data["data"]:
                        liquidations.append({
                            "symbol": item.get("symbol", "UNKNOWN"),
                            "side": "long" if item.get("longVolUsd", 0) > item.get("shortVolUsd", 0) else "short",
                            "quantity": float(item.get("volUsd", 0)),
                            "price": 0.0,
                            "time": datetime.now(timezone.utc).isoformat(),
                            "usd_value": float(item.get("volUsd", 0)),
                        })
                    if liquidations:
                        _cache[cache_key] = liquidations
                        return liquidations
    except Exception:
        pass

    # Fallback: Binance futures forced liquidation orders
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(f"{BINANCE_FUTURES_URL}?limit=50")
            resp.raise_for_status()
            data = resp.json()
            for order in data:
                price = float(order.get("price", 0))
                qty = float(order.get("origQty", 0))
                usd_value = price * qty
                side = "long" if order.get("side") == "SELL" else "short"
                liquidations.append({
                    "symbol": order.get("symbol", "UNKNOWN"),
                    "side": side,
                    "quantity": qty,
                    "price": price,
                    "time": datetime.fromtimestamp(
                        order.get("time", int(time.time() * 1000)) / 1000, tz=timezone.utc
                    ).isoformat(),
                    "usd_value": round(usd_value, 2),
                })
    except Exception as e:
        if not liquidations:
            return [{"error": f"Failed to fetch liquidations: {e}"}]

    _cache[cache_key] = liquidations
    return liquidations


async def get_liquidation_summary() -> dict:
    """Aggregate liquidation data into a summary."""
    cache_key = "liquidation_summary"
    if cache_key in _cache:
        return _cache[cache_key]

    liquidations = await get_recent_liquidations()
    if not liquidations or (len(liquidations) == 1 and "error" in liquidations[0]):
        return {
            "total_long_liquidations": 0,
            "total_short_liquidations": 0,
            "largest_single": None,
            "most_liquidated_coin": None,
            "time_period": "recent",
            "error": liquidations[0].get("error") if liquidations else "No data",
        }

    total_long = sum(l["usd_value"] for l in liquidations if l["side"] == "long")
    total_short = sum(l["usd_value"] for l in liquidations if l["side"] == "short")

    largest = max(liquidations, key=lambda x: x.get("usd_value", 0))

    # Count liquidations per coin
    coin_counts: dict[str, float] = {}
    for l in liquidations:
        sym = l["symbol"]
        coin_counts[sym] = coin_counts.get(sym, 0) + l.get("usd_value", 0)
    most_liquidated = max(coin_counts, key=coin_counts.get) if coin_counts else None

    result = {
        "total_long_liquidations": round(total_long, 2),
        "total_short_liquidations": round(total_short, 2),
        "largest_single": largest,
        "most_liquidated_coin": most_liquidated,
        "time_period": "last 50 orders",
        "total_count": len(liquidations),
        "long_short_ratio": round(total_long / total_short, 2) if total_short > 0 else float("inf"),
    }
    _cache[cache_key] = result
    return result
