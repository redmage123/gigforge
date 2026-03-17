"""Copy trading / wallet watching API."""

from fastapi import APIRouter, Request, Query
from pydantic import BaseModel
from services.copy_trading import (
    get_watched_wallets,
    add_watched_wallet as svc_add_watched_wallet,
    remove_watched_wallet as svc_remove_watched_wallet,
    get_social_feed,
    get_wallet_recent_trades,
)

router = APIRouter()


class WalletWatch(BaseModel):
    address: str
    label: str


@router.get("/wallets")
async def list_watched_wallets(request: Request):
    username = request.state.user.get("sub", "")
    return get_watched_wallets(username)


@router.post("/wallets")
async def add_watched_wallet(request: Request, body: WalletWatch):
    username = request.state.user.get("sub", "")
    return await svc_add_watched_wallet(username, body.address, body.label)


@router.delete("/wallets/{address}")
async def remove_watched_wallet(request: Request, address: str):
    username = request.state.user.get("sub", "")
    return await svc_remove_watched_wallet(username, address)


@router.get("/feed")
async def social_feed(request: Request):
    username = request.state.user.get("sub", "")
    return await get_social_feed(username)


@router.get("/trades/{address}")
async def wallet_trades(request: Request, address: str):
    username = request.state.user.get("sub", "")
    return await get_wallet_recent_trades(address)
