"""Portfolio risk metrics — Sharpe ratio, max drawdown, beta, volatility."""

import numpy as np
import pandas as pd
from services.coingecko import get_market_chart
from services.trades import calculate_pnl


async def calculate_risk_metrics(username: str, days: int = 90) -> dict:
    """Calculate risk metrics for the user's portfolio."""
    pnl = await calculate_pnl(username)
    if not pnl:
        return {"error": "No positions to analyze"}

    # Get weights from current values
    total_value = sum(p["current_value"] for p in pnl)
    if total_value == 0:
        return {"error": "Portfolio value is zero"}

    weights = {p["coin_id"]: p["current_value"] / total_value for p in pnl}

    # Fetch price histories
    all_returns = {}
    for coin_id in weights:
        try:
            data = await get_market_chart(coin_id, days)
            prices = [p[1] for p in data.get("prices", [])]
            if len(prices) > 1:
                returns = pd.Series(prices).pct_change().dropna()
                all_returns[coin_id] = returns
        except Exception:
            continue

    if not all_returns:
        return {"error": "Could not fetch price data"}

    # Align all return series to same length
    min_len = min(len(r) for r in all_returns.values())
    aligned = {k: v.iloc[:min_len].values for k, v in all_returns.items()}

    # Calculate weighted portfolio returns
    portfolio_returns = np.zeros(min_len)
    for coin_id, returns in aligned.items():
        w = weights.get(coin_id, 0)
        portfolio_returns += w * returns

    # Sharpe Ratio (annualized, risk-free rate ~4.5%)
    risk_free_daily = 0.045 / 365
    excess_returns = portfolio_returns - risk_free_daily
    sharpe = 0
    if np.std(excess_returns) > 0:
        sharpe = (np.mean(excess_returns) / np.std(excess_returns)) * np.sqrt(365)

    # Max Drawdown
    cumulative = np.cumprod(1 + portfolio_returns)
    peak = np.maximum.accumulate(cumulative)
    drawdown = (cumulative - peak) / peak
    max_drawdown = float(np.min(drawdown)) * 100

    # Volatility (annualized)
    volatility = float(np.std(portfolio_returns) * np.sqrt(365)) * 100

    # Beta vs BTC
    beta = 0
    if "bitcoin" in aligned:
        btc_returns = aligned["bitcoin"]
        cov = np.cov(portfolio_returns, btc_returns)
        if cov[1, 1] > 0:
            beta = float(cov[0, 1] / cov[1, 1])

    # Value at Risk (95%)
    var_95 = float(np.percentile(portfolio_returns, 5)) * total_value

    return {
        "sharpe_ratio": round(sharpe, 3),
        "max_drawdown_pct": round(max_drawdown, 2),
        "volatility_annual_pct": round(volatility, 2),
        "beta_vs_btc": round(beta, 3),
        "var_95_usd": round(var_95, 2),
        "period_days": days,
        "portfolio_value": round(total_value, 2),
        "num_positions": len(pnl),
    }
