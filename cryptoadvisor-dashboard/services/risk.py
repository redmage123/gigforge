"""Portfolio risk metrics — Sharpe ratio, max drawdown, beta, volatility."""

import numpy as np
import pandas as pd
from services import market
from services.trades import calculate_pnl

BENCHMARKS = {"btc": "crypto:BTC", "spx": "index:SPX"}


async def _daily_returns(instrument_id: str, days: int) -> pd.Series | None:
    """Daily close-to-close returns indexed by UTC date (any asset class)."""
    try:
        rows = await market.candles(instrument_id, "1d", days + 1)
    except Exception:  # noqa: BLE001 — a missing series just drops out of the analysis
        return None
    if len(rows) < 3:
        return None
    s = pd.Series([c.close for c in rows], index=pd.to_datetime([c.open_time for c in rows], unit="ms").normalize())
    return s[~s.index.duplicated(keep="last")].pct_change().dropna()


async def calculate_risk_metrics(username: str, days: int = 90) -> dict:
    """Calculate risk metrics for the user's portfolio."""
    pnl = [p for p in await calculate_pnl(username) if p.get("market_value") is not None]
    if not pnl:
        return {"error": "No priced positions to analyze"}

    # Weights by exposure; a short position contributes negatively
    gross = sum(abs(p["market_value"]) for p in pnl)
    total_value = sum(p["market_value"] for p in pnl)
    if gross == 0:
        return {"error": "Portfolio value is zero"}
    weights = {p["instrument_id"]: p["market_value"] / gross for p in pnl}

    series = {iid: await _daily_returns(iid, days) for iid in weights}
    series = {k: v for k, v in series.items() if v is not None}
    if not series:
        return {"error": "Could not fetch price data"}

    # Align on dates every series has (stocks skip weekends, crypto doesn't)
    frame = pd.DataFrame(series).dropna()
    if len(frame) < 5:
        return {"error": "Not enough overlapping price history"}
    portfolio_returns = sum(frame[iid].values * weights[iid] for iid in frame.columns)

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

    # Beta vs Bitcoin and vs the S&P 500, over the same dates
    betas = {}
    for key, bench_id in BENCHMARKS.items():
        bench = await _daily_returns(bench_id, days)
        joined = pd.DataFrame({"p": pd.Series(portfolio_returns, index=frame.index), "b": bench}).dropna() if bench is not None else None
        if joined is not None and len(joined) > 5 and joined["b"].var() > 0:
            betas[key] = float(joined["p"].cov(joined["b"]) / joined["b"].var())
    beta = betas.get("btc", 0.0)

    # Value at Risk (95%)
    var_95 = float(np.percentile(portfolio_returns, 5)) * total_value

    return {
        "sharpe_ratio": round(sharpe, 3),
        "max_drawdown_pct": round(max_drawdown, 2),
        "volatility_annual_pct": round(volatility, 2),
        "beta_vs_btc": round(beta, 3),
        "beta_vs_sp500": round(betas.get("spx", 0.0), 3),
        "var_95_usd": round(var_95, 2),
        "period_days": days,
        "portfolio_value": round(total_value, 2),
        "num_positions": len(pnl),
    }
