"""BACSWN — Tomorrow.io realtime weather client (live reference for mesh stations).

Fetches current conditions at a station from Tomorrow.io's v4 realtime endpoint
when TOMORROW_API_KEY is set. Tomorrow.io blends its own satellites (precipitation
radar, microwave sounders) with radar, station and model data; the API returns
the blended product, not raw satellite passes.

This is shown on the mesh station dashboard as *real* conditions, separately
from the simulation; it is not fed into the simulated stations' decisions.

Calls are made only when a station's dashboard asks, cached per station, and
held under a call budget sized for the free tier (25 calls/hour, 500/day).
"""

from __future__ import annotations

import logging
import time
from collections import deque
from datetime import datetime, timezone

import httpx

from config import TOMORROW_API_KEY, TOMORROW_API_URL

logger = logging.getLogger("bacswn.tomorrow")

CACHE_SECONDS = 30 * 60
HOURLY_BUDGET = 20
DAILY_BUDGET = 400
BACKOFF_SECONDS = 60 * 60          # after HTTP 429
SOURCE = "Tomorrow.io Realtime API — blended satellite, radar, station and model data"

WEATHER_CODES = {
    1000: "Clear", 1100: "Mostly clear", 1101: "Partly cloudy", 1102: "Mostly cloudy", 1001: "Cloudy",
    2000: "Fog", 2100: "Light fog", 4000: "Drizzle", 4001: "Rain", 4200: "Light rain", 4201: "Heavy rain",
    8000: "Thunderstorm",
}

_client = httpx.AsyncClient(timeout=10.0)
_cache: dict[str, tuple[float, dict]] = {}
_calls: deque = deque()            # timestamps of calls in the last 24 h
_backoff_until = 0.0


def configured() -> bool:
    return bool(TOMORROW_API_KEY)


def _budget_left(now: float) -> bool:
    while _calls and now - _calls[0] > 86400:
        _calls.popleft()
    last_hour = sum(1 for t in _calls if now - t <= 3600)
    return last_hour < HOURLY_BUDGET and len(_calls) < DAILY_BUDGET


def _normalise(values: dict) -> dict:
    def r(v, k=1.0, nd=1):
        return None if v is None else round(v * k, nd)
    rain = values.get("rainIntensity", values.get("precipitationIntensity"))
    code = values.get("weatherCode")
    return {
        "temp_c": r(values.get("temperature")),
        "humidity_pct": r(values.get("humidity"), nd=0),
        "dewpoint_c": r(values.get("dewPoint")),
        "wind_kt": r(values.get("windSpeed"), 1.94384, 0),          # m/s → kt
        "gust_kt": r(values.get("windGust"), 1.94384, 0),
        "wind_dir_deg": r(values.get("windDirection"), nd=0),
        "pressure_hpa": r(values.get("pressureSurfaceLevel")),
        "rain_mm_h": r(rain),
        "cloud_cover_pct": r(values.get("cloudCover"), nd=0),
        "cloud_base_ft": r(values.get("cloudBase"), 3280.84, -2),     # km → ft
        "ceiling_ft": r(values.get("cloudCeiling"), 3280.84, -2),
        "visibility_sm": r(values.get("visibility"), 0.621371),       # km → SM
        "uv_index": values.get("uvIndex"),
        "weather": WEATHER_CODES.get(code, f"Code {code}" if code is not None else None),
    }


async def realtime(station: str, lat: float, lon: float) -> dict:
    """Current Tomorrow.io conditions at a station (cached; never raises)."""
    global _backoff_until
    if not configured():
        return {"configured": False, "status": "not_configured", "source": SOURCE}
    now = time.time()
    hit = _cache.get(station)
    if hit and now - hit[0] < CACHE_SECONDS:
        return {**hit[1], "cached": True, "age_min": round((now - hit[0]) / 60)}

    def fallback(status: str, message: str) -> dict:
        if hit:      # an older reading beats none; say how old it is
            return {**hit[1], "cached": True, "age_min": round((now - hit[0]) / 60), "status": status,
                    "message": message}
        return {"configured": True, "status": status, "message": message, "source": SOURCE}

    if now < _backoff_until:
        return fallback("rate_limited", "Tomorrow.io rate limit reached — waiting before retrying")
    if not _budget_left(now):
        return fallback("budget", "Call budget for the free tier used up — showing the last reading")
    _calls.append(now)
    try:
        resp = await _client.get(f"{TOMORROW_API_URL}/weather/realtime",
                                 params={"location": f"{lat},{lon}", "units": "metric", "apikey": TOMORROW_API_KEY})
        if resp.status_code == 429:
            _backoff_until = now + BACKOFF_SECONDS
            return fallback("rate_limited", "Tomorrow.io rate limit reached — waiting before retrying")
        resp.raise_for_status()
        data = resp.json().get("data") or {}
        result = {"configured": True, "status": "ok", "source": SOURCE, "cached": False, "age_min": 0,
                  "observed_at": data.get("time"), "fetched_at": datetime.now(timezone.utc).isoformat(),
                  "values": _normalise(data.get("values") or {})}
        _cache[station] = (now, result)
        return result
    except (httpx.HTTPError, ValueError) as e:
        # Never echo the request URL: it carries the API key.
        logger.warning(f"Tomorrow.io realtime fetch failed for {station}: {type(e).__name__}")
        return fallback("error", "Tomorrow.io is unavailable right now")
