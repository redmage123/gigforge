"""BACSWN — Carbon emissions API router."""

from fastapi import APIRouter
from services.opensky_client import fetch_flights
from services.emissions_calculator import calculate_flight_emissions, estimate_airspace_emissions
from services.database import db_select
from pydantic import BaseModel

router = APIRouter()


class EmissionsCalcRequest(BaseModel):
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


@router.get("/summary")
async def get_emissions_summary():
    """Get emissions compliance summary."""
    flights = await fetch_flights()
    emissions = estimate_airspace_emissions(flights)

    # Handle both numeric (ICAO) and string categories
    def cat_match(f, names, nums):
        c = f.get("category")
        return c in names or c in nums

    heavy = [f for f in flights if cat_match(f, ["heavy"], [5, 6, 7])]
    large = [f for f in flights if cat_match(f, ["large"], [4])]
    medium = [f for f in flights if cat_match(f, ["medium"], [3])]
    small = [f for f in flights if cat_match(f, ["small", "light"], [1, 2])]

    return {
        "current": emissions,
        "compliance": {
            "corsia_applicable_flights": len(heavy) + len(large),
            "total_monitored_flights": len(flights),
            "monitoring_coverage_pct": 100.0,
            "compliance_status": "compliant",
            "reporting_period": "real-time",
        },
        "categories": {
            "heavy": len(heavy),
            "large": len(large),
            "medium": len(medium),
            "small": len(small),
        },
    }
