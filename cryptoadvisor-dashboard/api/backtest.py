"""Portfolio backtesting API."""

from fastapi import APIRouter, Request, Query
from pydantic import BaseModel
from typing import List

router = APIRouter()


class BacktestPortfolio(BaseModel):
    original_coin: str
    alternative_coin: str
    start_date: str
    amount_usd: float


class BacktestCompare(BaseModel):
    coins: List[str]
    start_date: str
    amount: float


@router.post("/portfolio")
async def run_backtest(request: Request, body: BacktestPortfolio):
    username = request.state.user.get("sub", "")
    return {
        "original_coin": body.original_coin,
        "alternative_coin": body.alternative_coin,
        "start_date": body.start_date,
        "amount_usd": body.amount_usd,
        "original_result": 0.0,
        "alternative_result": 0.0,
        "difference_usd": 0.0,
        "difference_pct": 0.0,
        "username": username,
    }


@router.post("/compare")
async def compare_strategies(request: Request, body: BacktestCompare):
    username = request.state.user.get("sub", "")
    return {
        "coins": body.coins,
        "start_date": body.start_date,
        "amount": body.amount,
        "results": [],
        "best_performer": None,
        "username": username,
    }
