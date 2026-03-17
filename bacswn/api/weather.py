"""BACSWN — Weather API router (METAR, TAF, forecasts)."""

from fastapi import APIRouter
from services.awc_client import fetch_metars, fetch_tafs, parse_metar
from services.openmeteo_client import fetch_forecast, fetch_all_station_forecasts
from config import STATION_COORDS

router = APIRouter()


@router.get("/metars")
async def get_metars(stations: str = ""):
    """Get current METARs for Bahamas stations."""
    station_list = stations.split(",") if stations else None
    raw_metars = await fetch_metars(station_list)
    parsed = [parse_metar(m) for m in raw_metars]
    return {"metars": parsed, "count": len(parsed)}


@router.get("/tafs")
async def get_tafs(stations: str = ""):
    """Get current TAFs for Bahamas stations."""
    station_list = stations.split(",") if stations else None
    tafs = await fetch_tafs(station_list)
    return {"tafs": tafs, "count": len(tafs)}


@router.get("/forecast/{station_id}")
async def get_forecast(station_id: str):
    """Get Open-Meteo forecast for a specific station."""
    coords = STATION_COORDS.get(station_id.upper())
    if not coords:
        return {"error": f"Unknown station: {station_id}"}
    forecast = await fetch_forecast(coords["lat"], coords["lon"], station_id)
    return forecast


@router.get("/forecasts")
async def get_all_forecasts():
    """Get forecasts for all Bahamas stations."""
    forecasts = await fetch_all_station_forecasts()
    return {"forecasts": forecasts, "count": len(forecasts)}


@router.get("/stations")
async def get_stations():
    """Get all Bahamas weather station info."""
    return {"stations": STATION_COORDS}
