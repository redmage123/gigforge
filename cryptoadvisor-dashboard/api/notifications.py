"""Notification API endpoints."""

from fastapi import APIRouter, Request
from services.notifications import get_notifications, mark_read, get_unread_count
from services.user_data import get_username

router = APIRouter()


@router.get("/")
async def list_notifications(request: Request, unread_only: bool = False):
    username = get_username(request)
    return {
        "notifications": get_notifications(username, unread_only),
        "unread_count": get_unread_count(username),
    }


@router.post("/read")
async def mark_notifications_read(request: Request, notification_id: str = None):
    username = get_username(request)
    mark_read(username, notification_id)
    return {"status": "ok"}
