"""Portfolio backtesting service using CoinGecko historical data."""

from datetime import datetime, timezone

import httpx
from cachetools import TTLCache

from config import COINGECKO_API

_cache = TTLCache(maxsize=32, ttl=300)
_TIMEOUT = 15.0

# CoinGecko ID mapping for common tickers
COIN_ID_MAP: dict[str, str] = {
    "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana", "ADA": "cardano",
    "DOT": "polkadot", "AVAX": "avalanche-2", "MATIC": "matic-network",
    "LINK": "chainlink", "UNI": "uniswap", "AAVE": "aave", "ARB": "arbitrum",
    "OP": "optimism", "DOGE": "dogecoin", "XRP": "ripple", "BNB": "binancecoin",
    "ATOM": "cosmos", "NEAR": "near", "FTM": "fantom", "APT": "aptos",
    "SUI": "sui", "SEI": "sei-network", "TIA": "celestia", "INJ": "injective-protocol",
}


def _resolve_coin_id(coin: str) -> str:
    """Resolve a coin ticker or name to a CoinGecko ID."""
    upper = coin.upper()
    if upper in COIN_ID_MAP:
        return COIN_ID_MAP[upper]
    # Assume it's already a CoinGecko ID
    return coin.lower()


async def _fetch_historical_prices(coin_id: str, start_ts: int, end_ts: int) -> list[list]:
    """Fetch historical price data from CoinGecko market_chart/range endpoint."""
    cache_key = f"hist_{coin_id}_{start_ts}_{end_ts}"
    if cache_key in _cache:
        return _cache[cache_key]

    url = f"{COINGECKO_API}/coins/{coin_id}/market_chart/range"
    params = {"vs_currency": "usd", "from": start_ts, "to": end_ts}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            prices = data.get("prices", [])
            _cache[cache_key] = prices
            return prices
    except Exception as e:
        raise RuntimeError(f"Failed to fetch prices for {coin_id}: {e}") from e


async def backtest_portfolio(scenario: dict) -> dict:
    """
    Backtest a portfolio scenario.

    scenario: {
        original_coin: str,      # e.g. "BTC"
        alternative_coin: str,   # e.g. "ETH"
        start_date: str,         # e.g. "2025-01-01"
        amount_usd: float        # e.g. 10000
    }
    """
    original_id = _resolve_coin_id(scenario["original_coin"])
    alt_id = _resolve_coin_id(scenario["alternative_coin"])
    amount = float(scenario["amount_usd"])

    start_dt = datetime.strptime(scenario["start_date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    start_ts = int(start_dt.timestamp())
    end_ts = int(datetime.now(timezone.utc).timestamp())

    try:
        original_prices = await _fetch_historical_prices(original_id, start_ts, end_ts)
        alt_prices = await _fetch_historical_prices(alt_id, start_ts, end_ts)
    except RuntimeError as e:
        return {"error": str(e)}

    if not original_prices or not alt_prices:
        return {"error": "Insufficient price data for one or both coins"}

    # Calculate how many coins you'd buy at start
    original_start_price = original_prices[0][1]
    alt_start_price = alt_prices[0][1]

    original_coins = amount / original_start_price
    alt_coins = amount / alt_start_price

    # Current values
    original_end_price = original_prices[-1][1]
    alt_end_price = alt_prices[-1][1]

    original_value_now = original_coins * original_end_price
    alt_value_now = alt_coins * alt_end_price
    difference = alt_value_now - original_value_now
    pct_difference = ((alt_value_now - original_value_now) / original_value_now) * 100

    # Daily value series (sample to ~daily intervals)
    def build_series(prices: list[list], coins_held: float) -> list[dict]:
        series = []
        last_date = ""
        for ts_ms, price in prices:
            date_str = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
            if date_str != last_date:
                series.append({"date": date_str, "price": round(price, 2), "value": round(coins_held * price, 2)})
                last_date = date_str
        return series

    return {
        "original_coin": scenario["original_coin"],
        "alternative_coin": scenario["alternative_coin"],
        "start_date": scenario["start_date"],
        "amount_usd": amount,
        "original_value_now": round(original_value_now, 2),
        "alternative_value_now": round(alt_value_now, 2),
        "difference": round(difference, 2),
        "pct_difference": round(pct_difference, 2),
        "winner": scenario["alternative_coin"] if difference > 0 else scenario["original_coin"],
        "original_series": build_series(original_prices, original_coins),
        "alternative_series": build_series(alt_prices, alt_coins),
    }


async def compare_strategies(coins: list[str], start_date: str, amount: float) -> dict:
    """
    Compare equal allocation across N coins vs holding each individually.

    Returns performance of each coin and a combined equal-weight portfolio.
    """
    start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    start_ts = int(start_dt.timestamp())
    end_ts = int(datetime.now(timezone.utc).timestamp())

    per_coin_amount = amount / len(coins)
    results: list[dict] = []
    total_portfolio_value = 0.0

    for coin in coins:
        coin_id = _resolve_coin_id(coin)
        try:
            prices = await _fetch_historical_prices(coin_id, start_ts, end_ts)
            if not prices:
                results.append({"coin": coin, "error": "No price data"})
                continue

            start_price = prices[0][1]
            end_price = prices[-1][1]
            coins_held = per_coin_amount / start_price
            current_value = coins_held * end_price
            pct_return = ((current_value - per_coin_amount) / per_coin_amount) * 100
            total_portfolio_value += current_value

            results.append({
                "coin": coin,
                "start_price": round(start_price, 4),
                "end_price": round(end_price, 4),
                "invested": round(per_coin_amount, 2),
                "current_value": round(current_value, 2),
                "pct_return": round(pct_return, 2),
            })
        except RuntimeError as e:
            results.append({"coin": coin, "error": str(e)})

    portfolio_return = ((total_portfolio_value - amount) / amount) * 100 if amount > 0 else 0

    # Find best/worst performers
    valid = [r for r in results if "error" not in r]
    best = max(valid, key=lambda x: x["pct_return"]) if valid else None
    worst = min(valid, key=lambda x: x["pct_return"]) if valid else None

    return {
        "start_date": start_date,
        "total_invested": amount,
        "per_coin_invested": round(per_coin_amount, 2),
        "total_portfolio_value": round(total_portfolio_value, 2),
        "portfolio_return_pct": round(portfolio_return, 2),
        "best_performer": best,
        "worst_performer": worst,
        "individual_results": results,
    }
