"""BACSWN — Climatology API router (ERA5 30-year normals).

What: serves monthly climate normals per station and the anomaly of an observed
temperature against the normal for the month.

Why: "today vs the 30-year average" gives forecasters and the briefing climate
context.

How: reads the in-memory normals held by ``services.climatology`` (built from
ERA5 in the background). While they are still being built the routes answer
with an ``error`` and ``ready: false`` rather than failing.
"""

from fastapi import APIRouter

from services import climatology as cl

router = APIRouter()


@router.get("/normals")
async def get_normals(station: str = ""):
    """Monthly climate normals for one station, or all stations if omitted."""
    if station:
        rec = cl.get_station(station)
        if not rec:
            return {"error": f"No climatology for {station}", "ready": cl.has_normals()}
        return rec
    return {"stations": cl.get_all(), "base_period": cl.BASE_LABEL, "ready": cl.has_normals()}


@router.get("/anomaly")
async def get_anomaly(station: str, observed_temp_c: float, month: int = 0):
    """Current temperature vs the station's monthly normal (the headline anomaly)."""
    a = cl.anomaly(station, observed_temp_c, month or None)
    if not a:
        return {"error": "No normal available for this station/month", "ready": cl.has_normals()}
    return a
