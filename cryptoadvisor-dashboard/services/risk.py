"""Portfolio risk metrics — Sharpe ratio, max drawdown, beta, volatility."""

import numpy as np
import pandas as pd
from services import market
from services.trades import calculate_pnl

BENCHMARKS = {"btc": "crypto:BTC", "spx": "index:SPX"}


async def _daily_closes(instrument_id: str, days: int) -> pd.Series | None:
    """Daily closes indexed by UTC date (any asset class)."""
    try:
        rows = await market.candles(instrument_id, "1d", days + 1)
    except Exception:  # noqa: BLE001 — a missing series just drops out of the analysis
        return None
    if len(rows) < 3:
        return None
    s = pd.Series([c.close for c in rows], index=pd.to_datetime([c.open_time for c in rows], unit="ms").normalize())
    return s[~s.index.duplicated(keep="last")]


def periods_per_year(index: pd.DatetimeIndex) -> float:
    """Return observations per year actually present in the data: ~365 for 24/7 crypto, ~252 once
    anything that trades on weekdays only is in the mix. Using a fixed 365 overstates stock volatility
    and Sharpe by sqrt(365/252) ~ 20%."""
    span_days = (index[-1] - index[0]).days
    if len(index) < 2 or span_days <= 0:
        return 252.0
    return min(365.0, (len(index) - 1) * 365.25 / span_days)


def aligned_returns(closes: dict[str, pd.Series]) -> pd.DataFrame:
    """Returns between dates on which every series has a close. Aligning prices before taking
    returns keeps weekend crypto moves (they land in Monday's return) instead of dropping them."""
    return pd.DataFrame(closes).dropna().pct_change().dropna()


async def calculate_risk_metrics(username: str, days: int = 90, portfolio_ids=None) -> dict:
    """Calculate risk metrics for the user's portfolio (or the given portfolios combined)."""
    pnl = [p for p in await calculate_pnl(username, portfolio_ids) if p.get("market_value") is not None]
    if not pnl:
        return {"error": "No priced positions to analyze"}

    # Weights by exposure; a short position contributes negatively
    gross = sum(abs(p["market_value"]) for p in pnl)
    total_value = sum(p["market_value"] for p in pnl)
    if gross == 0:
        return {"error": "Portfolio value is zero"}
    weights = {p["instrument_id"]: p["market_value"] / gross for p in pnl}

    closes = {iid: await _daily_closes(iid, days) for iid in weights}
    closes = {k: v for k, v in closes.items() if v is not None}
    if not closes:
        return {"error": "Could not fetch price data"}

    frame = aligned_returns(closes)
    if len(frame) < 5:
        return {"error": "Not enough overlapping price history"}
    portfolio_returns = sum(frame[iid].values * weights[iid] for iid in frame.columns)
    ppy = periods_per_year(frame.index)

    # Sharpe Ratio (annualized, risk-free rate ~4.5%)
    risk_free = 0.045 / ppy
    excess_returns = portfolio_returns - risk_free
    sharpe = 0
    if np.std(excess_returns) > 0:
        sharpe = (np.mean(excess_returns) / np.std(excess_returns)) * np.sqrt(ppy)

    # Max Drawdown
    cumulative = np.cumprod(1 + portfolio_returns)
    peak = np.maximum.accumulate(cumulative)
    drawdown = (cumulative - peak) / peak
    max_drawdown = float(np.min(drawdown)) * 100

    # Volatility (annualized)
    volatility = float(np.std(portfolio_returns) * np.sqrt(ppy)) * 100

    # Beta vs Bitcoin and vs the S&P 500, over the same dates
    betas = {}
    for key, bench_id in BENCHMARKS.items():
        bench = await _daily_closes(bench_id, days)
        if bench is None:
            continue
        # Same price-first alignment: portfolio value index vs benchmark on common dates
        p_level = pd.Series(np.cumprod(1 + portfolio_returns), index=frame.index)
        joined = aligned_returns({"p": p_level, "b": bench})
        if len(joined) > 5 and joined["b"].var() > 0:
            betas[key] = float(joined["p"].cov(joined["b"]) / joined["b"].var())
    beta = betas.get("btc", 0.0)

    # Value at Risk (95%, one day). Returns are per unit of gross exposure, so scale by gross:
    # a long/short book's risk isn't its (smaller) net value
    var_95 = float(np.percentile(portfolio_returns, 5)) * gross

    return {
        "sharpe_ratio": round(sharpe, 3),
        "max_drawdown_pct": round(max_drawdown, 2),
        "volatility_annual_pct": round(volatility, 2),
        "beta_vs_btc": round(beta, 3),
        "beta_vs_sp500": round(betas.get("spx", 0.0), 3),
        "var_95_usd": round(var_95, 2),
        "period_days": days,
        "trading_days_per_year": round(ppy),
        "portfolio_value": round(total_value, 2),
        "num_positions": len(pnl),
    }
