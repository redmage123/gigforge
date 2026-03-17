"""DeFi yield aggregation API."""

from fastapi import APIRouter, Request, Query

router = APIRouter()


@router.get("/")
async def top_yields(request: Request):
    username = request.state.user.get("sub", "")
    return {
        "yields": [],
        "updated_at": None,
        "username": username,
    }


@router.get("/token/{token}")
async def token_yields(request: Request, token: str):
    username = request.state.user.get("sub", "")
    return {
        "token": token,
        "yields": [],
        "best_apy": 0.0,
        "username": username,
    }


@router.get("/summary")
async def yield_summary(request: Request):
    username = request.state.user.get("sub", "")
    return {
        "low_risk": [],
        "medium_risk": [],
        "high_risk": [],
        "avg_apy_by_risk": {"low": 0.0, "medium": 0.0, "high": 0.0},
        "username": username,
    }
