"""Audit log endpoint."""

from fastapi import APIRouter, Request, Query
from fastapi.responses import JSONResponse
from services.audit import get_audit_log

router = APIRouter()


@router.get("/")
async def audit_log(
    request: Request,
    action: str = Query(None, description="Filter by action type"),
    limit: int = Query(100, description="Max entries to return"),
):
    try:
        username = request.state.user.get("sub", "")
        return get_audit_log(username=username, action=action, limit=limit)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
