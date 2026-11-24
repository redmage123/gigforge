"""Portfolio backtesting API."""

from datetime import date
from typing import List

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from services import portfolio_backtest as bt

router = APIRouter()


class BacktestPortfolio(BaseModel):
    original_coin: str = Field(min_length=1, max_length=64)  # instrument id, ticker or CoinGecko id
    alternative_coin: str = Field(min_length=1, max_length=64)
    start_date: date
    amount_usd: float = Field(gt=0, le=1e12)


class BacktestCompare(BaseModel):
    coins: List[str] = Field(min_length=2, max_length=10)
    start_date: date
    amount_usd: float = Field(gt=0, le=1e12)


def _error(exc: bt.BacktestError) -> JSONResponse:
    return JSONResponse({"detail": str(exc)}, status_code=exc.status)


@router.post("/portfolio")
async def run_backtest(body: BacktestPortfolio):
    try:
        return await bt.backtest_portfolio(body.original_coin, body.alternative_coin, body.start_date, body.amount_usd)
    except bt.BacktestError as exc:
        return _error(exc)


@router.post("/compare")
async def compare_strategies(body: BacktestCompare):
    try:
        return await bt.compare(body.coins, body.start_date, body.amount_usd)
    except bt.BacktestError as exc:
        return _error(exc)
