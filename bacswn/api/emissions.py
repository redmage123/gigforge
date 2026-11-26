"""BACSWN — Carbon emissions API router.

What: the routes under /api/emissions: real-time CO2 estimates for flights in the
Bahamas FIR, a single-flight calculator, stored history, a CORSIA summary and the
weather-benefit ledger (fuel and CO2 saved by early storm warnings).

Why: gives the emissions dashboard one HTTP surface over the calculation
services, which stay free of web concerns.

How: each route fetches its inputs (live flights from OpenSky, stored rows from
SQLite) and delegates the arithmetic to services/emissions_calculator.py and
services/weather_benefit.py.
"""

from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel

import logging

from services import carbon_oversight as co
from services import weather_benefit
from services.database import db_select
from services.emissions_calculator import ICAO_CATEGORY, calculate_flight_emissions, estimate_airspace_emissions
from services.opensky_client import fetch_flights

router = APIRouter()
logger = logging.getLogger("bacswn.emissions")


class EmissionsCalcRequest(BaseModel):
    """Flight profile for the calculator: category, flight time (hours) and optional distance (nm)."""

    aircraft_category: str = "medium"
    flight_time_hours: float = 1.0
    distance_nm: float | None = None


@router.get("/current")
async def get_current_emissions():
    """Calculate real-time emissions for flights in Bahamas airspace."""
    flights = await fetch_flights()
    emissions = estimate_airspace_emissions(flights)
    return emissions


@router.post("/calculate")
async def calculate_emissions(req: EmissionsCalcRequest):
    """Calculate emissions for a specific flight profile."""
    return calculate_flight_emissions(
        aircraft_category=req.aircraft_category,
        flight_time_hours=req.flight_time_hours,
        distance_nm=req.distance_nm,
    )


@router.get("/history")
async def get_emissions_history(limit: int = 50):
    """Get historical emissions records."""
    records = await db_select("emissions", order_by="calculated_at DESC", limit=limit)
    return {"records": records, "count": len(records)}


@router.get("/weather-benefit")
async def weather_benefit_summary(days: int = 30):
    """Estimated fuel and CO2 saved because the mesh warned aircraft about storms early."""
    return await weather_benefit.summary(days)


@router.get("/weather-benefit.csv")
async def weather_benefit_csv(days: int = 30):
    """The weather-benefit ledger entries for the window, as CSV."""
    body = await weather_benefit.export_csv(days)
    return Response(content=body, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="weather-benefit-{days}d.csv"'})


@router.get("/summary")
async def get_emissions_summary():
    """Current airspace emissions with a CORSIA-applicability count and flights per size category."""
    flights = await fetch_flights()
    emissions = estimate_airspace_emissions(flights)

    # One mapping for ADS-B numbers and class names (services/emissions_calculator.ICAO_CATEGORY).
    groups = {"heavy": 0, "large": 0, "medium": 0, "small": 0}
    classified = 0
    for f in flights:
        raw = f.get("category")
        name = ICAO_CATEGORY.get(raw) if isinstance(raw, int) else str(raw or "").lower()
        name = "small" if name == "light" else name
        if raw not in (None, 0) and name in groups:
            groups[name] += 1
            classified += 1
    try:
        overview = await co.compliance_overview()
    except Exception as e:  # the register is optional context for this live view
        logger.warning("CORSIA overview unavailable: %s", e)
        overview = {"status": "unknown", "period": None}

    return {
        "current": emissions,
        "compliance": {
            "corsia_applicable_flights": groups["heavy"] + groups["large"],
            "total_monitored_flights": len(flights),
            # Share of flights whose size category is known (the rest are estimated as "medium").
            "monitoring_coverage_pct": round(100 * classified / len(flights), 1) if flights else None,
            # From the CORSIA oversight register, not assumed.
            "compliance_status": overview["status"],
            "compliance_period": overview.get("period"),
            "reporting_period": "real-time",
        },
        "categories": groups,
    }
