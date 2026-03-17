"""Crypto converter API — crypto-to-crypto and crypto-to-fiat conversions."""

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from services.converter import (
    get_rates,
    convert_crypto,
    convert_to_fiats,
    get_supported_assets,
)

router = APIRouter()


@router.get("/assets")
async def supported_assets():
    """List supported cryptocurrencies and fiat currencies."""
    return get_supported_assets()


@router.get("/convert")
async def convert(
    from_coin: str = Query(..., description="CoinGecko ID of source crypto"),
    to: str = Query(..., description="CoinGecko ID of target crypto"),
    amount: float = Query(1.0, description="Amount to convert"),
):
    """Convert between two cryptocurrencies."""
    if amount <= 0:
        return JSONResponse(status_code=400, content={"error": "Amount must be positive"})
    try:
        rates = await get_rates()
    except Exception:
        return JSONResponse(status_code=503, content={"error": "Rate data temporarily unavailable"})
    result = convert_crypto(rates, from_coin, to, amount)
    if not result:
        return JSONResponse(status_code=404, content={"error": "Coin not found or rate unavailable"})
    return result


@router.get("/fiat")
async def fiat_values(
    coin: str = Query(..., description="CoinGecko ID of the cryptocurrency"),
    amount: float = Query(1.0, description="Amount of the cryptocurrency"),
):
    """Get value of a crypto amount in all supported fiat currencies."""
    if amount <= 0:
        return JSONResponse(status_code=400, content={"error": "Amount must be positive"})
    try:
        rates = await get_rates()
    except Exception:
        return JSONResponse(status_code=503, content={"error": "Rate data temporarily unavailable"})
    fiats = convert_to_fiats(rates, coin, amount)
    if not fiats:
        return JSONResponse(status_code=404, content={"error": "Coin not found"})
    return {"coin": coin, "amount": amount, "fiats": fiats}


@router.get("/rates")
async def all_rates():
    """Get all current rates (raw CoinGecko data)."""
    try:
        return await get_rates()
    except Exception:
        return JSONResponse(status_code=503, content={"error": "Rate data temporarily unavailable"})
