"""NFT portfolio API."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from services.nfts import get_nfts_for_address, get_all_nfts
from services.user_data import get_username, load_user_data

router = APIRouter()


@router.get("/{chain}/{address}")
async def nfts_for_address(chain: str, address: str):
    try:
        return await get_nfts_for_address(chain, address)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/all")
async def all_nfts(request: Request):
    username = get_username(request)
    wallets = load_user_data(username, "wallets")
    try:
        nfts = await get_all_nfts(wallets)
        return {"nfts": nfts, "total": len(nfts)}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)
