"""Portfolio correlation matrix calculator using CoinGecko OHLCV data."""

import logging
from typing import Any

import httpx
import numpy as np

from config import COINGECKO_API

logger = logging.getLogger(__name__)


async def _fetch_market_chart(coin_id: str, days: int) -> list[float]:
    """Fetch daily closing prices from CoinGecko and compute daily returns."""
    url = f"{COINGECKO_API}/coins/{coin_id}/market_chart"
    params = {"vs_currency": "usd", "days": days, "interval": "daily"}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            prices = [p[1] for p in data.get("prices", [])]

            if len(prices) < 2:
                return []

            # Daily returns: (P_t - P_{t-1}) / P_{t-1}
            returns: list[float] = []
            for i in range(1, len(prices)):
                if prices[i - 1] != 0:
                    returns.append((prices[i] - prices[i - 1]) / prices[i - 1])
                else:
                    returns.append(0.0)
            return returns

    except Exception as exc:
        logger.warning("Error fetching market chart for %s: %s", coin_id, exc)
        return []


async def get_correlation_matrix(
    coins: list[str],
    days: int = 90,
) -> dict[str, Any]:
    """Build a correlation matrix of daily returns for the given coin list.

    Args:
        coins: CoinGecko coin IDs (e.g. ["bitcoin", "ethereum", "solana"]).
        days:  Lookback period in days (default 90).

    Returns:
        Dict with matrix (list of lists), labels, and per-coin stats.
    """
    if not coins:
        return {"matrix": [], "labels": [], "stats": [], "error": "No coins provided"}

    if days < 2:
        return {"matrix": [], "labels": [], "stats": [], "error": "days must be >= 2"}

    all_returns: dict[str, list[float]] = {}
    failed: list[str] = []

    for coin in coins:
        returns = await _fetch_market_chart(coin, days)
        if returns:
            all_returns[coin] = returns
        else:
            failed.append(coin)

    valid_coins = list(all_returns.keys())
    if len(valid_coins) < 2:
        return {
            "matrix": [],
            "labels": valid_coins,
            "stats": [],
            "error": "Need at least 2 coins with data to compute correlation",
            "failed_coins": failed,
        }

    # Align to the shortest return series
    min_len = min(len(r) for r in all_returns.values())
    aligned = np.array([all_returns[c][:min_len] for c in valid_coins])

    # Correlation matrix
    try:
        corr_matrix = np.corrcoef(aligned)
    except Exception as exc:
        logger.error("Error computing correlation: %s", exc)
        return {"matrix": [], "labels": valid_coins, "stats": [], "error": str(exc)}

    # Per-coin statistics
    stats: list[dict[str, Any]] = []
    for i, coin in enumerate(valid_coins):
        r = aligned[i]
        stats.append({
            "coin": coin,
            "mean_daily_return": round(float(np.mean(r)) * 100, 4),
            "volatility": round(float(np.std(r)) * 100, 4),
            "annualized_volatility": round(float(np.std(r) * np.sqrt(365)) * 100, 2),
            "data_points": len(r),
        })

    # Convert matrix to plain Python floats
    matrix = [[round(float(corr_matrix[i][j]), 4) for j in range(len(valid_coins))]
              for i in range(len(valid_coins))]

    return {
        "matrix": matrix,
        "labels": valid_coins,
        "stats": stats,
        "days": days,
        "data_points_used": min_len,
        "failed_coins": failed if failed else None,
    }
