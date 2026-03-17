"""Price alerts and watchlist — check prices against user thresholds."""

import time
import uuid
from pathlib import Path
from services.user_data import load_user_data, save_user_data, DATA_DIR
from services.coingecko import get_prices
from services.notifications import add_notification


def get_alerts(username: str) -> list[dict]:
    return load_user_data(username, "alerts")


def add_alert(username: str, coin_id: str, direction: str, target_price: float,
              notes: str = "", support: float = 0, resistance: float = 0) -> dict:
    alerts = get_alerts(username)
    entry = {
        "id": str(uuid.uuid4())[:8],
        "coin_id": coin_id,
        "direction": direction,  # "above" or "below"
        "target_price": target_price,
        "notes": notes,
        "support": support,
        "resistance": resistance,
        "active": True,
        "created_at": time.time(),
        "triggered_at": None,
    }
    alerts.append(entry)
    save_user_data(username, "alerts", alerts)
    return entry


def remove_alert(username: str, alert_id: str) -> bool:
    alerts = get_alerts(username)
    alerts = [a for a in alerts if a["id"] != alert_id]
    save_user_data(username, "alerts", alerts)
    return True


def update_alert(username: str, alert_id: str, updates: dict) -> dict | None:
    alerts = get_alerts(username)
    for a in alerts:
        if a["id"] == alert_id:
            a.update(updates)
            save_user_data(username, "alerts", alerts)
            return a
    return None


def get_alert_history(username: str) -> list[dict]:
    """Get triggered (inactive) alerts."""
    return [a for a in get_alerts(username) if a.get("triggered_at")]


async def check_all_alerts():
    """Background task: check all users' alerts against current prices."""
    alerts_dir = DATA_DIR / "alerts"
    if not alerts_dir.exists():
        return

    # Collect all unique coins needed
    all_coins = set()
    user_files = list(alerts_dir.glob("*.json"))
    user_alerts = {}
    for f in user_files:
        username = f.stem
        alerts = load_user_data(username, "alerts")
        active = [a for a in alerts if a.get("active")]
        if active:
            user_alerts[username] = alerts
            for a in active:
                all_coins.add(a["coin_id"])

    if not all_coins:
        return

    # Fetch prices
    try:
        prices = await get_prices(tuple(all_coins))
    except Exception:
        return

    # Check each alert
    for username, alerts in user_alerts.items():
        changed = False
        for alert in alerts:
            if not alert.get("active"):
                continue
            coin_price = prices.get(alert["coin_id"], {}).get("usd")
            if coin_price is None:
                continue

            triggered = False
            if alert["direction"] == "above" and coin_price >= alert["target_price"]:
                triggered = True
            elif alert["direction"] == "below" and coin_price <= alert["target_price"]:
                triggered = True

            if triggered:
                alert["active"] = False
                alert["triggered_at"] = time.time()
                changed = True
                add_notification(
                    username,
                    f"Price Alert: {alert['coin_id'].title()}",
                    f"{alert['coin_id'].title()} is ${coin_price:,.2f} "
                    f"({alert['direction']} ${alert['target_price']:,.2f})",
                    category="alert",
                )

        if changed:
            save_user_data(username, "alerts", alerts)
