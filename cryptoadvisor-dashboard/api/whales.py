"""Whale tracking API."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from services.whales import get_whale_transactions

router = APIRouter()


@router.get("/")
async def whale_feed(chain: str = "ethereum", min_value: float = 100):
    try:
        txs = await get_whale_transactions(chain, min_value)
        return {"chain": chain, "min_value": min_value, "transactions": txs}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)
