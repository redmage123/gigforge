"""Session management service — track active JWT sessions per user."""

import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from config import DATA_DIR

SESSIONS_FILE = DATA_DIR / "sessions.json"


def _load_sessions() -> list[dict]:
    if not SESSIONS_FILE.exists():
        return []
    try:
        return json.loads(SESSIONS_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return []


def _save_sessions(sessions: list[dict]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SESSIONS_FILE.write_text(json.dumps(sessions, indent=2))


def _hash_token(token: str) -> str:
    """SHA-256 hash of a token (we never store the raw JWT)."""
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(
    username: str,
    token: str,
    ip_address: str,
    user_agent: str,
) -> str:
    """Store a new session and return its session_id."""
    sessions = _load_sessions()
    session_id = uuid.uuid4().hex
    now = datetime.now(timezone.utc).isoformat()

    sessions.append({
        "id": session_id,
        "username": username,
        "token_hash": _hash_token(token),
        "ip_address": ip_address,
        "user_agent": user_agent,
        "created_at": now,
        "last_active": now,
        "is_active": True,
    })
    _save_sessions(sessions)
    return session_id


def get_active_sessions(username: str) -> list[dict]:
    """Return all active sessions for a user (token_hash excluded from output)."""
    sessions = _load_sessions()
    result = []
    for s in sessions:
        if s["username"] == username and s.get("is_active", False):
            entry = {k: v for k, v in s.items() if k != "token_hash"}
            result.append(entry)
    return result


def revoke_session(session_id: str) -> bool:
    """Mark a session as inactive. Returns True if found and revoked."""
    sessions = _load_sessions()
    for s in sessions:
        if s["id"] == session_id and s.get("is_active", False):
            s["is_active"] = False
            _save_sessions(sessions)
            return True
    return False


def revoke_all_sessions(username: str, except_current: str | None = None) -> int:
    """Revoke all active sessions for a user, optionally keeping one.

    Returns the number of sessions revoked.
    """
    sessions = _load_sessions()
    count = 0
    for s in sessions:
        if (
            s["username"] == username
            and s.get("is_active", False)
            and s["id"] != except_current
        ):
            s["is_active"] = False
            count += 1
    if count:
        _save_sessions(sessions)
    return count


def update_activity(session_id: str) -> None:
    """Update the last_active timestamp for a session."""
    sessions = _load_sessions()
    for s in sessions:
        if s["id"] == session_id and s.get("is_active", False):
            s["last_active"] = datetime.now(timezone.utc).isoformat()
            _save_sessions(sessions)
            return


def cleanup_expired(max_age_hours: int = 24) -> int:
    """Remove sessions older than *max_age_hours*. Returns count removed."""
    sessions = _load_sessions()
    now = datetime.now(timezone.utc)
    remaining = []
    removed = 0

    for s in sessions:
        try:
            created = datetime.fromisoformat(s["created_at"])
        except (KeyError, ValueError):
            remaining.append(s)
            continue

        age_hours = (now - created).total_seconds() / 3600
        if age_hours > max_age_hours:
            removed += 1
        else:
            remaining.append(s)

    if removed:
        _save_sessions(remaining)
    return removed
