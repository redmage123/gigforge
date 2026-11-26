"""BACSWN — live audience poll API for on-stage presentations.

What: public endpoints the audience's phones use (read the active poll, vote, read
revealed results) and admin endpoints the presenter uses (activate, reveal, reset,
see every poll's results).

Why: the Paris talk asks the room a question before each live demo. Phones must work
without an account, so the audience routes are public; only the presenter can steer.

How: thin wrappers over services/live_audience.py. Audience routes live under
``/api/live/`` (listed as public in middleware/auth.py and exempt from the per-IP rate
limiter, because a conference room shares one Wi-Fi address); presenter routes live
under ``/api/live-admin/`` and require an admin token. Errors are BacswnError
subclasses rendered by main.py's handler.
"""

from fastapi import APIRouter, Request

from services import live_audience as live
from services.errors import BacswnPermissionError, BacswnValidationError

router = APIRouter()
admin_router = APIRouter()


async def _body(request: Request) -> dict:
    """The JSON request body as a dict (empty when missing or not an object)."""
    try:
        data = await request.json()
    except ValueError:
        data = None
    return data if isinstance(data, dict) else {}


def _require_admin(request: Request) -> None:
    """Only an administrator (the presenter) may steer the polls.

    Raises:
        BacswnPermissionError: the caller is not an admin.
    """
    user = getattr(request.state, "user", None) or {}
    if user.get("role") != "admin":
        raise BacswnPermissionError("Only the presenter can control the polls")


# ── Audience (public) ───────────────────────────────────────────────────

@router.get("/state")
async def live_state():
    """The active poll (question and options; answer once revealed) and a change stamp."""
    return live.state()


@router.post("/vote")
async def live_vote(request: Request):
    """Record a phone's answer: ``{"poll", "client", "choice"}``."""
    body = await _body(request)
    return live.vote(str(body.get("poll") or ""), body.get("client"), str(body.get("choice") or ""))


@router.get("/revealed")
async def live_revealed():
    """Every revealed poll with its question, options and counts (for the phone's results tab)."""
    return {"polls": live.revealed()}


@router.get("/results/{poll_id}")
async def live_results(poll_id: str):
    """Counts for a poll, available to the audience only once the presenter reveals it."""
    res = live.results(poll_id)
    if not res["revealed"]:
        raise BacswnValidationError("Results are not revealed yet")
    return res


# ── Presenter (admin) ───────────────────────────────────────────────────

@admin_router.get("/polls")
async def live_polls(request: Request):
    """Every poll with live counts, whether or not revealed."""
    _require_admin(request)
    return {"polls": live.polls(), **live.state()}


@admin_router.post("/control")
async def live_control(request: Request):
    """Set the active poll and reveal/hide answers: ``{"active"?, "reveal"?, "hide"?}``."""
    _require_admin(request)
    body = await _body(request)
    return live.control(body.get("active"), body.get("reveal"), body.get("hide"))


@admin_router.post("/reset")
async def live_reset(request: Request):
    """Clear all votes and close voting (before a rehearsal or the talk)."""
    _require_admin(request)
    return live.reset()
