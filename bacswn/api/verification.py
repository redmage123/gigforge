"""BACSWN — Forecast Verification API router.

What: exposes the forecast-skill scoreboard (how accurate the platform's
forecasts were against what was actually observed at each station), the IFR/LIFR
warning scores, the bias-correction comparison and the operations briefing.

Why: a forecast product is only credible if its skill is measured and shown;
watch officers also need to know how far to trust today's guidance.

How: thin handlers over ``services.forecast_verification`` (ledger metrics),
``services.forecast_correction`` (cached MOS scoreboard) and
``services.briefing``. Look-back windows are clamped to 1 h..90 days; the
capture and backfill triggers are limited to admin/supervisor users.
"""

from fastapi import APIRouter, Request

from services import forecast_verification as fv
from services import forecast_correction as fc
from services import briefing as br
from services.errors import BacswnPermissionError, BacswnValidationError

router = APIRouter()

_MAX_WINDOW_HOURS = 24 * 90


def _clamp_window(window_hours: int) -> int:
    """Clamp a requested look-back window to 1 hour .. 90 days."""
    return max(1, min(window_hours, _MAX_WINDOW_HOURS))


@router.get("/briefing")
async def get_briefing(llm: bool = True):
    """Plain-language operations briefing synthesized from live data."""
    return await br.generate_briefing(use_llm=llm)


@router.get("/correction")
async def get_correction():
    """Raw vs bias-corrected (MOS) forecast accuracy, out-of-sample.

    Served from a precomputed cache — the evaluation (dozens of model fits) runs
    on a schedule, never in the request path, so this returns instantly.
    """
    return fc.get_cached_scoreboard()


@router.get("/scoreboard")
async def get_scoreboard(window_hours: int = 168):
    """Headline forecast-verification metrics over the given window."""
    return await fv.scoreboard(_clamp_window(window_hours))


@router.get("/warnings")
async def get_warnings(window_hours: int = 168):
    """IFR/LIFR warning verification — POD, FAR, CSI, HSS (safety-critical view)."""
    return await fv.warning_scoreboard(_clamp_window(window_hours))


@router.get("/stations")
async def get_station_leaderboard(window_hours: int = 168):
    """Per-station forecast-accuracy leaderboard."""
    return {"stations": await fv.station_leaderboard(_clamp_window(window_hours))}


@router.get("/station/{station_id}")
async def get_station_detail(station_id: str, window_hours: int = 168):
    """Full verification breakdown for a single station (detail card)."""
    return await fv.station_detail(station_id, _clamp_window(window_hours))


@router.get("/timeseries")
async def get_timeseries(station: str = "MYNN", variable: str = "temp_c",
                         lead_h: int = 6, limit: int = 48):
    """Forecast-vs-observed pairs for one station/variable/lead (for charting)."""
    if variable not in fv.CONTINUOUS and variable != fv.CATEGORICAL:
        raise BacswnValidationError(f"Unknown variable: {variable}")
    return await fv.timeseries(station, variable, lead_h, max(1, min(limit, 240)))


@router.get("/meta")
async def get_meta():
    """Static metadata: lead times and the variables we verify."""
    return {
        "lead_times": fv.LEAD_TIMES,
        "variables": {k: {"label": v["label"], "unit": v["unit"]}
                      for k, v in fv.VARIABLES.items()},
        "categorical": fv.CATEGORICAL,
    }


def _is_admin(request: Request) -> bool:
    """True if the authenticated user (set on ``request.state`` by the auth middleware) is admin or supervisor."""
    user = getattr(request.state, "user", None)
    return bool(user) and user.get("role") in ("admin", "supervisor")


@router.post("/capture")
async def trigger_capture(request: Request):
    """Run a capture + match cycle now (admin/supervisor)."""
    if not _is_admin(request):
        raise BacswnPermissionError("Admin privileges required")
    captured = await fv.capture_forecasts()
    verified = await fv.match_pending()
    return {"captured": captured, "verified": verified}


@router.post("/backfill")
async def trigger_backfill(request: Request, days: int = 7):
    """Backfill the scoreboard from Open-Meteo reanalysis (admin/supervisor)."""
    if not _is_admin(request):
        raise BacswnPermissionError("Admin privileges required")
    return await fv.backfill(max(1, min(days, 30)))
