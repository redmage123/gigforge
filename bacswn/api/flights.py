"""BACSWN — Flight operations API router."""

from fastapi import APIRouter
from services.opensky_client import fetch_flights
from services.database import db_insert, db_select
from datetime import datetime, timezone

router = APIRouter()


@router.get("/live")
async def get_live_flights():
    """Get live flights in Bahamas airspace."""
    flights = await fetch_flights()
    return {
        "flights": flights,
        "count": len(flights),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/stats")
async def get_flight_stats():
    """Get flight statistics summary."""
    flights = await fetch_flights()
    by_country = {}
    altitude_bands = {"ground": 0, "low": 0, "medium": 0, "high": 0, "cruise": 0}

    for f in flights:
        country = f.get("origin_country", "Unknown")
        by_country[country] = by_country.get(country, 0) + 1

        alt = f.get("baro_altitude") or 0
        if f.get("on_ground"):
            altitude_bands["ground"] += 1
        elif alt < 3000:
            altitude_bands["low"] += 1
        elif alt < 8000:
            altitude_bands["medium"] += 1
        elif alt < 12000:
            altitude_bands["high"] += 1
        else:
            altitude_bands["cruise"] += 1

    return {
        "total_flights": len(flights),
        "by_country": dict(sorted(by_country.items(), key=lambda x: -x[1])),
        "altitude_bands": altitude_bands,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/history")
async def get_flight_history(hours: int = 24, limit: int = 100):
    """Get recent flight records from database."""
    records = await db_select("flight_records", order_by="recorded_at DESC", limit=limit)
    return {"records": records, "count": len(records)}
