"""REST endpoints for per-user favorites/watchlist."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from services.favorites import (
    add_favorite,
    get_favorites,
    get_favorites_with_prices,
    remove_favorite,
)
from services.user_data import save_user_data

router = APIRouter()


class AddFavoriteBody(BaseModel):
    coin_id: str


class ReorderBody(BaseModel):
    favorites: list[str]


@router.get("/")
async def list_favorites_with_prices(request: Request):
    """Return the user's favorites with current price data."""
    try:
        username = request.state.user.get("sub", "")
        data = await get_favorites_with_prices(username)
        return {"favorites": data}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/list")
async def list_favorite_ids(request: Request):
    """Return just the coin ID list (no prices)."""
    try:
        username = request.state.user.get("sub", "")
        return {"favorites": get_favorites(username)}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/")
async def add(request: Request, body: AddFavoriteBody):
    """Add a coin to the user's favorites."""
    try:
        username = request.state.user.get("sub", "")
        updated = add_favorite(username, body.coin_id)
        return {"favorites": updated, "message": f"{body.coin_id} added to favorites"}
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.delete("/{coin_id}")
async def remove(request: Request, coin_id: str):
    """Remove a coin from the user's favorites."""
    try:
        username = request.state.user.get("sub", "")
        updated = remove_favorite(username, coin_id)
        return {"favorites": updated, "message": f"{coin_id} removed from favorites"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.put("/reorder")
async def reorder(request: Request, body: ReorderBody):
    """Reorder the user's favorites list."""
    try:
        username = request.state.user.get("sub", "")
        save_user_data(username, "favorites", body.favorites)
        return {"favorites": body.favorites, "message": "Favorites reordered"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
