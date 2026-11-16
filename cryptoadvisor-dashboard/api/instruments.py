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


@router.get("/{instrument_id}/surgex")
async def surgex(instrument_id: str, timeframe: str = "1d", bars: int = Query(200, ge=30, le=800), perp: bool = False,
                 heikin_ashi: bool = False, price_type: str = "close", plot_type: str = "surge", ma_type: str = "wma",
                 period_d: int = 5, period_v: int = 5, period_a: int = 5, period_s: int = 5,
                 alma_offset: float = 2.0, alma_sigma: float = 1.0, min_spread: int = 3, spike_multiplier: int = 1):
    """SurgeX indicator (smoothed distance/velocity/acceleration/surge of price) for any instrument."""
    from services.indicators.surgex import SurgeSettings, compute

    st = SurgeSettings(heikin_ashi, price_type, plot_type, ma_type, period_d, period_v, period_a, period_s,
                       alma_offset, alma_sigma, min_spread, spike_multiplier)
    err = st.validate() or (None if timeframe in TIMEFRAMES else f"timeframe must be one of {', '.join(TIMEFRAMES)}")
    if err:
        return JSONResponse({"error": err}, status_code=400)
    try:
        # Extra history so the derivative chain has warmed up before the first bar shown
        rows = await market.candles(instrument_id, timeframe, min(1000, bars + st.warmup + 10), prefer_perp=perp)
    except LookupError as exc:
        return JSONResponse({"error": str(exc)}, status_code=404)
    except Exception as exc:  # noqa: BLE001
        return JSONResponse({"error": f"market data unavailable: {exc}"}, status_code=502)
    out = compute(rows, st)
    cut = max(0, len(rows) - bars)
    rnd = lambda xs: [None if x is None else round(x, 10) for x in xs[cut:]]  # noqa: E731
    return {
        "id": instrument_id, "timeframe": timeframe, "settings": st.__dict__,
        "t": [c.open_time for c in rows[cut:]],
        "series": {k: rnd(v) for k, v in out["series"].items()},
        "plotted": st.plot_type,
        "marks": [{**m, "t": rows[m["index"]].open_time} for m in out["marks"] if m["index"] >= cut],
        "reading": out["reading"],
    }


@router.get("/{instrument_id}")
async def instrument(instrument_id: str):
    inst = await market.get_instrument(instrument_id)
    if not inst:
        return JSONResponse({"error": f"unknown instrument {instrument_id}"}, status_code=404)
    return inst.to_dict()
