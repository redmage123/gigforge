"""Portfolio sharing API. /view/{token} is public (allowed without login in middleware/auth.py)."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from services import portfolios, trades
from services.share_portfolio import (
    ShareError,
    build_snapshot,
    create_share,
    get_shared_portfolio,
    get_user_shares,
    revoke_share,
)

router = APIRouter()


class ShareRequest(BaseModel):
    title: str = Field("", max_length=60)
    show_values: bool = False   # dollar values per holding and in total
    show_returns: bool = False  # unrealized return per holding and in total


def _username(request: Request) -> str:
    return getattr(request.state, "user", {}).get("sub", "")


@router.post("/")
async def generate_share_link(request: Request, body: ShareRequest | None = None):
    body = body or ShareRequest()
    username = _username(request)
    try:
        scope = portfolios.request_scope(request, username)
    except portfolios.AccessError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=exc.status)
    if scope.role != "owner" or scope.owner != username:
        return JSONResponse({"detail": "You can share only your own portfolios"}, status_code=403)
    try:
        data = await trades.portfolio(username, list(scope.portfolio_ids))
        snapshot = build_snapshot(data.get("positions") or [], body.show_values, body.show_returns)
        return create_share(username, snapshot, body.title, body.show_values, body.show_returns)
    except ShareError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=exc.status)


@router.get("/")
async def list_share_links(request: Request):
    return get_user_shares(_username(request))


@router.delete("/{token}")
async def revoke_share_link(request: Request, token: str):
    if not revoke_share(_username(request), token):
        return JSONResponse({"detail": "Share link not found"}, status_code=404)
    return {"status": "revoked", "token": token}


@router.get("/view/{token}")
async def view_shared_portfolio(token: str):
    """Public, read-only snapshot. Unknown and revoked tokens get the same 404."""
    data = get_shared_portfolio(token)
    if data is None:
        return JSONResponse({"detail": "This share link does not exist or has been revoked"}, status_code=404)
    return data
