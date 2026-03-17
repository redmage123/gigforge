"""DeFi position tracking API."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from services.defi import get_defi_positions, get_all_defi_positions
from services.user_data import get_username, load_user_data

router = APIRouter()


@router.get("/positions/{address}")
async def defi_positions(address: str, chain: str = "ethereum"):
    try:
        return await get_defi_positions(address, chain)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/positions")
async def all_defi_positions(request: Request):
    username = get_username(request)
    wallets = load_user_data(username, "wallets")
    try:
        positions = await get_all_defi_positions(wallets)
        total_usd = sum(p.get("usd_value", 0) for p in positions)
        return {"positions": positions, "total_usd": round(total_usd, 2)}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)
