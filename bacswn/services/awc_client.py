"""BACSWN — Aviation Weather Center (AWC) API client.

Fetches METAR, TAF, SIGMET, and PIREP data from aviationweather.gov.
Falls back to simulated observations when the API is unavailable.
"""

import logging
import random
import time
import httpx
from services.cache import cache
from config import (
    AWC_METAR_URL, AWC_TAF_URL, AWC_SIGMET_URL,
    BAHAMAS_STATIONS, STATION_COORDS, CACHE_TTL_METAR, CACHE_TTL_TAF,
)

logger = logging.getLogger("bacswn.awc")

_client = httpx.AsyncClient(timeout=15.0, headers={"Accept": "application/json"})

# ── Simulated METAR baseline data for demo / offline mode ─────────────────────
_SIM_METAR_BASE = {
    "MYNN": {"temp": 27, "dewp": 22, "wdir": 100, "wspd": 12, "visib": 10.0, "altim": 29.92, "fltcat": "VFR",  "wxString": ""},
    "MYGF": {"temp": 26, "dewp": 21, "wdir": 90,  "wspd": 10, "visib": 10.0, "altim": 29.94, "fltcat": "VFR",  "wxString": ""},
    "MYEG": {"temp": 28, "dewp": 23, "wdir": 120, "wspd": 8,  "visib": 7.0,  "altim": 29.88, "fltcat": "MVFR", "wxString": "-RA"},
    "MYEM": {"temp": 27, "dewp": 22, "wdir": 110, "wspd": 9,  "visib": 10.0, "altim": 29.91, "fltcat": "VFR",  "wxString": ""},
    "MYER": {"temp": 26, "dewp": 21, "wdir": 130, "wspd": 11, "visib": 10.0, "altim": 29.90, "fltcat": "VFR",  "wxString": ""},
    "MYES": {"temp": 29, "dewp": 24, "wdir": 80,  "wspd": 7,  "visib": 5.0,  "altim": 29.85, "fltcat": "MVFR", "wxString": "TS"},
    "MYAM": {"temp": 26, "dewp": 20, "wdir": 100, "wspd": 13, "visib": 10.0, "altim": 29.93, "fltcat": "VFR",  "wxString": ""},
    "MYAT": {"temp": 25, "dewp": 20, "wdir": 95,  "wspd": 11, "visib": 10.0, "altim": 29.95, "fltcat": "VFR",  "wxString": ""},
    "MYBS": {"temp": 27, "dewp": 23, "wdir": 140, "wspd": 9,  "visib": 3.0,  "altim": 29.87, "fltcat": "IFR",  "wxString": "BR"},
    "MYIG": {"temp": 30, "dewp": 25, "wdir": 70,  "wspd": 6,  "visib": 10.0, "altim": 29.89, "fltcat": "VFR",  "wxString": ""},
    "MYMM": {"temp": 29, "dewp": 24, "wdir": 60,  "wspd": 5,  "visib": 10.0, "altim": 29.91, "fltcat": "VFR",  "wxString": ""},
    "MYRD": {"temp": 28, "dewp": 22, "wdir": 150, "wspd": 7,  "visib": 10.0, "altim": 29.90, "fltcat": "VFR",  "wxString": ""},
    "MYLD": {"temp": 27, "dewp": 21, "wdir": 115, "wspd": 10, "visib": 10.0, "altim": 29.92, "fltcat": "VFR",  "wxString": ""},
    "MYBC": {"temp": 26, "dewp": 22, "wdir": 100, "wspd": 12, "visib": 10.0, "altim": 29.93, "fltcat": "VFR",  "wxString": ""},
    "MYCB": {"temp": 27, "dewp": 23, "wdir": 125, "wspd": 8,  "visib": 10.0, "altim": 29.91, "fltcat": "VFR",  "wxString": ""},
}


