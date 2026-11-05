"""Price alerts on any instrument — checked every minute against live quotes.

Alerts are {instrument_id, direction (above|below), target_price}. Older alerts stored CoinGecko
ids in coin_id; they are converted when read. `coin_id` is kept as an alias of instrument_id.
"""

import time
import uuid

from services import market
from services.market import registry
from services.notifications import add_notification
from services.user_data import DATA_DIR, load_user_data, save_user_data

NAMESPACE = "alerts"


def normalize_alert(a: dict) -> dict:
    a = dict(a)
    iid = a.get("instrument_id")
    if not iid:
        legacy = a.get("coin_id") or ""
        iid = legacy if ":" in legacy else (registry.from_coingecko_id(legacy) or f"crypto:{legacy.upper()}")
    a["instrument_id"] = a["coin_id"] = iid
    return a


def get_alerts(username: str) -> list[dict]:
    raw = load_user_data(username, NAMESPACE)
    return [normalize_alert(a) for a in raw] if isinstance(raw, list) else []


def _save(username: str, alerts: list[dict]) -> None:
    save_user_data(username, NAMESPACE, alerts)


def add_alert(username: str, instrument_id: str, direction: str, target_price: float,
              notes: str = "", support: float = 0, resistance: float = 0) -> dict:
    if direction not in ("above", "below"):
        raise ValueError("direction must be above or below")
    if target_price <= 0:
        raise ValueError("target price must be positive")
    alerts = get_alerts(username)
    entry = normalize_alert({
        "id": str(uuid.uuid4())[:8], "instrument_id": instrument_id, "direction": direction,
        "target_price": target_price, "notes": notes[:500], "support": support, "resistance": resistance,
        "active": True, "created_at": time.time(), "triggered_at": None,
    })
    alerts.append(entry)
    _save(username, alerts)
    return entry


def remove_alert(username: str, alert_id: str) -> bool:
    alerts = get_alerts(username)
    kept = [a for a in alerts if a["id"] != alert_id]
    _save(username, kept)
    return len(kept) != len(alerts)


def update_alert(username: str, alert_id: str, updates: dict) -> dict | None:
    alerts = get_alerts(username)
    for a in alerts:
        if a["id"] == alert_id:
            a.update(updates)
            _save(username, alerts)
            return a
    return None


def get_alert_history(username: str) -> list[dict]:
    """Triggered (inactive) alerts."""
    return [a for a in get_alerts(username) if a.get("triggered_at")]


def crossed(alert: dict, price: float) -> bool:
    return price >= alert["target_price"] if alert["direction"] == "above" else price <= alert["target_price"]


async def check_all_alerts():
    """Background task: check all users' active alerts against live quotes (any asset class)."""
    alerts_dir = DATA_DIR / NAMESPACE
    if not alerts_dir.exists():
        return
    user_alerts = {}
    wanted = set()
    for f in alerts_dir.glob("*.json"):
        alerts = get_alerts(f.stem)
        active = [a for a in alerts if a.get("active")]
        if active:
            user_alerts[f.stem] = alerts
            wanted.update(a["instrument_id"] for a in active)
    if not wanted:
        return
    try:
        quotes = await market.quotes(sorted(wanted))
    except Exception:  # noqa: BLE001 — try again next minute
        return

    for username, alerts in user_alerts.items():
        changed = False
        for alert in alerts:
            q = quotes.get(alert["instrument_id"])
            # A cached quote from before an outage could fire on an old price: wait for a fresh one
            if not alert.get("active") or not q or q.stale or not crossed(alert, q.price):
                continue
            inst = registry.get(alert["instrument_id"])
            name = inst.name if inst else alert["instrument_id"]
            alert["active"] = False
            alert["triggered_at"] = time.time()
            alert["triggered_price"] = q.price
            changed = True
            add_notification(
                username,
                f"Price Alert: {name}",
                f"{name} is {q.price:,.{inst.price_decimals if inst else 2}f} "
                f"({alert['direction']} {alert['target_price']:,})",
                category="alert",
            )
        if changed:
            _save(username, alerts)
