"""BACSWN — Forecast Verification Engine.

Scores forecast skill the way an operational Meteorological Watch Office does:
captures each forecast against fixed lead times, then — once the valid time
arrives — compares the forecast to what was actually observed at the station.

It computes the standard verification metrics:
  * bias  (mean signed error — systematic over/under-forecasting)
  * MAE   (mean absolute error)
  * RMSE  (root mean square error — penalizes large misses)
  * hit rate (categorical — % of exact flight-category matches)

Two population paths:
  1. Live accumulation (production-correct): `capture_forecasts()` stores a
     forecast row per (station, variable, lead) every hour; `match_pending()`
     fills in the observed value once the valid time passes. The lead-time
     skill curve emerges naturally as rows verify.
  2. Backfill (demo bootstrap): `backfill()` pulls REAL Open-Meteo archive
     (ERA5 reanalysis = truth) vs. the archived high-resolution forecast for
     the trailing window, so the scoreboard is populated with genuine numbers
     on day one. If those APIs are unreachable it falls back to a clearly
     LABELLED deterministic seed — never silently mixed with real data.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta, timezone

import httpx
from metpy.io.metar import parse_metar
from metpy.units import units

from config import STATION_COORDS
from services.database import db_execute, db_insert
from services.awc_client import fetch_metars, parse_metar as parse_awc_metar

logger = logging.getLogger("bacswn.verification")

# ── Lead times we score (hours ahead of issue) ──────────────────────────────
LEAD_TIMES = [1, 3, 6, 12, 24]

# ── Continuous variables we verify ──────────────────────────────────────────
# key            -> label, unit, Open-Meteo hourly field, METAR field, good-threshold
VARIABLES = {
    "temp_c": {
        "label": "Temperature", "unit": "°C",
        "om_field": "temperature_2m", "metar": "temp_c", "good": 1.5,
    },
    "wind_speed_kt": {
        "label": "Wind Speed", "unit": "kt",
        "om_field": "wind_speed_10m", "metar": "wind_speed_kt", "good": 5.0,
    },
    "pressure_hpa": {
        "label": "Pressure (QNH)", "unit": "hPa",
        "om_field": "pressure_msl", "metar": "_pressure_hpa", "good": 1.5,
    },
}
CONTINUOUS = list(VARIABLES.keys())
CATEGORICAL = "flight_category"

_OM_FORECAST = "https://api.open-meteo.com/v1/forecast"
_OM_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
_OM_HIST_FORECAST = "https://historical-forecast-api.open-meteo.com/v1/forecast"
_OM_PREVIOUS = "https://previous-runs-api.open-meteo.com/v1/forecast"

# Previous-runs day offset -> equivalent forecast lead in hours. The latest run
# at a valid hour is the best estimate (truth); the run from N days earlier is
# the N*24h-ahead forecast for that same hour — genuine lead stratification.
PREV_LEADS = {1: 24, 2: 48, 3: 72}

# Conversion factors derived from MetPy units (no hand-coded magic numbers).
_INHG_TO_HPA = (1.0 * units.inHg).to(units.hPa).magnitude
_M_TO_SM = (1.0 * units.meter).to(units.mile).magnitude

# Sky-cover codes that constitute a ceiling (broken / overcast / vertical vis).
_CEILING_COVERS = {"BKN", "OVC", "VV"}


# ── Small helpers ────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")


def _round_hour(dt: datetime) -> datetime:
    return dt.replace(minute=0, second=0, microsecond=0)


def metar_pressure_hpa(metar: dict) -> float | None:
    """Convert a parsed METAR altimeter (inHg) to hPa for comparison."""
    altim = metar.get("altimeter_inhg")
    if altim is None:
        return None
    try:
        altim = float(altim)
    except (TypeError, ValueError):
        return None
    # AWC sometimes already reports hPa-scale values; guard the obvious case.
    return altim * _INHG_TO_HPA if altim < 35 else altim


def classify_flight_category(vis_sm: float | None, ceiling_ft: float | None) -> str | None:
    """Apply the FAA/ICAO flight-category thresholds to visibility + ceiling.

    LIFR: vis < 1 SM or ceiling < 500 ft
    IFR:  vis < 3 SM or ceiling < 1000 ft
    MVFR: vis <= 5 SM or ceiling <= 3000 ft
    VFR:  otherwise
    """
    if vis_sm is None and ceiling_ft is None:
        return None
    v = vis_sm if vis_sm is not None else 99.0
    c = ceiling_ft if ceiling_ft is not None else 99000.0
    if v < 1 or c < 500:
        return "LIFR"
    if v < 3 or c < 1000:
        return "IFR"
    if v <= 5 or c <= 3000:
        return "MVFR"
    return "VFR"


def _ceiling_from_metar_layers(parsed) -> float | None:
    """Lowest broken/overcast/vertical-visibility cloud base (ft) = ceiling."""
    ceiling = None
    for cov, lev in (
        (parsed.skyc1, parsed.skylev1), (parsed.skyc2, parsed.skylev2),
        (parsed.skyc3, parsed.skylev3), (parsed.skyc4, parsed.skylev4),
    ):
        if cov in _CEILING_COVERS and lev is not None and not _isnan(lev):
            ceiling = lev if ceiling is None else min(ceiling, lev)
    return ceiling


def category_from_metar(raw_text: str) -> str | None:
    """Truth-side category via MetPy: parse the raw METAR for real visibility
    and ceiling, then apply the FAA thresholds. Returns None if unparseable."""
    if not raw_text:
        return None
    try:
        now = _now()
        p = parse_metar(raw_text, now.year, now.month)
    except Exception:
        return None
    vis_sm = None
    if p.visibility is not None and not _isnan(p.visibility):
        # MetPy reports visibility in metres; convert with MetPy units.
        vis_sm = (float(p.visibility) * units.meter).to(units.mile).magnitude
    ceiling = _ceiling_from_metar_layers(p)
    return classify_flight_category(vis_sm, ceiling)


def flight_category(vis_sm: float | None, cloud_cover_pct: float | None,
                    ceiling_ft: float | None = None) -> str | None:
    """Forecast-side category from gridded model output.

    Gridded NWP has no reported ceiling, so when one is not supplied we use
    cloud cover as a coarse ceiling proxy, then apply the same FAA thresholds.
    Station observations use ``category_from_metar`` (a real parsed ceiling).
    """
    if vis_sm is None and ceiling_ft is None and cloud_cover_pct is None:
        return None
    if ceiling_ft is None and cloud_cover_pct is not None:
        if cloud_cover_pct >= 90:
            ceiling_ft = 600
        elif cloud_cover_pct >= 70:
            ceiling_ft = 1500
        elif cloud_cover_pct >= 40:
            ceiling_ft = 4000
        else:
            ceiling_ft = 12000
    return classify_flight_category(vis_sm, ceiling_ft)


def _isnan(x) -> bool:
    try:
        return math.isnan(float(x))
    except (TypeError, ValueError):
        return False


# ── Live capture ─────────────────────────────────────────────────────────────
async def _fetch_om_hourly(lat: float, lon: float, start: datetime, end: datetime,
                           base: str = _OM_FORECAST) -> dict | None:
    """Fetch hourly Open-Meteo data in UTC with aviation-friendly units."""
    params = {
        "latitude": lat, "longitude": lon,
        "hourly": "temperature_2m,wind_speed_10m,pressure_msl,visibility,cloud_cover",
        "wind_speed_unit": "kn",
        "timezone": "UTC",
        "start_date": start.date().isoformat(),
        "end_date": end.date().isoformat(),
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(base, params=params)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        logger.warning(f"Open-Meteo fetch failed ({base}): {e}")
        return None


def _index_for(times: list[str], target: datetime) -> int | None:
    """Find the hourly index whose timestamp matches the target hour."""
    stamp = target.strftime("%Y-%m-%dT%H:00")
    for i, t in enumerate(times):
        if t.startswith(stamp):
            return i
    return None


async def capture_forecasts() -> int:
    """Store a pending forecast row per (station, variable, lead). Hourly."""
    issued = _round_hour(_now())
    horizon = issued + timedelta(hours=max(LEAD_TIMES) + 1)
    inserted = 0
    for station, info in STATION_COORDS.items():
        data = await _fetch_om_hourly(info["lat"], info["lon"], issued, horizon)
        if not data or "hourly" not in data:
            continue
        h = data["hourly"]
        times = h.get("time", [])
        for lead in LEAD_TIMES:
            valid = issued + timedelta(hours=lead)
            idx = _index_for(times, valid)
            if idx is None:
                continue
            # Skip if we already captured this exact forecast.
            existing = await db_execute(
                "SELECT id FROM forecast_verifications WHERE station_id=? AND issued_at=? "
                "AND lead_h=? AND variable=? LIMIT 1",
                [station, _iso(issued), lead, "temp_c"],
            )
            if existing and lead == LEAD_TIMES[0]:
                pass  # allow per-variable check below
            for var, meta in VARIABLES.items():
                series = h.get(meta["om_field"], [])
                if idx >= len(series) or series[idx] is None:
                    continue
                dup = await db_execute(
                    "SELECT id FROM forecast_verifications WHERE station_id=? AND issued_at=? "
                    "AND lead_h=? AND variable=? LIMIT 1",
                    [station, _iso(issued), lead, var],
                )
                if dup:
                    continue
                from services import forecast_correction as fc  # lazy: avoids import cycle
                fval = float(series[idx])
                await db_insert("forecast_verifications", {
                    "station_id": station, "variable": var, "lead_h": lead,
                    "issued_at": _iso(issued), "valid_at": _iso(valid),
                    "forecast_value": fval,
                    "corrected_value": fc.apply_to_forecast(station, var, lead, _iso(valid), fval),
                    "source": "live", "status": "pending",
                })
                inserted += 1
            # categorical
            vis = h.get("visibility", [])
            cc = h.get("cloud_cover", [])
            vis_sm = (vis[idx] * _M_TO_SM) if idx < len(vis) and vis[idx] is not None else None
            cc_pct = cc[idx] if idx < len(cc) and cc[idx] is not None else None
            fcat = flight_category(vis_sm, cc_pct)
            if fcat:
                dup = await db_execute(
                    "SELECT id FROM forecast_verifications WHERE station_id=? AND issued_at=? "
                    "AND lead_h=? AND variable=? LIMIT 1",
                    [station, _iso(issued), lead, CATEGORICAL],
                )
                if not dup:
                    await db_insert("forecast_verifications", {
                        "station_id": station, "variable": CATEGORICAL, "lead_h": lead,
                        "issued_at": _iso(issued), "valid_at": _iso(valid),
                        "forecast_cat": fcat, "source": "live", "status": "pending",
                    })
                    inserted += 1
    if inserted:
        logger.info(f"Captured {inserted} pending forecast rows")
    return inserted


async def _store_observations() -> dict[str, dict]:
    """Fetch current METARs, persist them, and return a station->obs map."""
    obs_by_station: dict[str, dict] = {}
    try:
        raw = await fetch_metars()
    except Exception as e:
        logger.warning(f"METAR fetch for verification failed: {e}")
        return obs_by_station
    for m in raw:
        p = parse_awc_metar(m)
        sid = p.get("station_id")
        if not sid:
            continue
        p["_pressure_hpa"] = metar_pressure_hpa(p)
        # MetPy-derived category from the raw METAR (real ceiling); fall back to
        # the AWC-reported category if the raw text cannot be parsed.
        p["_metpy_category"] = category_from_metar(p.get("raw_text", "")) or \
            (p.get("flight_category") or "").upper() or None
        obs_by_station[sid] = p
        try:
            await db_insert("weather_observations", {
                "station_id": sid, "obs_type": "METAR",
                "raw_text": p.get("raw_text", ""), "temp_c": p.get("temp_c"),
                "dewpoint_c": p.get("dewpoint_c"), "wind_dir_deg": p.get("wind_dir_deg"),
                "wind_speed_kt": p.get("wind_speed_kt"), "wind_gust_kt": p.get("wind_gust_kt"),
                "visibility_sm": p.get("visibility_sm"), "altimeter_inhg": p.get("altimeter_inhg"),
                "flight_category": p.get("flight_category", ""), "wx_string": p.get("wx_string", ""),
                "cloud_layers": p.get("cloud_layers", ""),
                "observed_at": p.get("observed_at") or _iso(_now()),
            })
        except Exception:
            pass
    return obs_by_station


async def match_pending(grace_min: int = 45) -> int:
    """Verify pending forecasts whose valid time has arrived against observations."""
    cutoff = _iso(_now() + timedelta(minutes=grace_min))
    pending = await db_execute(
        "SELECT * FROM forecast_verifications WHERE status='pending' AND valid_at<=? LIMIT 2000",
        [cutoff],
    )
    if not pending:
        return 0
    obs = await _store_observations()
    verified = 0
    for row in pending:
        sid = row["station_id"]
        o = obs.get(sid)
        if not o:
            continue
        var = row["variable"]
        if var == CATEGORICAL:
            obs_cat = o.get("_metpy_category")
            if not obs_cat:
                continue
            hit = 1 if obs_cat == row.get("forecast_cat") else 0
            await db_execute(
                "UPDATE forecast_verifications SET observed_cat=?, cat_hit=?, status='verified' WHERE id=?",
                [obs_cat, hit, row["id"]],
            )
            verified += 1
        else:
            field = VARIABLES[var]["metar"]
            obs_val = o.get(field)
            if obs_val is None:
                continue
            try:
                obs_val = float(obs_val)
            except (TypeError, ValueError):
                continue
            fcast = row["forecast_value"]
            signed = fcast - obs_val
            cv = row.get("corrected_value")
            if cv is not None:
                csigned = cv - obs_val
                await db_execute(
                    "UPDATE forecast_verifications SET observed_value=?, signed_error=?, "
                    "abs_error=?, corrected_signed_error=?, corrected_abs_error=?, "
                    "status='verified' WHERE id=?",
                    [obs_val, signed, abs(signed), csigned, abs(csigned), row["id"]],
                )
            else:
                await db_execute(
                    "UPDATE forecast_verifications SET observed_value=?, signed_error=?, "
                    "abs_error=?, status='verified' WHERE id=?",
                    [obs_val, signed, abs(signed), row["id"]],
                )
            verified += 1
    if verified:
        logger.info(f"Verified {verified} forecast rows against observations")
    return verified


# ── Metrics ──────────────────────────────────────────────────────────────────
def _stats(errors: list[float]) -> dict:
    n = len(errors)
    if n == 0:
        return {"n": 0, "bias": None, "mae": None, "rmse": None}
    bias = sum(errors) / n
    mae = sum(abs(e) for e in errors) / n
    rmse = math.sqrt(sum(e * e for e in errors) / n)
    return {"n": n, "bias": round(bias, 2), "mae": round(mae, 2), "rmse": round(rmse, 2)}


def _accuracy_pct(mae: float | None, good: float) -> float | None:
    """Map MAE to an intuitive 0-100% accuracy (100% = perfect, 0% at 3x good)."""
    if mae is None:
        return None
    return round(max(0.0, min(100.0, 100.0 * (1 - mae / (good * 3)))), 1)


async def scoreboard(window_hours: int = 168) -> dict:
    """Aggregate verified rows into the headline scoreboard."""
    since = _iso(_now() - timedelta(hours=window_hours))
    rows = await db_execute(
        "SELECT * FROM forecast_verifications WHERE status='verified' AND valid_at>=?",
        [since],
    )
    sources = {r["source"] for r in rows}
    if not rows:
        data_mode = "empty"
    elif sources == {"seed"}:
        data_mode = "seed"
    elif "seed" in sources:
        data_mode = "mixed"
    elif sources == {"backfill"}:
        data_mode = "backfill"
    elif sources <= {"live", "backfill"}:
        data_mode = "live" if "live" in sources else "backfill"
    else:
        data_mode = "live"

    # Per continuous variable
    variables = {}
    acc_components = []
    for var, meta in VARIABLES.items():
        errs = [r["signed_error"] for r in rows if r["variable"] == var and r["signed_error"] is not None]
        s = _stats(errs)
        s["accuracy_pct"] = _accuracy_pct(s["mae"], meta["good"])
        s.update({"label": meta["label"], "unit": meta["unit"]})
        variables[var] = s
        if s["accuracy_pct"] is not None:
            acc_components.append(s["accuracy_pct"])

    # Categorical hit rate
    cat_rows = [r for r in rows if r["variable"] == CATEGORICAL and r["cat_hit"] is not None]
    cat_n = len(cat_rows)
    cat_hits = sum(r["cat_hit"] for r in cat_rows)
    cat_rate = round(100.0 * cat_hits / cat_n, 1) if cat_n else None
    if cat_rate is not None:
        acc_components.append(cat_rate)

    # Per lead-time (temperature MAE as the representative skill curve + cat hit rate).
    # Dynamic: show whatever leads actually have verified data so the curve is
    # never padded with empty buckets.
    present_leads = sorted({r["lead_h"] for r in rows}) or LEAD_TIMES
    by_lead = []
    for lead in present_leads:
        lead_rows = [r for r in rows if r["lead_h"] == lead]
        temp_errs = [r["signed_error"] for r in lead_rows
                     if r["variable"] == "temp_c" and r["signed_error"] is not None]
        wind_errs = [r["signed_error"] for r in lead_rows
                     if r["variable"] == "wind_speed_kt" and r["signed_error"] is not None]
        lead_cat = [r for r in lead_rows if r["variable"] == CATEGORICAL and r["cat_hit"] is not None]
        lc_n = len(lead_cat)
        by_lead.append({
            "lead_h": lead,
            "temp_mae": _stats(temp_errs)["mae"],
            "wind_mae": _stats(wind_errs)["mae"],
            "cat_hit_rate": round(100.0 * sum(r["cat_hit"] for r in lead_cat) / lc_n, 1) if lc_n else None,
            "n": len([r for r in lead_rows if r["status"] == "verified"]),
        })

    overall = round(sum(acc_components) / len(acc_components), 1) if acc_components else None
    pending_n = await db_execute(
        "SELECT COUNT(*) AS c FROM forecast_verifications WHERE status='pending'", [])
    return {
        "data_mode": data_mode,
        "window_hours": window_hours,
        "overall_accuracy_pct": overall,
        "sample_size": len(rows),
        "pending": pending_n[0]["c"] if pending_n else 0,
        "category_hit_rate": cat_rate,
        "category_n": cat_n,
        "variables": variables,
        "by_lead": by_lead,
        "stations_evaluated": len({r["station_id"] for r in rows}),
        "generated_at": _iso(_now()),
    }


# Flight categories that constitute an instrument-conditions "warning".
WARN_CATS = {"IFR", "LIFR"}


def _warn_metrics(a: int, b: int, c: int, d: int) -> dict:
    """Standard 2x2 contingency-table verification scores.

    a=hit (warned & occurred), b=false alarm (warned, didn't occur),
    c=miss (didn't warn, occurred), d=correct negative.
    """
    events = a + c          # actual IFR/LIFR events
    warned = a + b          # times we forecast IFR/LIFR
    n = a + b + c + d
    pod = round(100.0 * a / events, 1) if events else None              # detection
    far = round(100.0 * b / warned, 1) if warned else None              # false alarms
    csi = round(100.0 * a / (a + b + c), 1) if (a + b + c) else None    # critical success
    bias = round(warned / events, 2) if events else None                # over/under-warning
    denom = (a + c) * (c + d) + (a + b) * (b + d)
    hss = round((2 * (a * d - b * c)) / denom, 2) if denom else None     # Heidke skill score
    return {
        "hits": a, "false_alarms": b, "misses": c, "correct_negatives": d,
        "events": events, "warned": warned, "n": n,
        "pod": pod, "far": far, "csi": csi, "bias": bias, "hss": hss,
    }


async def warning_scoreboard(window_hours: int = 168) -> dict:
    """Verify IFR/LIFR (instrument-conditions) warnings — the safety-critical view."""
    since = _iso(_now() - timedelta(hours=window_hours))
    rows = await db_execute(
        "SELECT lead_h, forecast_cat, observed_cat FROM forecast_verifications "
        "WHERE variable=? AND status='verified' AND forecast_cat IS NOT NULL "
        "AND observed_cat IS NOT NULL AND valid_at>=?",
        [CATEGORICAL, since],
    )

    def tally(rs):
        a = b = c = d = 0
        for r in rs:
            f = r["forecast_cat"] in WARN_CATS
            o = r["observed_cat"] in WARN_CATS
            if f and o:
                a += 1
            elif f and not o:
                b += 1
            elif (not f) and o:
                c += 1
            else:
                d += 1
        return a, b, c, d

    overall = _warn_metrics(*tally(rows))
    by_lead = []
    for lead in sorted({r["lead_h"] for r in rows}):
        lr = [r for r in rows if r["lead_h"] == lead]
        m = _warn_metrics(*tally(lr))
        by_lead.append({"lead_h": lead, "pod": m["pod"], "far": m["far"],
                        "csi": m["csi"], "events": m["events"], "n": m["n"]})

    return {
        "window_hours": window_hours,
        "warning_definition": "IFR or LIFR (instrument flight conditions)",
        "overall": overall,
        "by_lead": by_lead,
        "generated_at": _iso(_now()),
    }


async def station_leaderboard(window_hours: int = 168) -> list[dict]:
    since = _iso(_now() - timedelta(hours=window_hours))
    rows = await db_execute(
        "SELECT * FROM forecast_verifications WHERE status='verified' AND valid_at>=?",
        [since],
    )
    out = []
    for sid, info in STATION_COORDS.items():
        srows = [r for r in rows if r["station_id"] == sid]
        if not srows:
            continue
        temp = _stats([r["signed_error"] for r in srows
                       if r["variable"] == "temp_c" and r["signed_error"] is not None])
        wind = _stats([r["signed_error"] for r in srows
                       if r["variable"] == "wind_speed_kt" and r["signed_error"] is not None])
        cat = [r for r in srows if r["variable"] == CATEGORICAL and r["cat_hit"] is not None]
        cat_rate = round(100.0 * sum(r["cat_hit"] for r in cat) / len(cat), 1) if cat else None
        comps = [c for c in (
            _accuracy_pct(temp["mae"], VARIABLES["temp_c"]["good"]),
            _accuracy_pct(wind["mae"], VARIABLES["wind_speed_kt"]["good"]),
            cat_rate,
        ) if c is not None]
        out.append({
            "station_id": sid, "name": info["name"],
            "temp_mae": temp["mae"], "wind_mae": wind["mae"],
            "cat_hit_rate": cat_rate, "n": len(srows),
            "accuracy_pct": round(sum(comps) / len(comps), 1) if comps else None,
        })
    out.sort(key=lambda x: (x["accuracy_pct"] is None, -(x["accuracy_pct"] or 0)))
    return out


async def station_detail(station_id: str, window_hours: int = 168) -> dict:
    """Full verification breakdown for one station — powers the detail card."""
    sid = station_id.upper()
    since = _iso(_now() - timedelta(hours=window_hours))
    rows = await db_execute(
        "SELECT * FROM forecast_verifications WHERE status='verified' AND station_id=? AND valid_at>=?",
        [sid, since],
    )
    info = STATION_COORDS.get(sid, {})

    variables = {}
    acc_components = []
    for var, meta in VARIABLES.items():
        var_rows = [r for r in rows if r["variable"] == var and r["observed_value"] is not None]
        errs = [r["signed_error"] for r in var_rows if r["signed_error"] is not None]
        s = _stats(errs)
        s["accuracy_pct"] = _accuracy_pct(s["mae"], meta["good"])
        s.update({"label": meta["label"], "unit": meta["unit"]})
        # Latest actual observed value — grounds the error metric in a real reading.
        if var_rows:
            latest = max(var_rows, key=lambda r: r["valid_at"])
            s["latest_obs"] = round(float(latest["observed_value"]), 1)
            s["latest_obs_at"] = latest["valid_at"]
        else:
            s["latest_obs"] = None
            s["latest_obs_at"] = None
        variables[var] = s
        if s["accuracy_pct"] is not None:
            acc_components.append(s["accuracy_pct"])

    cat_rows = [r for r in rows if r["variable"] == CATEGORICAL and r["cat_hit"] is not None]
    cat_n = len(cat_rows)
    cat_rate = round(100.0 * sum(r["cat_hit"] for r in cat_rows) / cat_n, 1) if cat_n else None
    if cat_rate is not None:
        acc_components.append(cat_rate)
    # Confusion summary: how observed conditions were forecast.
    cat_breakdown = {}
    for r in cat_rows:
        oc = r["observed_cat"] or "?"
        cat_breakdown.setdefault(oc, {"n": 0, "hit": 0})
        cat_breakdown[oc]["n"] += 1
        cat_breakdown[oc]["hit"] += r["cat_hit"]

    by_lead = []
    for lead in sorted({r["lead_h"] for r in rows}):
        lr = [r for r in rows if r["lead_h"] == lead]
        t = _stats([r["signed_error"] for r in lr
                    if r["variable"] == "temp_c" and r["signed_error"] is not None])
        w = _stats([r["signed_error"] for r in lr
                    if r["variable"] == "wind_speed_kt" and r["signed_error"] is not None])
        lc = [r for r in lr if r["variable"] == CATEGORICAL and r["cat_hit"] is not None]
        by_lead.append({
            "lead_h": lead, "temp_mae": t["mae"], "wind_mae": w["mae"],
            "cat_hit_rate": round(100.0 * sum(r["cat_hit"] for r in lc) / len(lc), 1) if lc else None,
            "n": len(lr),
        })

    return {
        "station_id": sid, "name": info.get("name", sid),
        "lat": info.get("lat"), "lon": info.get("lon"),
        "elevation_ft": info.get("elevation_ft"),
        "overall_accuracy_pct": round(sum(acc_components) / len(acc_components), 1) if acc_components else None,
        "sample_size": len(rows),
        "category_hit_rate": cat_rate, "category_n": cat_n,
        "category_breakdown": cat_breakdown,
        "variables": variables, "by_lead": by_lead,
        "window_hours": window_hours,
    }


async def timeseries(station: str, variable: str, lead_h: int, limit: int = 48) -> dict:
    rows = await db_execute(
        "SELECT valid_at, forecast_value, observed_value, forecast_cat, observed_cat "
        "FROM forecast_verifications WHERE station_id=? AND variable=? AND lead_h=? "
        "AND status='verified' ORDER BY valid_at DESC LIMIT ?",
        [station.upper(), variable, lead_h, limit],
    )
    rows = list(reversed(rows))
    return {
        "station": station.upper(), "variable": variable, "lead_h": lead_h,
        "points": rows, "count": len(rows),
    }


# ── Backfill (demo bootstrap with real reanalysis) ───────────────────────────
async def _backfill_station(sid: str, info: dict, start: datetime, end: datetime) -> int:
    """Real backfill: archived forecast vs ERA5 archive (truth) per valid hour."""
    truth = await _fetch_om_hourly(info["lat"], info["lon"], start, end, base=_OM_ARCHIVE)
    fcst = await _fetch_om_hourly(info["lat"], info["lon"], start, end, base=_OM_HIST_FORECAST)
    if not truth or not fcst or "hourly" not in truth or "hourly" not in fcst:
        return 0
    th, fh = truth["hourly"], fcst["hourly"]
    times = fh.get("time", [])
    inserted = 0
    # Backfill is indexed by valid time; we bucket it as lead_h=6 (representative
    # short-range) so it contributes to the headline without faking a lead curve.
    for i, t in enumerate(times):
        ti = _index_for(th.get("time", []), datetime.fromisoformat(t).replace(tzinfo=timezone.utc))
        if ti is None:
            continue
        for var, meta in VARIABLES.items():
            fser, tser = fh.get(meta["om_field"], []), th.get(meta["om_field"], [])
            if i >= len(fser) or ti >= len(tser) or fser[i] is None or tser[ti] is None:
                continue
            signed = float(fser[i]) - float(tser[ti])
            await db_insert("forecast_verifications", {
                "station_id": sid, "variable": var, "lead_h": 6,
                "issued_at": t, "valid_at": t,
                "forecast_value": float(fser[i]), "observed_value": float(tser[ti]),
                "signed_error": signed, "abs_error": abs(signed),
                "source": "backfill", "status": "verified",
            })
            inserted += 1
        # categorical
        fv = fh.get("visibility", []); fc = fh.get("cloud_cover", [])
        tv = th.get("visibility", []); tc = th.get("cloud_cover", [])
        fcat = flight_category(
            (fv[i] * _M_TO_SM) if i < len(fv) and fv[i] is not None else None,
            fc[i] if i < len(fc) and fc[i] is not None else None)
        ocat = flight_category(
            (tv[ti] * _M_TO_SM) if ti < len(tv) and tv[ti] is not None else None,
            tc[ti] if ti < len(tc) and tc[ti] is not None else None)
        if fcat and ocat:
            await db_insert("forecast_verifications", {
                "station_id": sid, "variable": CATEGORICAL, "lead_h": 6,
                "issued_at": t, "valid_at": t,
                "forecast_cat": fcat, "observed_cat": ocat,
                "cat_hit": 1 if fcat == ocat else 0,
                "source": "backfill", "status": "verified",
            })
            inserted += 1
    return inserted


async def _backfill_previous_runs_station(sid: str, info: dict, past_days: int = 5) -> int:
    """Real lead-stratified backfill via Open-Meteo previous-runs.

    For each valid hour: the latest run is the best estimate (truth); each
    `*_previous_dayN` value is the forecast for that hour made N days earlier
    (lead = N*24h). Yields a genuine skill-vs-lead-time curve from real data.
    """
    base_fields = [m["om_field"] for m in VARIABLES.values()] + ["visibility", "cloud_cover"]
    hourly = list(base_fields)
    for f in base_fields:
        for n in PREV_LEADS:
            hourly.append(f"{f}_previous_day{n}")
    params = {
        "latitude": info["lat"], "longitude": info["lon"],
        "hourly": ",".join(hourly), "wind_speed_unit": "kn",
        "timezone": "UTC", "past_days": past_days, "forecast_days": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.get(_OM_PREVIOUS, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning(f"Previous-runs fetch failed for {sid}: {e}")
        return 0
    h = data.get("hourly", {})
    times = h.get("time", [])
    inserted = 0

    def _val(field, i):
        ser = h.get(field, [])
        return ser[i] if i < len(ser) and ser[i] is not None else None

    for i, t in enumerate(times):
        for n, lead in PREV_LEADS.items():
            for var, meta in VARIABLES.items():
                truth = _val(meta["om_field"], i)
                fcst = _val(f"{meta['om_field']}_previous_day{n}", i)
                if truth is None or fcst is None:
                    continue
                signed = float(fcst) - float(truth)
                await db_insert("forecast_verifications", {
                    "station_id": sid, "variable": var, "lead_h": lead,
                    "issued_at": t, "valid_at": t,
                    "forecast_value": float(fcst), "observed_value": float(truth),
                    "signed_error": signed, "abs_error": abs(signed),
                    "source": "backfill", "status": "verified",
                })
                inserted += 1
            # categorical
            tv, tc = _val("visibility", i), _val("cloud_cover", i)
            fv_, fc = _val(f"visibility_previous_day{n}", i), _val(f"cloud_cover_previous_day{n}", i)
            ocat = flight_category(tv * _M_TO_SM if tv is not None else None, tc)
            fcat = flight_category(fv_ * _M_TO_SM if fv_ is not None else None, fc)
            if ocat and fcat:
                await db_insert("forecast_verifications", {
                    "station_id": sid, "variable": CATEGORICAL, "lead_h": lead,
                    "issued_at": t, "valid_at": t,
                    "forecast_cat": fcat, "observed_cat": ocat,
                    "cat_hit": 1 if fcat == ocat else 0,
                    "source": "backfill", "status": "verified",
                })
                inserted += 1
    return inserted


async def backfill(days: int = 7) -> dict:
    """Populate the scoreboard from real Open-Meteo data. Demo bootstrap.

    Combines two real sources: ERA5 archive vs archived high-res forecast
    (short-range, ~6h bucket), and previous-runs (24/48/72h lead curve).
    """
    end = _now() - timedelta(days=2)        # ERA5 archive lags ~2 days
    start = end - timedelta(days=days)
    total = 0
    for sid, info in STATION_COORDS.items():
        try:
            total += await _backfill_station(sid, info, start, end)
        except Exception as e:
            logger.warning(f"Backfill failed for {sid}: {e}")
        try:
            total += await _backfill_previous_runs_station(sid, info)
        except Exception as e:
            logger.warning(f"Previous-runs backfill failed for {sid}: {e}")
    if total == 0:
        seeded = await _seed()
        return {"mode": "seed", "rows": seeded}
    logger.info(f"Backfilled {total} verified rows from Open-Meteo (archive + previous-runs)")
    return {"mode": "backfill", "rows": total}


def _seed_value(base: float, spread: float, k: int) -> float:
    """Deterministic pseudo-variation (no RNG — keeps tests/resume stable)."""
    return base + spread * math.sin(k * 1.7) * math.cos(k * 0.6)


async def _seed() -> int:
    """LABELLED illustrative fallback when reanalysis APIs are unreachable.

    Marked source='seed' so the UI shows a clear 'SEED DATA' badge and never
    presents it as real measurement.
    """
    logger.warning("Open-Meteo backfill unavailable — inserting LABELLED seed data")
    base_temp = {"temp_c": 26.0, "wind_speed_kt": 12.0, "pressure_hpa": 1015.0}
    inserted = 0
    k = 0
    for sid in STATION_COORDS:
        for lead in LEAD_TIMES:
            for h in range(12):
                valid = _now() - timedelta(hours=h * 4)
                for var, base in base_temp.items():
                    k += 1
                    obs = _seed_value(base, base * 0.04, k)
                    # error grows with lead time — the realistic skill curve
                    err = _seed_value(0, VARIABLES[var]["good"] * (0.4 + lead / 24), k + 7)
                    await db_insert("forecast_verifications", {
                        "station_id": sid, "variable": var, "lead_h": lead,
                        "issued_at": _iso(valid - timedelta(hours=lead)), "valid_at": _iso(valid),
                        "forecast_value": round(obs + err, 2), "observed_value": round(obs, 2),
                        "signed_error": round(err, 2), "abs_error": round(abs(err), 2),
                        "source": "seed", "status": "verified",
                    })
                    inserted += 1
                # categorical
                k += 1
                cats = ["VFR", "VFR", "VFR", "MVFR", "IFR"]
                ocat = cats[k % len(cats)]
                miss = (k + lead) % 5 == 0
                fcat = "MVFR" if miss and ocat == "VFR" else ocat
                await db_insert("forecast_verifications", {
                    "station_id": sid, "variable": CATEGORICAL, "lead_h": lead,
                    "issued_at": _iso(_now()), "valid_at": _iso(_now() - timedelta(hours=h * 4)),
                    "forecast_cat": fcat, "observed_cat": ocat,
                    "cat_hit": 1 if fcat == ocat else 0,
                    "source": "seed", "status": "verified",
                })
                inserted += 1
    return inserted


async def count_rows() -> int:
    r = await db_execute("SELECT COUNT(*) AS c FROM forecast_verifications", [])
    return r[0]["c"] if r else 0


async def ensure_seeded() -> None:
    """On first boot, populate the scoreboard so a demo is never blank."""
    if await count_rows() == 0:
        await backfill()
