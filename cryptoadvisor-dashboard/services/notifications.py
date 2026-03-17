"""In-app notification system — per-user notification storage."""

import time
import uuid
from services.user_data import load_user_data, save_user_data


def add_notification(username: str, title: str, message: str, category: str = "info") -> dict:
    """Add a notification for a user."""
    notifs = load_user_data(username, "notifications")
    entry = {
        "id": str(uuid.uuid4())[:8],
        "title": title,
        "message": message,
        "category": category,  # info, alert, trade, whale
        "read": False,
        "timestamp": time.time(),
    }
    notifs.insert(0, entry)
    # Keep last 100 notifications
    notifs = notifs[:100]
    save_user_data(username, "notifications", notifs)
    return entry


def get_notifications(username: str, unread_only: bool = False) -> list[dict]:
    notifs = load_user_data(username, "notifications")
    if unread_only:
        return [n for n in notifs if not n.get("read")]
    return notifs


def mark_read(username: str, notification_id: str = None):
    """Mark one or all notifications as read."""
    notifs = load_user_data(username, "notifications")
    for n in notifs:
        if notification_id is None or n["id"] == notification_id:
            n["read"] = True
    save_user_data(username, "notifications", notifs)


def get_unread_count(username: str) -> int:
    return len(get_notifications(username, unread_only=True))
