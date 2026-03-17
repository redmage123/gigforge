"""Portfolio sharing API."""

from fastapi import APIRouter, Request, Query
from pydantic import BaseModel
from services.share_portfolio import (
    generate_share_token,
    get_user_shares,
    revoke_share,
    get_shared_portfolio,
)

router = APIRouter()


@router.post("/")
async def generate_share_link(request: Request):
    username = request.state.user.get("sub", "")
    return generate_share_token(username)


@router.get("/")
async def list_share_links(request: Request):
    username = request.state.user.get("sub", "")
    return get_user_shares(username)


@router.delete("/{token}")
async def revoke_share_link(request: Request, token: str):
    username = request.state.user.get("sub", "")
    return revoke_share(username, token)


@router.get("/view/{token}")
async def view_shared_portfolio(token: str):
    """Public endpoint — no auth required."""
    return get_shared_portfolio(token)
