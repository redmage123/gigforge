"""BACSWN — Open-Meteo API client for weather forecasts."""

import logging
import httpx
from services.cache import cache
from config import OPEN_METEO_URL, STATION_COORDS, CACHE_TTL_FORECAST

logger = logging.getLogger("bacswn.openmeteo")

_client = httpx.AsyncClient(timeout=15.0)

_HPA_TO_INHG = 1.0 / 33.8639


def _category_from_cloud(cloud_cover_pct):
    """Coarse flight category from cloud cover when no visibility/ceiling exists.

    Open-Meteo current conditions lack reported ceiling, so this is a proxy and
    is only used for model-estimate stations (labelled as such in the UI).
    """
    if cloud_cover_pct is None:
        return "N/A"
    if cloud_cover_pct >= 90:
        return "IFR"
    if cloud_cover_pct >= 70:
        return "MVFR"
    return "VFR"


def _build_current(cur):
    """Normalize an Open-Meteo `current` block into the station marker shape."""
    if not cur:
        return None
    pressure_hpa = cur.get("pressure_msl")
    return {
        "temp_c": cur.get("temperature_2m"),
        "wind_dir_deg": cur.get("wind_direction_10m"),
        "wind_speed_kt": round(cur["wind_speed_10m"]) if cur.get("wind_speed_10m") is not None else None,
        "wind_gust_kt": None,
        "pressure_hpa": pressure_hpa,
        "altimeter_inhg": round(pressure_hpa * _HPA_TO_INHG, 2) if pressure_hpa is not None else None,
        "cloud_cover_pct": cur.get("cloud_cover"),
        "flight_category": _category_from_cloud(cur.get("cloud_cover")),
        "observed_at": cur.get("time"),
        "source": "model",  # model nowcast, NOT a station observation
    }


async def fetch_current_for_stations(coords):
    """Batched Open-Meteo current conditions for many stations in one call.

    `coords` is a list of (code, lat, lon). Returns {code: current-dict}.
    Cached, so repeated map loads do not hammer the API.
    """
    if not coords:
        return {}
    cache_key = "current:bulk:" + ",".join(c[0] for c in coords)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached
    try:
        resp = await _client.get(OPEN_METEO_URL, params={
            "latitude": ",".join(str(c[1]) for c in coords),
            "longitude": ",".join(str(c[2]) for c in coords),
            "current": "temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover,pressure_msl",
            "wind_speed_unit": "kn",
            "timezone": "UTC",
        })
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict):     # single-location responses are not wrapped in a list
            data = [data]
        result = {}
        for (code, _lat, _lon), d in zip(coords, data):
            built = _build_current(d.get("current", {}))
            if built:
                result[code] = built
        cache.set(cache_key, result, CACHE_TTL_FORECAST)
        return result
    except Exception as e:
        logger.error(f"Open-Meteo current conditions failed: {e}")
        return {}


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
