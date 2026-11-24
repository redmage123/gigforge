"""Personal audit log: the signed-in user's own security and account events.

Reads the tamper-evident audit trail (audit_events) when the database is available, otherwise the
older JSON log. Only events whose actor is the signed-in user are returned. Filters: a category
(action prefix such as "auth.login" or "trade"), a date range (inclusive, UTC days) and a cursor
for paging ("Load more").
"""

import re
from datetime import date, timedelta

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from services.audit import get_audit_log

router = APIRouter()

MAX_LIMIT = 100
_CATEGORY = re.compile(r"^[a-z][a-z0-9_.]{0,39}$")


def _day(value: str | None, name: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValueError(f"{name} must be a date like 2026-01-31") from None


def _entry(e: dict) -> dict:
    return {"id": e.get("id"), "timestamp": e["at"], "action": e["action"], "details": e.get("detail") or {},
            "target": e.get("target"), "ip_address": e.get("ip")}


@router.get("/")
async def audit_log(
    request: Request,
    action: str | None = Query(None, description="Category: an action or action prefix, e.g. auth.login or trade"),
    date_from: str | None = Query(None, alias="from", description="First day (YYYY-MM-DD, UTC)"),
    date_to: str | None = Query(None, alias="to", description="Last day (YYYY-MM-DD, UTC), inclusive"),
    cursor: str | None = Query(None, description="next_cursor from the previous page"),
    limit: int = Query(25, ge=1, le=MAX_LIMIT),
):
    username = (getattr(request.state, "user", None) or {}).get("sub", "")
    if not username:
        return JSONResponse({"error": "Not signed in"}, status_code=401)
    try:
        start, end = _day(date_from, "From date"), _day(date_to, "To date")
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    if start and end and start > end:
        return JSONResponse({"error": "From date must be on or before To date"}, status_code=400)
    if action and not _CATEGORY.match(action):
        return JSONResponse({"error": "Unknown action type"}, status_code=400)
    if cursor and not cursor.isdigit():
        return JSONResponse({"error": "Invalid cursor"}, status_code=400)
    since = f"{start.isoformat()}T00:00:00+00:00" if start else None
    until = f"{(end + timedelta(days=1)).isoformat()}T00:00:00+00:00" if end else None

    from services import audit_events, db

    try:
        if db.available():
            rows = audit_events.query(actor=username, action_prefix=action, since=since, until=until,
                                      before_id=int(cursor) if cursor else None, limit=limit + 1)
            more = len(rows) > limit
            rows = rows[:limit]
            return {"entries": [_entry(r) for r in rows], "next_cursor": str(rows[-1]["id"]) if more else None}

        # Older JSON log (no database): newest first, offset paging
        rows = get_audit_log(username=username, limit=10_000)
        if action:
            rows = [r for r in rows if str(r.get("action", "")).startswith(action)]
        if since:
            rows = [r for r in rows if str(r.get("timestamp", "")) >= since]
        if until:
            rows = [r for r in rows if str(r.get("timestamp", "")) < until]
        offset = int(cursor) if cursor else 0
        page = rows[offset:offset + limit]
        entries = [{"id": None, "timestamp": r.get("timestamp"), "action": r.get("action", ""),
                    "details": r.get("details") or {}, "target": None, "ip_address": r.get("ip_address")} for r in page]
        more = len(rows) > offset + limit
        return {"entries": entries, "next_cursor": str(offset + limit) if more else None}
    except Exception as exc:  # noqa: BLE001 — a readable message, not a 500 page
        print(f"[audit] personal log failed for {username}: {exc}")
        return JSONResponse({"error": "Could not load the audit log. Please try again."}, status_code=503)
