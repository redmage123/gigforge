"""Sign-in sessions: every session token names a server-side session that can be revoked.

A token is accepted only while its session exists, has not expired and has not been revoked
(services.auth.verify_session_token). Sessions live in the Postgres `sessions` table; without
DATABASE_URL (local development, most tests) they are kept in memory and end on restart.

Revocation takes effect at once in this process (the cache entry is dropped). Lookups are cached
for CACHE_SECONDS, so with several worker processes another worker could honor a revoked session for
at most that long. Production runs one worker.
"""

import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

from services import db, store

CACHE_SECONDS = 15
TOUCH_SECONDS = 60          # write last_seen_at at most this often per session
KEEP_DAYS = 30              # ended sessions are kept this long for the activity history

_lock = threading.Lock()
_cache: dict[str, tuple[float, str | None]] = {}   # sid -> (checked_at, username if active else None)
_touched: dict[str, float] = {}
_memory: dict[str, dict] = {}                       # sid -> session (no-Postgres backend)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(v):
    return v.isoformat() if isinstance(v, datetime) else v


def _pg() -> bool:
    return store.using_postgres()


def create(username: str, hours: float, ip: str | None = None, user_agent: str | None = None,
           method: str | None = None) -> str:
    """Start a session; returns its id (the token's `sid` claim)."""
    sid = secrets.token_urlsafe(24)
    now = _now()
    row = {"id": sid, "username": username, "created_at": now, "expires_at": now + timedelta(hours=hours),
           "last_seen_at": now, "ip": (ip or "")[:64], "user_agent": (user_agent or "")[:300],
           "method": (method or "")[:32], "revoked_at": None, "revoked_reason": None}
    if _pg():
        with db.conn() as c:
            c.execute("INSERT INTO sessions (id, username, created_at, expires_at, last_seen_at, ip, user_agent, method) "
                      "VALUES (%(id)s, %(username)s, %(created_at)s, %(expires_at)s, %(last_seen_at)s, %(ip)s, "
                      "%(user_agent)s, %(method)s)", row)
            c.commit()
    else:
        with _lock:
            _memory[sid] = row
    return sid


def _lookup(sid: str) -> str | None:
    """Username of an active session, else None (uncached)."""
    if _pg():
        with db.conn() as c:
            r = c.execute("SELECT username FROM sessions WHERE id = %s AND revoked_at IS NULL AND expires_at > now()",
                          (sid,)).fetchone()
        return r[0] if r else None
    s = _memory.get(sid)
    return s["username"] if s and not s["revoked_at"] and s["expires_at"] > _now() else None


def is_active(sid: str | None, username: str | None) -> bool:
    """True when `sid` is a live session belonging to `username`. Fails closed on errors."""
    if not sid or not username:
        return False
    now = time.monotonic()
    hit = _cache.get(sid)
    if hit and now - hit[0] < CACHE_SECONDS:
        return hit[1] == username
    try:
        owner = _lookup(sid)
    except Exception as exc:  # database unreachable: refuse rather than accept unchecked tokens
        print(f"[sessions] lookup failed: {exc}")
        return False
    _cache[sid] = (now, owner)
    return owner == username


def touch(sid: str) -> None:
    """Record activity (throttled)."""
    now = time.monotonic()
    if now - _touched.get(sid, 0) < TOUCH_SECONDS:
        return
    _touched[sid] = now
    try:
        if _pg():
            with db.conn() as c:
                c.execute("UPDATE sessions SET last_seen_at = now() WHERE id = %s AND revoked_at IS NULL", (sid,))
                c.commit()
        elif sid in _memory:
            _memory[sid]["last_seen_at"] = _now()
    except Exception as exc:
        print(f"[sessions] touch failed: {exc}")


def _public(row: dict, current: str | None) -> dict:
    return {"id": row["id"], "created_at": _iso(row["created_at"]), "last_seen_at": _iso(row["last_seen_at"]),
            "expires_at": _iso(row["expires_at"]), "ip": row["ip"] or "", "user_agent": row["user_agent"] or "",
            "method": row["method"] or "", "current": row["id"] == current}


