"""BACSWN — NHC tropical cyclone tracker.

Fetches active Atlantic hurricanes/tropical storms from the NHC API
and generates realistic simulated tracks when no active storms exist.
"""

import logging
import time
import math
import httpx
from services.cache import cache

logger = logging.getLogger("bacswn.hurricane")

NHC_ACTIVE_URL = "https://www.nhc.noaa.gov/CurrentSummaries.json"
_client = httpx.AsyncClient(timeout=15.0)

# Simulated storm data for demo when no active storms
_SIM_STORMS = [
    {
        "id": "AL042026",
        "name": "Tropical Storm Danielle",
        "classification": "Tropical Storm",
        "wind_mph": 65,
        "pressure_mb": 998,
        "movement": "NW at 12 mph",
        "base_lat": 22.0,
        "base_lon": -74.0,
        "forecast_cone": [
            {"hr": 0, "lat": 22.0, "lon": -74.0},
            {"hr": 12, "lat": 22.5, "lon": -74.8},
            {"hr": 24, "lat": 23.2, "lon": -75.5},
            {"hr": 36, "lat": 24.0, "lon": -76.0},
            {"hr": 48, "lat": 24.8, "lon": -76.3},
            {"hr": 72, "lat": 26.5, "lon": -77.0},
        ],
    },
]


def _generate_simulated_storms():
    """Generate demo storm tracks with slow position drift."""
    t = time.time()
    drift = (t % 3600) / 3600 * 0.5
    storms = []
    for s in _SIM_STORMS:
        storm = {
            "id": s["id"],
            "name": s["name"],
            "classification": s["classification"],
            "wind_mph": s["wind_mph"],
            "pressure_mb": s["pressure_mb"],
            "movement": s["movement"],
            "lat": round(s["base_lat"] + drift, 2),
            "lon": round(s["base_lon"] - drift * 0.5, 2),
            "forecast_track": [],
            "cone_polygon": [],
        }
        # Build forecast track
        for pt in s["forecast_cone"]:
            storm["forecast_track"].append({
                "hour": pt["hr"],
                "lat": round(pt["lat"] + drift, 2),
                "lon": round(pt["lon"] - drift * 0.3, 2),
            })
        # Build simplified cone of uncertainty
        track = storm["forecast_track"]
        cone = []
        for pt in track:
            r = 0.3 + pt["hour"] * 0.015  # cone widens with time
            cone.append([pt["lat"] + r, pt["lon"] - r * 0.7])
        for pt in reversed(track):
            r = 0.3 + pt["hour"] * 0.015
            cone.append([pt["lat"] - r, pt["lon"] + r * 0.7])
        if cone:
            cone.append(cone[0])
        storm["cone_polygon"] = cone
        storms.append(storm)
    return storms


async def fetch_hurricanes():
    """Fetch active tropical cyclones. Falls back to simulated data."""
    cached = cache.get("hurricanes:active")
    if cached is not None:
        return cached

    try:
        resp = await _client.get(NHC_ACTIVE_URL)
        resp.raise_for_status()
        data = resp.json()
        cyclones = data.get("activeStorms", [])
        if cyclones:
            storms = []
            for c in cyclones:
                storms.append({
                    "id": c.get("id", ""),
                    "name": c.get("name", "Unknown"),
                    "classification": c.get("classification", ""),
                    "wind_mph": c.get("intensity", 0),
                    "pressure_mb": c.get("pressure", 0),
                    "movement": c.get("movement", ""),
                    "lat": c.get("latitude", 0),
                    "lon": c.get("longitude", 0),
                    "forecast_track": [],
                    "cone_polygon": [],
                })
            cache.set("hurricanes:active", storms, 600)
            return storms
    except Exception as e:
        logger.warning(f"NHC fetch failed, using simulated data: {e}")

    # Fallback: simulated storms
    storms = _generate_simulated_storms()
    cache.set("hurricanes:active", storms, 120)
    return storms