def _generate_simulated_metars(stations: list[str]) -> list[dict]:
    """Generate realistic simulated METARs for demo / offline mode."""
    t = time.time()
    cycle = int(t // 1800) % 24   # changes every 30 min to simulate obs cycle
    results = []
    for icao in stations:
        base = _SIM_METAR_BASE.get(icao)
        coords = STATION_COORDS.get(icao, {})
        if not base:
            continue
        rng = random.Random(hash(icao) + cycle)  # deterministic per station per cycle
        temp = base["temp"] + rng.randint(-2, 2)
        dewp = base["dewp"] + rng.randint(-1, 1)
        wspd = max(0, base["wspd"] + rng.randint(-3, 3))
        wgst = wspd + rng.randint(0, 8) if wspd > 8 else None
        wdir = (base["wdir"] + rng.randint(-20, 20)) % 360
        visib = round(max(0.5, base["visib"] + rng.uniform(-0.5, 0.5)), 1)
        altim = round(base["altim"] + rng.uniform(-0.03, 0.03), 2)
        wx = base["wxString"]
        fltcat = base["fltcat"]
        report_time = f"2026-03-15T{(cycle * 1) % 24:02d}:00:00Z"

        wdir_str = f"{wdir:03d}" if wdir else "VRB"
        wspd_str = f"{wspd:02d}"
        gust_str = f"G{wgst:02d}KT" if wgst else "KT"
        raw = (
            f"{icao} 151{(cycle * 1) % 24:02d}00Z "
            f"{wdir_str}{wspd_str}{gust_str} "
            f"{visib:.0f}SM {wx + ' ' if wx else ''}"
            f"FEW025 SCT050 "
            f"{temp:02d}/{dewp:02d} A{altim * 100:.0f}"
        )
        results.append({
            "icaoId": icao,
            "rawOb": raw,
            "reportTime": report_time,
            "temp": temp,
            "dewp": dewp,
            "wdir": wdir,
            "wspd": wspd,
            "wgst": wgst,
            "visib": visib,
            "altim": altim,
            "fltcat": fltcat,
            "wxString": wx,
            "clouds": [{"cover": "FEW", "base": 2500}, {"cover": "SCT", "base": 5000}],
            "name": coords.get("name", icao),
            "lat": coords.get("lat"),
            "lon": coords.get("lon"),
            "elev": coords.get("elevation_ft", 10),
        })
    return results


async def fetch_metars(stations: list[str] | None = None) -> list[dict]:
    """Fetch current METARs for Bahamas stations."""
    stations = stations or BAHAMAS_STATIONS
    cache_key = f"metars:{'|'.join(stations)}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    ids = ",".join(stations)
    try:
        resp = await _client.get(AWC_METAR_URL, params={
            "ids": ids,
            "format": "json",
            "taf": "false",
            "hours": 2,
        })
        resp.raise_for_status()
        data = resp.json()
        results = data if isinstance(data, list) else []
        cache.set(cache_key, results, CACHE_TTL_METAR)
        logger.info(f"Fetched {len(results)} METARs")
        return results
    except Exception as e:
        logger.error(f"AWC METAR fetch failed: {e}")

    # Fallback: simulated METARs so weather endpoints always return data
    sim = _generate_simulated_metars(stations)
    cache.set(cache_key, sim, CACHE_TTL_METAR)
    logger.info(f"Using {len(sim)} simulated METARs (AWC unavailable)")
    return sim


async def fetch_tafs(stations: list[str] | None = None) -> list[dict]:
    """Fetch current TAFs for Bahamas stations."""
    stations = stations or BAHAMAS_STATIONS
    cache_key = f"tafs:{'|'.join(stations)}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    ids = ",".join(stations)
    try:
        resp = await _client.get(AWC_TAF_URL, params={
            "ids": ids,
            "format": "json",
        })
        resp.raise_for_status()
        data = resp.json()
        results = data if isinstance(data, list) else []
        cache.set(cache_key, results, CACHE_TTL_TAF)
        logger.info(f"Fetched {len(results)} TAFs")
        return results
    except Exception as e:
        logger.error(f"AWC TAF fetch failed: {e}")
        return []


async def fetch_sigmets() -> list[dict]:
    """Fetch active SIGMETs/AIRMETs for the Bahamas region."""
    cached = cache.get("sigmets")
    if cached is not None:
        return cached

    try:
        resp = await _client.get(AWC_SIGMET_URL, params={
            "format": "json",
            "hazard": "all",
        })
        resp.raise_for_status()
        data = resp.json()
        results = data if isinstance(data, list) else []
        cache.set("sigmets", results, CACHE_TTL_METAR)
        return results
    except Exception as e:
        logger.error(f"AWC SIGMET fetch failed: {e}")
        return []


def parse_metar(raw: dict) -> dict:
    """Parse AWC METAR JSON into a normalized dict."""
    return {
        "station_id": raw.get("icaoId", ""),
        "raw_text": raw.get("rawOb", ""),
        "temp_c": raw.get("temp"),
        "dewpoint_c": raw.get("dewp"),
        "wind_dir_deg": raw.get("wdir"),
        "wind_speed_kt": raw.get("wspd"),
        "wind_gust_kt": raw.get("wgst"),
        "visibility_sm": raw.get("visib"),
        "altimeter_inhg": raw.get("altim"),
        "flight_category": raw.get("fltcat", ""),
        "wx_string": raw.get("wxString", ""),
        "cloud_layers": str(raw.get("clouds", [])),
        "observed_at": raw.get("reportTime", ""),
        "name": raw.get("name", ""),
        "latitude": raw.get("lat"),
        "longitude": raw.get("lon"),
        "elevation_ft": raw.get("elev"),
    }