def list_active(username: str, current: str | None = None) -> list[dict]:
    """The user's live sessions, newest activity first."""
    if _pg():
        with db.conn() as c:
            cur = c.execute("SELECT id, created_at, last_seen_at, expires_at, ip, user_agent, method FROM sessions "
                            "WHERE username = %s AND revoked_at IS NULL AND expires_at > now() "
                            "ORDER BY last_seen_at DESC", (username,))
            cols = [d.name for d in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    else:
        now = _now()
        rows = sorted((s for s in _memory.values() if s["username"] == username and not s["revoked_at"]
                       and s["expires_at"] > now), key=lambda s: s["last_seen_at"], reverse=True)
    return [_public(r, current) for r in rows]


def _end(username: str, reason: str, sid: str | None = None, keep: str | None = None) -> list[str]:
    """Revoke the user's live sessions (one, or all except `keep`); returns the ids ended."""
    if _pg():
        sql = ("UPDATE sessions SET revoked_at = now(), revoked_reason = %s "
               "WHERE username = %s AND revoked_at IS NULL")
        args: list = [reason, username]
        if sid:
            sql += " AND id = %s"
            args.append(sid)
        if keep:
            sql += " AND id <> %s"
            args.append(keep)
        with db.conn() as c:
            ended = [r[0] for r in c.execute(sql + " RETURNING id", args).fetchall()]
            c.commit()
    else:
        ended = []
        with _lock:
            for s in _memory.values():
                if (s["username"] == username and not s["revoked_at"] and (not sid or s["id"] == sid)
                        and s["id"] != keep):
                    s["revoked_at"], s["revoked_reason"] = _now(), reason
                    ended.append(s["id"])
    for e in ended:
        _cache.pop(e, None)
    return ended


def revoke(username: str, sid: str, reason: str = "revoked") -> bool:
    """End one of the user's own sessions. A session id of someone else's is treated as not found."""
    return bool(_end(username, reason, sid=sid))


def revoke_all(username: str, keep: str | None = None, reason: str = "revoked") -> int:
    """End every session of the user, except `keep` (usually the caller's current one)."""
    return len(_end(username, reason, keep=keep))


def forget(username: str) -> int:
    """Delete the user's session records (account deletion)."""
    ended = _end(username, "account_deleted")
    if _pg():
        with db.conn() as c:
            n = c.execute("DELETE FROM sessions WHERE username = %s", (username,)).rowcount
            c.commit()
        return n
    with _lock:
        gone = [k for k, s in _memory.items() if s["username"] == username]
        for k in gone:
            del _memory[k]
    return max(len(gone), len(ended))


async def cleanup() -> None:
    """Scheduler: drop sessions that ended (expired or revoked) more than KEEP_DAYS ago."""
    cutoff = _now() - timedelta(days=KEEP_DAYS)
    try:
        if _pg():
            with db.conn() as c:
                n = c.execute("DELETE FROM sessions WHERE expires_at < %s OR revoked_at < %s", (cutoff, cutoff)).rowcount
                c.commit()
        else:
            with _lock:
                gone = [k for k, s in _memory.items()
                        if s["expires_at"] < cutoff or (s["revoked_at"] and s["revoked_at"] < cutoff)]
                for k in gone:
                    del _memory[k]
            n = len(gone)
        if n:
            print(f"[sessions] removed {n} old session records")
    except Exception as exc:
        print(f"[sessions] cleanup failed: {exc}")
    for k in [k for k, t in _cache.items() if time.monotonic() - t[0] > CACHE_SECONDS]:
        _cache.pop(k, None)
    for k in [k for k, t in _touched.items() if time.monotonic() - t > TOUCH_SECONDS]:
        _touched.pop(k, None)


def _reset_for_tests() -> None:
    _cache.clear()
    _touched.clear()
    _memory.clear()
