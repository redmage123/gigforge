"""Portfolio history API."""

from fastapi import APIRouter, Request
from services.portfolio_history import get_history, take_snapshot
from services.user_data import get_username

router = APIRouter()


@router.get("/")
async def history(request: Request, days: int = 90):
    return get_history(get_username(request), days)


@router.post("/snapshot")
async def manual_snapshot(request: Request):
    username = get_username(request)
    entry = await take_snapshot(username)
    if not entry:
        return {"status": "no_data", "message": "No trades to snapshot"}
    return {"status": "ok", "snapshot": entry}
