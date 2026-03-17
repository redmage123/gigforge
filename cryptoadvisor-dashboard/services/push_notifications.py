"""Browser push notification service — subscription storage and notification dispatch.

Note: Actual Web Push delivery requires pywebpush + VAPID keys. This module
stores subscriptions and returns notification payloads; the frontend uses the
browser Notification API directly for now.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from config import DATA_DIR

SUBSCRIPTIONS_FILE = DATA_DIR / "push_subscriptions.json"


def _load_subscriptions() -> dict[str, list[dict]]:
    """Load subscriptions keyed by username."""
    if not SUBSCRIPTIONS_FILE.exists():
        return {}
    try:
        return json.loads(SUBSCRIPTIONS_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def _save_subscriptions(data: dict[str, list[dict]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SUBSCRIPTIONS_FILE.write_text(json.dumps(data, indent=2))


def subscribe(username: str, subscription: dict) -> None:
    """Store a Web Push subscription for a user.

    *subscription* should contain at minimum an 'endpoint' key plus 'keys'.
    Duplicate endpoints for the same user are silently replaced.
    """
    data = _load_subscriptions()
    user_subs = data.get(username, [])

    # Replace if endpoint already exists
    endpoint = subscription.get("endpoint", "")
    user_subs = [s for s in user_subs if s.get("endpoint") != endpoint]
    subscription["subscribed_at"] = datetime.now(timezone.utc).isoformat()
    user_subs.append(subscription)

    data[username] = user_subs
    _save_subscriptions(data)


def unsubscribe(username: str, endpoint: str) -> None:
    """Remove a subscription by endpoint."""
    data = _load_subscriptions()
    user_subs = data.get(username, [])
    data[username] = [s for s in user_subs if s.get("endpoint") != endpoint]
    if not data[username]:
        del data[username]
    _save_subscriptions(data)


def get_subscriptions(username: str) -> list[dict]:
    """Return all push subscriptions for a user."""
    data = _load_subscriptions()
    return data.get(username, [])


def send_notification(
    username: str,
    title: str,
    body: str,
    url: str = "",
) -> int:
    """Prepare a notification for all of a user's subscriptions.

    Returns the number of subscriptions the notification would be sent to.
    In the current implementation this only builds the payload; actual Web Push
    delivery is deferred until pywebpush + VAPID keys are configured.
    """
    subs = get_subscriptions(username)
    if not subs:
        return 0

    # Build notification payload (frontend can use this via polling or SSE)
    _payload = {
        "title": title,
        "body": body,
        "url": url,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # TODO: When pywebpush is available, iterate subs and call
    # webpush(subscription_info=sub, data=json.dumps(_payload), vapid_private_key=..., vapid_claims=...)

    return len(subs)
