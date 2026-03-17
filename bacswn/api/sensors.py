"""BACSWN — Sensor network API router."""

from fastapi import APIRouter
from services.awc_client import fetch_metars, parse_metar
from services.database import db_select, db_insert
from config import STATION_COORDS

router = APIRouter()


@router.get("/grid")
async def get_sensor_grid():
    """Get weather station grid with current status."""
    metars = await fetch_metars()
    metar_map = {parse_metar(m)["station_id"]: parse_metar(m) for m in metars}

    stations = []
    for code, info in STATION_COORDS.items():
        metar = metar_map.get(code, {})
        stations.append({
            "icao_code": code,
            "name": info["name"],
            "lat": info["lat"],
            "lon": info["lon"],
            "elevation_ft": info["elevation_ft"],
            "status": "operational" if metar else "no_data",
            "has_metar": bool(metar),
            "flight_category": metar.get("flight_category", "N/A"),
            "temp_c": metar.get("temp_c"),
            "wind_speed_kt": metar.get("wind_speed_kt"),
            "visibility_sm": metar.get("visibility_sm"),
            "last_report": metar.get("observed_at", ""),
        })

    operational = sum(1 for s in stations if s["status"] == "operational")
    return {
        "stations": stations,
        "total": len(stations),
        "operational": operational,
        "no_data": len(stations) - operational,
        "health_pct": round(operational / len(stations) * 100, 1) if stations else 0,
    }


@router.get("/{station_id}")
async def get_station_detail(station_id: str):
    """Get detailed info for a specific station."""
    code = station_id.upper()
    info = STATION_COORDS.get(code)
    if not info:
        return {"error": f"Unknown station: {code}"}

    metars = await fetch_metars([code])
    parsed = [parse_metar(m) for m in metars]

    return {
        "station": {"icao_code": code, **info},
        "current_metar": parsed[0] if parsed else None,
        "recent_observations": parsed,
    }
