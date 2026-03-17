"""Chart API endpoints — Plotly JSON + matplotlib base64 images."""

import json
import plotly.io as pio
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from charts.technical import candlestick_chart, rsi_chart, macd_chart, bollinger_chart
from charts.analytics import correlation_heatmap, portfolio_sunburst

router = APIRouter()


@router.get("/candlestick/{coin_id}")
async def candlestick(coin_id: str, days: int = 30):
    try:
        fig = await candlestick_chart(coin_id, days)
        return JSONResponse(json.loads(pio.to_json(fig)))
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/technical/{coin_id}")
async def technical(coin_id: str, indicator: str = "rsi"):
    try:
        indicators = {"rsi": rsi_chart, "macd": macd_chart, "bollinger": bollinger_chart}
        fn = indicators.get(indicator, rsi_chart)
        img = await fn(coin_id)
        return {"image": img, "indicator": indicator}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/correlation")
async def correlation():
    try:
        img = await correlation_heatmap()
        return {"image": img}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/portfolio/allocation")
async def allocation():
    try:
        fig = await portfolio_sunburst()
        return JSONResponse(json.loads(pio.to_json(fig)))
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)
