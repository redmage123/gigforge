"""Watchlist API: any instrument, by instrument id (legacy CoinGecko ids still accepted)."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services import market
from services.favorites import (
    add_favorite, get_favorites, get_favorites_with_prices, remove_favorite, set_favorites, to_instrument_id,
)
from services.market import registry

router = APIRouter()


class AddFavoriteBody(BaseModel):
    instrument_id: str = ""
    coin_id: str = ""  # legacy clients


class ReorderBody(BaseModel):
    favorites: list[str]


def _user(request: Request) -> str:
    return request.state.user.get("sub", "")


@router.get("/")
async def list_favorites_with_prices(request: Request):
    """The watchlist with live quotes."""
    return {"favorites": await get_favorites_with_prices(_user(request))}


@router.get("/list")
async def list_favorite_ids(request: Request):
    await registry.ensure_loaded()
    return {"favorites": get_favorites(_user(request))}


@router.post("/")
async def add(request: Request, body: AddFavoriteBody):
    await registry.ensure_loaded()
    iid = to_instrument_id(body.instrument_id or body.coin_id)
    inst = await market.get_instrument(iid) if iid else None
    if not inst:
        return JSONResponse({"error": f"Unknown instrument '{body.instrument_id or body.coin_id}'"}, status_code=400)
    try:
        return {"favorites": add_favorite(_user(request), inst.id), "message": f"{inst.name} added to your watchlist"}
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@router.delete("/{item_id}")
async def remove(request: Request, item_id: str):
    await registry.ensure_loaded()
    iid = to_instrument_id(item_id) or item_id
    return {"favorites": remove_favorite(_user(request), iid), "message": f"{iid} removed from your watchlist"}


@router.put("/reorder")
async def reorder(request: Request, body: ReorderBody):
    await registry.ensure_loaded()
    return {"favorites": set_favorites(_user(request), body.favorites), "message": "Watchlist reordered"}
