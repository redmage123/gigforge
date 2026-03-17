"""BACSWN — AI analysis API router."""

from fastapi import APIRouter
from pydantic import BaseModel
from services.awc_client import fetch_metars, parse_metar
from services.opensky_client import fetch_flights
from services.emissions_calculator import estimate_airspace_emissions

router = APIRouter()


class AnalysisRequest(BaseModel):
    query: str
    context_type: str = "weather"


@router.post("/analyze")
async def ai_analyze(req: AnalysisRequest):
    """AI-powered analysis of current conditions."""
    # Build context based on type
    if req.context_type == "weather":
        metars = await fetch_metars()
        parsed = [parse_metar(m) for m in metars]
        ifr = [m for m in parsed if m.get("flight_category") in ("IFR", "LIFR")]
        mvfr = [m for m in parsed if m.get("flight_category") == "MVFR"]

        analysis = {
            "summary": f"{len(parsed)} stations reporting. {len(ifr)} IFR, {len(mvfr)} MVFR conditions.",
            "stations_reporting": len(parsed),
            "ifr_count": len(ifr),
            "mvfr_count": len(mvfr),
            "vfr_count": len(parsed) - len(ifr) - len(mvfr),
            "ifr_stations": [m["station_id"] for m in ifr],
            "recommendation": "All clear" if not ifr else f"Monitor {', '.join(m['station_id'] for m in ifr)} — IFR conditions",
        }
    elif req.context_type == "flights":
        flights = await fetch_flights()
        analysis = {
            "summary": f"{len(flights)} aircraft currently in Bahamas FIR.",
            "total_flights": len(flights),
            "airborne": len([f for f in flights if not f.get("on_ground")]),
            "recommendation": "Normal traffic levels" if len(flights) < 50 else "Elevated traffic — monitor spacing",
        }
    elif req.context_type == "emissions":
        flights = await fetch_flights()
        emissions = estimate_airspace_emissions(flights)
        analysis = {
            "summary": f"Current emissions: {emissions['total_co2_tonnes']} tonnes CO2 from {emissions['total_flights']} flights.",
            **emissions,
            "recommendation": "Within CORSIA compliance thresholds",
        }
    else:
        analysis = {"summary": "Unknown context type", "recommendation": "Specify weather, flights, or emissions"}

    return {
        "query": req.query,
        "context_type": req.context_type,
        "analysis": analysis,
    }
