"""Activity feed API endpoint."""

from fastapi import APIRouter, Query, Request
from services.activity import get_activity_feed
from services.user_data import get_username

router = APIRouter()


@router.get("/")
async def list_activity(request: Request, limit: int = Query(default=20, ge=1, le=50)):
    username = get_username(request)
    items = get_activity_feed(username, limit=limit)
    return {"items": items, "count": len(items)}
