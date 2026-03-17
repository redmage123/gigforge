"""Orderbook aggregation API."""

from fastapi import APIRouter, Request, Query

router = APIRouter()


@router.get("/")
async def aggregated_orderbook(request: Request, coin: str = Query(default="bitcoin")):
    username = request.state.user.get("sub", "")
    return {
        "coin": coin,
        "bids": [],
        "asks": [],
        "spread_pct": 0.0,
        "exchanges": ["binance", "coinbase"],
        "username": username,
    }


@router.get("/{exchange}")
async def exchange_orderbook(request: Request, exchange: str, coin: str = Query(default="bitcoin")):
    username = request.state.user.get("sub", "")
    if exchange not in ("binance", "coinbase"):
        return {"error": f"Unsupported exchange: {exchange}"}
    return {
        "exchange": exchange,
        "coin": coin,
        "bids": [],
        "asks": [],
        "spread_pct": 0.0,
        "username": username,
    }
