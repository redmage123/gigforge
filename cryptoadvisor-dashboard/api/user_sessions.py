"""Active sessions: list your sign-ins and end any of them (one, or every one except this device)."""

from fastapi import APIRouter, HTTPException, Request

from services import audit_events, sessions

router = APIRouter()


def _me(request: Request) -> tuple[str, str | None]:
    state = getattr(request.state, "user", None) or {}
    if not state.get("sub"):
        raise HTTPException(401, "Not authenticated")
    return state["sub"], state.get("sid")


@router.get("/")
async def list_sessions(request: Request):
    username, current = _me(request)
    return {"sessions": sessions.list_active(username, current)}


@router.post("/revoke-others")
async def revoke_others(request: Request):
    username, current = _me(request)
    ended = sessions.revoke_all(username, keep=current, reason="revoked_by_user")
    audit_events.from_request(request, "auth.sessions_revoke_others", detail={"ended": ended})
    return {"ended": ended}


@router.delete("/{session_id}")
async def revoke_session(request: Request, session_id: str):
    username, current = _me(request)
    if session_id == current:
        raise HTTPException(400, "This is the session you're using. Log out instead.")
    # Only the caller's own sessions match; anyone else's id answers as not found
    if not sessions.revoke(username, session_id, reason="revoked_by_user"):
        raise HTTPException(404, "No such active session")
    audit_events.from_request(request, "auth.session_revoke", detail={"session": session_id[:8]})
    return {"ended": 1}
