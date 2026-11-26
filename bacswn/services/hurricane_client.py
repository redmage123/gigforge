"""BACSWN — NHC tropical cyclone tracker.

What: fetches active Atlantic hurricanes/tropical storms from the NHC
CurrentSummaries feed, normalised to one dict per storm.

Why: hurricane operations (surge, shelters, airports, escalation) are driven by
the strongest active storm, so the platform needs a storm list at all times.

How: a shared ``httpx.AsyncClient``; live results are cached for 10 minutes. When
NHC is unreachable or reports no active storms, a simulated storm with a slowly
drifting track and cone is returned instead (cached for 2 minutes) so the demo
is never empty. Never raises.
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
    """Demo storms whose position, track and cone drift up to 0.5 degrees over each hour."""
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



def saffir_simpson_category(wind_mph: int) -> int:
    """Saffir-Simpson category (1-5) for a sustained wind in mph; 0 below hurricane strength.

    Shared by the hurricane API and the operations briefing so both classify storms the same way.
    """
    if wind_mph >= 157:
        return 5
    if wind_mph >= 130:
        return 4
    if wind_mph >= 111:
        return 3
    if wind_mph >= 96:
        return 2
    if wind_mph >= 74:
        return 1
    return 0


async def fetch_hurricanes():
    """Active tropical cyclones from NHC, or the simulated storm if there are none or NHC fails."""
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
