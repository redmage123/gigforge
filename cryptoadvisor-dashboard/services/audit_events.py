"""Tamper-evident audit trail (Postgres table audit_events).

Every row stores hash = sha256(prev_hash + canonical(row)), so changing or removing any past row
breaks the chain, which verify_chain() detects. A database trigger also refuses UPDATE, DELETE and
TRUNCATE (the only permitted change is anonymizing the actor of a deleted account).

record() never raises: auditing must not break the action being audited. Failures are printed and
counted so monitoring can notice them.
"""

import hashlib
import json
from datetime import datetime, timezone

from services import db

GENESIS = "0" * 64
ANON = "deleted-user"
failures = 0


def _canonical(at: str, actor: str, action: str, firm_id, target, ip, detail: dict) -> str:
    return json.dumps({"at": at, "actor": actor, "action": action, "firm_id": firm_id, "target": target,
                       "ip": ip, "detail": detail}, sort_keys=True, separators=(",", ":"), default=str)


def record(actor: str, action: str, *, firm_id: str | None = None, target: str | None = None,
           ip: str | None = None, detail: dict | None = None) -> None:
    global failures
    if not db.available():
        return
    detail = detail or {}
    try:
        with db.conn() as c:
            with c.transaction():
                c.execute("SELECT pg_advisory_xact_lock(4242)")  # one writer extends the chain at a time
                row = c.execute("SELECT hash FROM audit_events ORDER BY id DESC LIMIT 1").fetchone()
                prev = row[0] if row else GENESIS
                at = datetime.now(timezone.utc).isoformat(timespec="microseconds")
                h = hashlib.sha256((prev + _canonical(at, actor, action, firm_id, target, ip, detail)).encode()).hexdigest()
                c.execute("INSERT INTO audit_events (at, actor, action, firm_id, target, ip, detail, prev_hash, hash) "
                          "VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)",
                          (at, actor, action, firm_id, target, ip, json.dumps(detail, default=str), prev, h))
    except Exception as exc:  # noqa: BLE001
        failures += 1
        print(f"[audit] could not record {action} by {actor}: {exc}")


def from_request(request, action: str, **kw) -> None:
    """record() with the signed-in user and client IP taken from the request."""
    from middleware.client_ip import client_ip

    user = (getattr(request.state, "user", None) or {}).get("sub") or kw.pop("actor", None) or "anonymous"
    kw.pop("actor", None)
    record(user, action, ip=client_ip(request.scope), **kw)


def query(*, firm_id: str | None = None, actor: str | None = None, action: str | None = None,
          since: str | None = None, until: str | None = None, limit: int = 200, before_id: int | None = None,
          action_prefix: str | None = None) -> list[dict]:
    where, args = [], []
    for col, val in (("firm_id", firm_id), ("actor", actor), ("action", action)):
        if val:
            where.append(f"{col} = %s")
            args.append(val)
    if action_prefix:  # a category such as "auth.login" or "trade"; LIKE wildcards in it are literal
        where.append("action LIKE %s ESCAPE '\\'")
        args.append(action_prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%")
    if since:
        where.append("at >= %s")
        args.append(since)
    if until:
        where.append("at < %s")
        args.append(until)
    if before_id:
        where.append("id < %s")
        args.append(before_id)
    sql = ("SELECT id, at, actor, action, firm_id, target, ip, detail, hash FROM audit_events"
           + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY id DESC LIMIT %s")
    with db.conn() as c:
        rows = c.execute(sql, (*args, min(max(limit, 1), 5000))).fetchall()
    return [{"id": r[0], "at": r[1].isoformat(), "actor": r[2], "action": r[3], "firm_id": r[4], "target": r[5],
             "ip": r[6], "detail": r[7], "hash": r[8]} for r in rows]


def verify_chain() -> dict:
    """Recompute every hash. Anonymized actors are accepted (the row's original hash used the old name)."""
    prev, n, bad = GENESIS, 0, None
    with db.conn() as c:
        cur = c.cursor(name="audit_verify")  # server-side cursor: constant memory
        cur.execute("SELECT id, at, actor, action, firm_id, target, ip, detail, prev_hash, hash FROM audit_events ORDER BY id")
        for rid, at, actor, action, firm_id, target, ip, detail, prev_hash, h in cur:
            n += 1
            if prev_hash != prev:
                bad = bad or {"id": rid, "problem": "chain broken (a row was removed or reordered)"}
            at_s = at.astimezone(timezone.utc).isoformat(timespec="microseconds")
            expect = hashlib.sha256((prev_hash + _canonical(at_s, actor, action, firm_id, target, ip, detail)).encode()).hexdigest()
            if expect != h and actor != ANON:
                bad = bad or {"id": rid, "problem": "row content changed"}
            prev = h
        cur.close()
    return {"ok": bad is None, "events": n, "first_problem": bad}


def anonymize(username: str) -> int:
    """Account deletion: keep the events (the record of what happened) but drop the name."""
    if not db.available():
        return 0
    with db.conn() as c:
        n = c.execute("UPDATE audit_events SET actor = %s WHERE actor = %s", (ANON, username)).rowcount
        c.commit()
    return n


async def daily_integrity_check() -> None:
    """Scheduler: verify the hash chain; tell platform admins at once if it is broken or writes are failing."""
    if not db.available():
        return
    from services.auth import load_users
    from services.notifications import add_notification

    result = verify_chain()
    problems = []
    if not result["ok"]:
        problems.append(f"audit trail integrity check failed at event {result['first_problem']['id']}: "
                        f"{result['first_problem']['problem']}")
    if failures:
        problems.append(f"{failures} audit event(s) could not be recorded since the last restart")
    print(f"[audit] integrity: {result['events']} events, ok={result['ok']}, write failures={failures}")
    for p in problems:
        for u in load_users():
            if u.get("role") == "admin":
                add_notification(u["username"], "Security: audit trail problem", p, category="security")
