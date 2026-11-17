"""Audit logging service — append-only event log stored in data/audit_log.json."""

import json
from datetime import datetime, timezone
from pathlib import Path

from config import DATA_DIR
from services import store

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
    return store.get(store.SHARED, "audit_log", [])


def _save_log(entries: list[dict]) -> None:
    """Persist the audit log, trimming to MAX_ENTRIES."""
    store.put(store.SHARED, "audit_log", entries[-MAX_ENTRIES:])


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
