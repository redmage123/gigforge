"""DCA (Dollar-Cost Averaging) backtester using historical CoinGecko data."""

from services.coingecko import get_market_chart


async def backtest_dca(coin_id: str, days: int = 365, frequency: str = "weekly",
                       amount: float = 100) -> dict:
    """Backtest a DCA strategy.

    Args:
        coin_id: CoinGecko coin ID
        days: lookback period
        frequency: daily, weekly, monthly
        amount: USD amount per buy
    """
    data = await get_market_chart(coin_id, days)
    prices = data.get("prices", [])
    if not prices:
        return {"error": "No price data available"}

    # Determine buy interval in data points
    # CoinGecko returns ~daily data for >90 days, ~hourly for <90 days
    interval = {"daily": 1, "weekly": 7, "monthly": 30}.get(frequency, 7)

    total_invested = 0
    total_coins = 0
    buys = []
    chart_data = []

    for i in range(0, len(prices), max(interval, 1)):
        ts, price = prices[i]
        if price <= 0:
            continue
        coins_bought = amount / price
        total_invested += amount
        total_coins += coins_bought
        current_value = total_coins * price

        buys.append({
            "timestamp": ts,
            "price": round(price, 2),
            "coins_bought": round(coins_bought, 8),
            "total_invested": round(total_invested, 2),
        })
        chart_data.append({
            "timestamp": ts,
            "invested": round(total_invested, 2),
            "value": round(current_value, 2),
        })

    if not buys:
        return {"error": "No buy points in data"}

    final_price = prices[-1][1]
    current_value = total_coins * final_price
    avg_buy_price = total_invested / max(total_coins, 0.0001)
    lump_sum_coins = total_invested / prices[0][1] if prices[0][1] > 0 else 0
    lump_sum_value = lump_sum_coins * final_price

    return {
        "coin_id": coin_id,
        "frequency": frequency,
        "amount_per_buy": amount,
        "num_buys": len(buys),
        "total_invested": round(total_invested, 2),
        "total_coins": round(total_coins, 8),
        "current_value": round(current_value, 2),
        "avg_buy_price": round(avg_buy_price, 2),
        "current_price": round(final_price, 2),
        "pnl": round(current_value - total_invested, 2),
        "roi_percent": round(((current_value - total_invested) / max(total_invested, 1)) * 100, 2),
        "lump_sum_value": round(lump_sum_value, 2),
        "lump_sum_roi": round(((lump_sum_value - total_invested) / max(total_invested, 1)) * 100, 2),
        "chart_data": chart_data,
    }
