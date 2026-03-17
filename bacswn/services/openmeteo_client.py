"""BACSWN — Open-Meteo API client for weather forecasts."""

import logging
import httpx
from services.cache import cache
from config import OPEN_METEO_URL, STATION_COORDS, CACHE_TTL_FORECAST

logger = logging.getLogger("bacswn.openmeteo")

_client = httpx.AsyncClient(timeout=15.0)


async def fetch_forecast(lat: float, lon: float, station_id: str = "") -> dict:
    """Fetch weather forecast for a given location."""
    cache_key = f"forecast:{lat:.2f},{lon:.2f}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        resp = await _client.get(OPEN_METEO_URL, params={
            "latitude": lat,
            "longitude": lon,
            "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation,cloud_cover,visibility,pressure_msl",
            "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation,cloud_cover,pressure_msl",
            "forecast_days": 3,
            "timezone": "America/Nassau",
        })
        resp.raise_for_status()
        data = resp.json()
        data["station_id"] = station_id
        cache.set(cache_key, data, CACHE_TTL_FORECAST)
        return data
    except Exception as e:
        logger.error(f"Open-Meteo forecast failed: {e}")
        return {}


async def fetch_all_station_forecasts() -> list[dict]:
    """Fetch forecasts for all Bahamas weather stations."""
    cached = cache.get("forecasts:all")
    if cached is not None:
        return cached

    results = []
    for station_id, info in STATION_COORDS.items():
        forecast = await fetch_forecast(info["lat"], info["lon"], station_id)
        if forecast:
            results.append(forecast)

    cache.set("forecasts:all", results, CACHE_TTL_FORECAST)
    return results
