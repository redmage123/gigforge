"""Correlation matrix endpoint with progress streaming via SSE."""

import asyncio
import json
import numpy as np
from fastapi import APIRouter, Request, Query
from fastapi.responses import JSONResponse, StreamingResponse
from services.coingecko import get_market_chart

router = APIRouter()


@router.get("/")
async def correlation_matrix(
    request: Request,
    coins: str = Query("bitcoin,ethereum,solana,cardano,polkadot", description="Comma-separated coin IDs"),
    days: int = Query(90, description="Number of days for correlation window"),
):
    try:
        coin_list = [c.strip() for c in coins.split(",") if c.strip()]
        price_data = {}

        for coin_id in coin_list:
            try:
                data = await get_market_chart(coin_id, days)
                prices = [p[1] for p in data.get("prices", [])]
                price_data[coin_id] = prices
            except Exception:
                price_data[coin_id] = []

        result = _compute(coin_list, price_data, days)
        return result
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/stream")
async def correlation_stream(
    request: Request,
    coins: str = Query("bitcoin,ethereum,solana,cardano,polkadot"),
    days: int = Query(90),
):
    """SSE endpoint — streams progress as each coin is fetched, then the result."""
    coin_list = [c.strip() for c in coins.split(",") if c.strip()]

    async def event_stream():
        total = len(coin_list) + 1
        price_data = {}

        for i, coin_id in enumerate(coin_list):
            progress = {"step": i, "total": total, "percent": round(i / total * 100), "message": f"Fetching {coin_id}..."}
            yield f"data: {json.dumps(progress)}\n\n"
            try:
                data = await get_market_chart(coin_id, days)
                prices = [p[1] for p in data.get("prices", [])]
                price_data[coin_id] = prices
            except Exception:
                price_data[coin_id] = []

        yield f"data: {json.dumps({'step': len(coin_list), 'total': total, 'percent': round(len(coin_list) / total * 100), 'message': 'Computing correlations...'})}\n\n"

        result = _compute(coin_list, price_data, days)
        yield f"data: {json.dumps({'type': 'result', **result})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _compute(coin_list: list[str], price_data: dict, days: int) -> dict:
    """Compute correlation matrix from price data."""
    min_len = min((len(v) for v in price_data.values() if v), default=0)
    if min_len < 2:
        return {"coins": coin_list, "days": days, "matrix": [], "stats": []}

    aligned = {}
    for coin_id in coin_list:
        prices = price_data.get(coin_id, [])
        if len(prices) >= min_len:
            trimmed = prices[:min_len]
            returns = []
            for j in range(1, len(trimmed)):
                if trimmed[j - 1] != 0:
                    returns.append((trimmed[j] - trimmed[j - 1]) / trimmed[j - 1])
                else:
                    returns.append(0)
            aligned[coin_id] = returns

    coins_with_data = [c for c in coin_list if c in aligned and len(aligned[c]) > 0]
    if len(coins_with_data) < 2:
        return {"coins": coin_list, "days": days, "matrix": [], "stats": []}

    returns_matrix = np.array([aligned[c] for c in coins_with_data])
    corr = np.corrcoef(returns_matrix)

    stats = []
    for coin_id in coins_with_data:
        r = aligned[coin_id]
        stats.append({
            "coin": coin_id,
            "volatility": float(np.std(r)),
            "mean_daily_return": float(np.mean(r)),
        })

    return {
        "coins": coins_with_data,
        "days": days,
        "matrix": corr.tolist(),
        "stats": stats,
    }
