"""Instruments API: search any asset class, quotes and candles by instrument id ("stock:AAPL")."""

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from services import market
from services.market import registry
from services.market.providers import TIMEFRAMES

router = APIRouter()
MAX_QUOTE_IDS = 100


@router.get("/search")
async def search(q: str = Query("", max_length=40), classes: str = "", limit: int = Query(20, ge=1, le=50),
                 tradable: bool = False):
    await registry.ensure_loaded()
    hits = registry.search(q, [c for c in classes.split(",") if c], limit, tradable_only=tradable)
    return {"results": [i.to_dict() for i in hits]}


@router.get("/quotes")
async def quotes(ids: str = Query(..., max_length=4000)):
    wanted = [i.strip() for i in ids.split(",") if i.strip()][:MAX_QUOTE_IDS]
    got = await market.quotes(wanted)
    return {"quotes": {k: v.to_dict() for k, v in got.items()}, "missing": [i for i in wanted if i not in got]}


@router.get("/top")
async def top(asset_class: str = "crypto", limit: int = Query(8, ge=1, le=50)):
    """Most-traded well-known instruments of a class by current volume (e.g. dashboard "Top Coins")."""
    await registry.ensure_loaded()
    pool = [i for i in registry.all_instruments(asset_class) if "popular" in i.tags]
    got = await market.quotes([i.id for i in pool])
    rows = [(got[i.id], i) for i in pool if i.id in got]
    rows.sort(key=lambda r: r[0].volume or 0, reverse=True)
    return {"results": [{**i.to_dict(), "quote": q.to_dict()} for q, i in rows[:limit]]}


@router.get("/{instrument_id}/candles")
async def candles(instrument_id: str, timeframe: str = "1d", bars: int = Query(120, ge=10, le=1000), perp: bool = False):
    if timeframe not in TIMEFRAMES:
        return JSONResponse({"error": f"timeframe must be one of {', '.join(TIMEFRAMES)}"}, status_code=400)
    try:
        rows = await market.candles(instrument_id, timeframe, bars, prefer_perp=perp)
    except LookupError as exc:
        return JSONResponse({"error": str(exc)}, status_code=404)
    except Exception as exc:  # noqa: BLE001 — provider outage: say so instead of a 500
        return JSONResponse({"error": f"market data unavailable: {exc}"}, status_code=502)
    return {"id": instrument_id, "timeframe": timeframe, "candles": [c.to_dict() for c in rows]}


@router.get("/{instrument_id}")
async def instrument(instrument_id: str):
    inst = await market.get_instrument(instrument_id)
    if not inst:
        return JSONResponse({"error": f"unknown instrument {instrument_id}"}, status_code=404)
    return inst.to_dict()
