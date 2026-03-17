"""Per-user activity feed aggregator — reads from trades, alerts, and notifications."""

from services.trades import get_trades
from services.alerts import get_alerts
from services.notifications import get_notifications


def get_activity_feed(username: str, limit: int = 20) -> list[dict]:
    """Aggregate recent activity from multiple sources into a single timeline.

    Returns items sorted by timestamp (newest first), capped at `limit`.
    """
    items: list[dict] = []

    # --- Trades ---
    for t in get_trades(username):
        items.append({
            "type": "trade",
            "title": f"Trade: {t['side']} {t['coin_id']}",
            "description": f"{t['quantity']} @ ${t['price']}",
            "timestamp": t.get("created_at", 0),
            "icon": "swap",
        })

    # --- Triggered alerts ---
    for a in get_alerts(username):
        if not a.get("triggered_at"):
            continue
        items.append({
            "type": "alert",
            "title": f"Alert Triggered: {a['coin_id']}",
            "description": f"{a['direction']} ${a['target_price']}",
            "timestamp": a["triggered_at"],
            "icon": "bell",
        })

    # --- Notifications ---
    for n in get_notifications(username):
        items.append({
            "type": "notification",
            "title": n.get("title", ""),
            "description": n.get("message", ""),
            "timestamp": n.get("timestamp", 0),
            "icon": "info",
        })

    # Sort newest-first and cap
    items.sort(key=lambda x: x["timestamp"], reverse=True)
    return items[:limit]
