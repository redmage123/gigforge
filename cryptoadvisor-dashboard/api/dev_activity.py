"""Developer activity scoring API."""

from fastapi import APIRouter, Request, Query

router = APIRouter()


@router.get("/{coin}")
async def dev_activity_score(request: Request, coin: str):
    username = request.state.user.get("sub", "")
    return {
        "coin": coin,
        "score": 0.0,
        "commits_30d": 0,
        "contributors": 0,
        "last_commit": None,
        "repo_url": None,
        "username": username,
    }


@router.get("/compare")
async def compare_dev_activity(request: Request, coins: str = Query(default="")):
    username = request.state.user.get("sub", "")
    coin_list = [c.strip() for c in coins.split(",") if c.strip()]
    return {
        "coins": coin_list,
        "comparison": [],
        "username": username,
    }
