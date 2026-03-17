"""Audit logging service — append-only event log stored in data/audit_log.json."""

import json
from datetime import datetime, timezone
from pathlib import Path

from config import DATA_DIR

AUDIT_FILE = DATA_DIR / "audit_log.json"
MAX_ENTRIES = 10_000

# Recognized action constants (for documentation; not enforced at runtime)
ACTIONS = [
    "login",
    "logout",
    "login_failed",
    "password_change",
    "2fa_enable",
    "2fa_disable",
    "alert_create",
    "alert_delete",
    "trade_add",
    "exchange_add",
    "exchange_remove",
    "wallet_add",
    "wallet_remove",
    "settings_change",
]


def _load_log() -> list[dict]:
    """Load the audit log from disk."""
    if not AUDIT_FILE.exists():
        return []
    try:
        return json.loads(AUDIT_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return []


def _save_log(entries: list[dict]) -> None:
    """Persist the audit log to disk, trimming to MAX_ENTRIES."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    # Keep only the most recent entries
    if len(entries) > MAX_ENTRIES:
        entries = entries[-MAX_ENTRIES:]
    AUDIT_FILE.write_text(json.dumps(entries, indent=2))


def log_event(
    username: str,
    action: str,
    details: str = "",
    ip_address: str = "",
) -> None:
    """Append an audit event."""
    entries = _load_log()
    entries.append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "username": username,
        "action": action,
        "details": details,
        "ip_address": ip_address,
    })
    _save_log(entries)


def get_audit_log(
    username: str | None = None,
    action: str | None = None,
    limit: int = 100,
) -> list[dict]:
    """Return audit entries, optionally filtered by username and/or action.

    Results are returned newest-first, capped at *limit*.
    """
    entries = _load_log()

    if username is not None:
        entries = [e for e in entries if e.get("username") == username]
    if action is not None:
        entries = [e for e in entries if e.get("action") == action]

    # Newest first
    entries.reverse()
    return entries[:limit]
