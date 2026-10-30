"""BACSWN — ERA5 climatology normals (WMO 1991-2020 base period).

Computes long-term monthly normals for each station from the ERA5 reanalysis
(via Open-Meteo's archive) so the platform can show "today vs the 30-year
average" — average high/low/mean temperature, typical wind, and rainfall by
month. Normals are computed once and persisted to disk (they only change when
the base period does), then served from memory.

Honesty: these are ERA5 reanalysis normals over the standard WMO 1991-2020
period — model-assimilated, not raw gauge records, and labelled as such.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

import httpx

from config import STATION_COORDS, DATA_DIR

logger = logging.getLogger("bacswn.climatology")

_OM_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
_PATH = str(DATA_DIR / "climatology.json")
BASE_START, BASE_END = "1991-01-01", "2020-12-31"
BASE_LABEL = "ERA5 1991–2020"
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

_NORMALS: dict = {}   # {station_code: {"months": [12 dicts], ...}}


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return round(sum(xs) / len(xs), 1) if xs else None


async def _fetch_station_daily(lat: float, lon: float) -> dict | None:
    params = {
        "latitude": lat, "longitude": lon,
        "start_date": BASE_START, "end_date": BASE_END,
        "daily": "temperature_2m_mean,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_sum",
        "wind_speed_unit": "kn", "timezone": "UTC",
    }
    # Retry on rate-limit (429) with backoff — the archive API throttles bursts.
    for attempt in range(4):
        try:
            async with httpx.AsyncClient(timeout=40.0) as client:
                resp = await client.get(_OM_ARCHIVE, params=params)
            if resp.status_code == 429:
                await asyncio.sleep(5 * (attempt + 1))
                continue
            resp.raise_for_status()
            return resp.json().get("daily")
        except Exception as e:
            if attempt == 3:
                logger.warning(f"Climatology fetch failed: {e}")
                return None
            await asyncio.sleep(3 * (attempt + 1))
    return None


def _compute_monthly(daily: dict) -> list[dict]:
    """Aggregate the daily series into 12 monthly normals."""
    times = daily.get("time", [])
    tmean = daily.get("temperature_2m_mean", [])
    tmax = daily.get("temperature_2m_max", [])
    tmin = daily.get("temperature_2m_min", [])
    wmax = daily.get("wind_speed_10m_max", [])
    psum = daily.get("precipitation_sum", [])

    # Per-month value buckets, plus per-(year,month) precip totals.
    by_month = {m: {"tmean": [], "tmax": [], "tmin": [], "wmax": []} for m in range(1, 13)}
    precip_totals: dict[tuple, float] = {}
    for i, t in enumerate(times):
        month = int(t[5:7])
        year = int(t[0:4])
        b = by_month[month]
        if i < len(tmean):
            b["tmean"].append(tmean[i])
        if i < len(tmax):
            b["tmax"].append(tmax[i])
        if i < len(tmin):
            b["tmin"].append(tmin[i])
        if i < len(wmax):
            b["wmax"].append(wmax[i])
        if i < len(psum) and psum[i] is not None:
            precip_totals[(year, month)] = precip_totals.get((year, month), 0.0) + psum[i]

    months = []
    for m in range(1, 13):
        b = by_month[m]
        month_precip = [v for (yr, mo), v in precip_totals.items() if mo == m]
        months.append({
            "month": m,
            "label": MONTHS[m - 1],
            "temp_mean": _mean(b["tmean"]),
            "temp_high": _mean(b["tmax"]),   # average daily high
            "temp_low": _mean(b["tmin"]),    # average daily low
            "wind_max_mean": _mean(b["wmax"]),
            "precip_mm": round(sum(month_precip) / len(month_precip), 1) if month_precip else None,
        })
    return months


# ── Persistence + access ─────────────────────────────────────────────────────
def load() -> None:
    global _NORMALS
    try:
        with open(_PATH) as f:
            _NORMALS = json.load(f)
        logger.info(f"Loaded climatology normals for {len(_NORMALS)} stations")
    except Exception:
        _NORMALS = {}


def _save() -> None:
    try:
        with open(_PATH, "w") as f:
            json.dump(_NORMALS, f)
    except Exception as e:  # pragma: no cover
        logger.warning(f"Could not persist climatology: {e}")


def has_normals() -> bool:
    return bool(_NORMALS)


async def build(missing_only: bool = False) -> dict:
    """Fetch ERA5 and compute monthly normals, merging into any existing set.

    Paced to respect the archive API's rate limit; persists after each station
    so partial progress survives restarts and a re-run fills only the gaps.
    """
    global _NORMALS
    built = 0
    for code, info in STATION_COORDS.items():
        if missing_only and code in _NORMALS:
            continue
        daily = await _fetch_station_daily(info["lat"], info["lon"])
        if not daily:
            continue
        _NORMALS[code] = {
            "station_id": code, "name": info["name"],
            "base_period": BASE_LABEL,
            "months": _compute_monthly(daily),
        }
        _save()
        built += 1
        await asyncio.sleep(3)   # pace requests to avoid 429s
    logger.info(f"Built climatology normals (+{built}); total {len(_NORMALS)}/{len(STATION_COORDS)}")
    return {"built": built, "total": len(_NORMALS)}


def is_complete() -> bool:
    return len(_NORMALS) >= len(STATION_COORDS)


async def ensure_built() -> None:
    """Build any missing station normals (idempotent; fills gaps on each call)."""
    if not is_complete():
        await build(missing_only=True)


def _current_month() -> int:
    return datetime.now(timezone.utc).month


def get_station(code: str) -> dict | None:
    return _NORMALS.get(code.upper())


def get_all() -> dict:
    return _NORMALS


def normal_for(code: str, month: int | None = None) -> dict | None:
    """The monthly-normal record for a station and month (default: current)."""
    rec = _NORMALS.get(code.upper())
    if not rec:
        return None
    m = month or _current_month()
    for mo in rec["months"]:
        if mo["month"] == m:
            return mo
    return None


def anomaly(code: str, observed_temp_c: float | None, month: int | None = None) -> dict | None:
    """Current temperature vs the monthly normal mean — the headline anomaly."""
    norm = normal_for(code, month)
    if not norm or observed_temp_c is None or norm.get("temp_mean") is None:
        return None
    diff = round(observed_temp_c - norm["temp_mean"], 1)
    return {
        "month": norm["label"],
        "base_period": BASE_LABEL,
        "normal_mean": norm["temp_mean"],
        "normal_high": norm["temp_high"],
        "normal_low": norm["temp_low"],
        "observed": round(observed_temp_c, 1),
        "anomaly_c": diff,
        "direction": "above" if diff > 0.2 else "below" if diff < -0.2 else "near",
    }


# Load persisted normals at import so the API can serve immediately.
load()
