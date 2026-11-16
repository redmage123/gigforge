"""Risk metrics: annualization by the data's own calendar, price-first alignment, VaR on gross exposure."""

import asyncio
import math
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from services import risk  # noqa: E402
from services.market.models import Candle  # noqa: E402

DAY = 86_400_000
START = 1_767_225_600_000  # 2026-01-01 (Thursday) UTC


def _candles(closes_by_day: dict[int, float]) -> list[Candle]:
    return [Candle(START + d * DAY, c, c, c, c, 0.0) for d, c in sorted(closes_by_day.items())]


def _weekdays(n_days: int) -> list[int]:
    return [d for d in range(n_days) if pd.Timestamp(START + d * DAY, unit="ms").weekday() < 5]


def test_periods_per_year():
    every_day = pd.to_datetime([START + d * DAY for d in range(120)], unit="ms")
    weekdays = pd.to_datetime([START + d * DAY for d in _weekdays(120)], unit="ms")
    assert 360 <= risk.periods_per_year(every_day) <= 365
    assert 255 <= risk.periods_per_year(weekdays) <= 265  # weekdays only (holidays aside, ~252-261)


def test_weekend_moves_are_kept():
    # Crypto rises 10% over the weekend; the stock is flat. Monday's crypto return must include it.
    crypto = pd.Series({pd.Timestamp("2026-01-02"): 100.0, pd.Timestamp("2026-01-03"): 105.0,
                        pd.Timestamp("2026-01-04"): 108.0, pd.Timestamp("2026-01-05"): 110.0})
    stock = pd.Series({pd.Timestamp("2026-01-02"): 50.0, pd.Timestamp("2026-01-05"): 50.0})
    r = risk.aligned_returns({"c": crypto, "s": stock})
    assert len(r) == 1 and math.isclose(r["c"].iloc[0], 0.10)


def test_stock_portfolio_volatility_uses_trading_days():
    rng = np.random.default_rng(1)
    days = _weekdays(200)
    rets = rng.normal(0, 0.01, len(days))
    closes = dict(zip(days, 100 * np.cumprod(1 + rets)))

    async def candles(iid, tf, n):
        return _candles(closes) if iid == "stock:AAPL" else []

    async def pnl(user):
        return [{"instrument_id": "stock:AAPL", "market_value": 10_000.0}]

    with patch.object(risk.market, "candles", candles), patch.object(risk, "calculate_pnl", pnl):
        out = asyncio.run(risk.calculate_risk_metrics("u", days=300))
    observed = np.std(pd.Series(list(closes.values())).pct_change().dropna()) * 100
    assert 255 <= out["trading_days_per_year"] <= 265
    assert math.isclose(out["volatility_annual_pct"], observed * math.sqrt(out["trading_days_per_year"]), rel_tol=0.02)
    # The old fixed sqrt(365) would have overstated it by ~18%+
    assert out["volatility_annual_pct"] < observed * math.sqrt(365) * 0.9


def test_var_scales_with_gross_exposure():
    rng = np.random.default_rng(2)
    a = dict(enumerate(100 * np.cumprod(1 + rng.normal(0, 0.02, 120))))
    b = dict(enumerate(100 * np.cumprod(1 + rng.normal(0, 0.02, 120))))

    async def candles(iid, tf, n):
        return _candles(a if iid == "crypto:BTC" else b if iid == "crypto:ETH" else {})

    async def pnl(user):  # long 10k BTC, short 9k ETH: net 1k, gross 19k
        return [{"instrument_id": "crypto:BTC", "market_value": 10_000.0},
                {"instrument_id": "crypto:ETH", "market_value": -9_000.0}]

    with patch.object(risk.market, "candles", candles), patch.object(risk, "calculate_pnl", pnl):
        out = asyncio.run(risk.calculate_risk_metrics("u", days=120))
    assert out["portfolio_value"] == 1000.0
    assert out["var_95_usd"] < -500  # a 1-day 95% loss on a 19k gross book, not a few dollars on 1k net
