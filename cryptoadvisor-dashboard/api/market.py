"""Market data API endpoints."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from services.coingecko import get_prices, get_global_data, get_ohlcv, get_market_chart
from services.feargreed import get_fear_greed
from services.news import get_news
from config import DEFAULT_COINS

router = APIRouter()


@router.get("/prices")
async def prices():
    try:
        data = await get_prices(tuple(DEFAULT_COINS))
        return data
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/prices/{coin_id}")
async def price(coin_id: str):
    try:
        data = await get_prices((coin_id,))
        return data
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/global")
async def global_data():
    try:
        return await get_global_data()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/fear-greed")
async def fear_greed():
    try:
        return await get_fear_greed()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/ohlcv/{coin_id}")
async def ohlcv(coin_id: str, days: int = 30):
    """Get OHLCV candlestick data. days: 1, 7, 14, 30, 90, 180, 365."""
    if days not in (1, 7, 14, 30, 90, 180, 365):
        return JSONResponse({"error": "days must be 1, 7, 14, 30, 90, 180, or 365"}, status_code=400)
    try:
        data = await get_ohlcv(coin_id, days)
        return {"coin_id": coin_id, "days": days, "ohlcv": data}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/chart/{coin_id}")
async def chart(coin_id: str, days: int = 30):
    """Get market chart data (prices, volumes, market caps)."""
    if days not in (1, 7, 14, 30, 90, 180, 365):
        return JSONResponse({"error": "days must be 1, 7, 14, 30, 90, 180, or 365"}, status_code=400)
    try:
        data = await get_market_chart(coin_id, days)
        return {"coin_id": coin_id, "days": days, "chart": data}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/news")
async def news(limit: int = 10):
    try:
        return await get_news(limit)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)
