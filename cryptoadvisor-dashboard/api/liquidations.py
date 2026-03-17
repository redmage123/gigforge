"""Liquidations tracking API."""

from fastapi import APIRouter, Request, Query

router = APIRouter()


@router.get("/")
async def recent_liquidations(request: Request):
    username = request.state.user.get("sub", "")
    return {
        "liquidations": [],
        "total_24h_usd": 0.0,
        "username": username,
    }


@router.get("/summary")
async def liquidation_summary(request: Request):
    username = request.state.user.get("sub", "")
    return {
        "total_24h_usd": 0.0,
        "long_pct": 0.0,
        "short_pct": 0.0,
        "largest": None,
        "by_exchange": {},
        "username": username,
    }
