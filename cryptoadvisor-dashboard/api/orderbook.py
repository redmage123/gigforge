"""Order book API (Binance spot, public data)."""

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from services.orderbook import OrderbookError, get_orderbook

router = APIRouter()


@router.get("/")
async def orderbook(instrument: str = Query(default="", description="Instrument id, e.g. crypto:BTC"),
                    coin: str = Query(default="bitcoin", description="Legacy: CoinGecko id or symbol"),
                    depth: int = Query(default=20, ge=1, le=100)):
    try:
        return await get_orderbook(instrument or coin, depth)
    except OrderbookError as exc:
        return JSONResponse({"error": str(exc)}, status_code=exc.status)
