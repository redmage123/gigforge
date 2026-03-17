"""Token unlock schedule API."""

from fastapi import APIRouter, Request, Query

router = APIRouter()


@router.get("/")
async def upcoming_unlocks(request: Request, days: int = Query(default=30)):
    username = request.state.user.get("sub", "")
    return {
        "days": days,
        "unlocks": [],
        "total_value_usd": 0.0,
        "username": username,
    }


@router.get("/calendar")
async def unlock_calendar(request: Request):
    username = request.state.user.get("sub", "")
    return {
        "calendar": [],
        "username": username,
    }


@router.get("/{token}")
async def token_unlock_impact(request: Request, token: str):
    username = request.state.user.get("sub", "")
    return {
        "token": token,
        "upcoming_unlocks": [],
        "total_locked_usd": 0.0,
        "next_unlock_date": None,
        "next_unlock_pct": 0.0,
        "price_impact_estimate": None,
        "username": username,
    }
