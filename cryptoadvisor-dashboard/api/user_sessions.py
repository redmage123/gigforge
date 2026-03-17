"""User session management endpoints."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
from services.sessions import (
    get_active_sessions,
    revoke_session as svc_revoke_session,
    revoke_all_sessions as svc_revoke_all_sessions,
)

router = APIRouter()


class RevokeAllBody(BaseModel):
    current_token: Optional[str] = None


@router.get("/")
async def list_sessions(request: Request):
    try:
        username = request.state.user.get("sub", "")
        return get_active_sessions(username)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.delete("/{session_id}")
async def revoke_session(request: Request, session_id: str):
    try:
        username = request.state.user.get("sub", "")
        return svc_revoke_session(session_id)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.delete("/")
async def revoke_all_sessions(request: Request, body: RevokeAllBody = None):
    try:
        username = request.state.user.get("sub", "")
        return svc_revoke_all_sessions(username)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
