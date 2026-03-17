"""BACSWN — Dashboard summary API router."""

from fastapi import APIRouter
from datetime import datetime, timezone
from services.opensky_client import fetch_flights
from services.awc_client import fetch_metars, parse_metar
from services.nws_client import fetch_alerts
from services.emissions_calculator import estimate_airspace_emissions
from services.agent_orchestrator import orchestrator
from services.channel_dispatcher import CHANNELS

router = APIRouter()


@router.get("/summary")
async def get_dashboard_summary():
    """Get high-level dashboard summary for all 8 pages."""
    flights = await fetch_flights()
    metars = await fetch_metars()
    alerts = await fetch_alerts()
    emissions = estimate_airspace_emissions(flights)
    agents = orchestrator.get_all_status()

    parsed_metars = [parse_metar(m) for m in metars]
    ifr_stations = [m for m in parsed_metars if m.get("flight_category") in ("IFR", "LIFR")]

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "command_center": {
            "active_flights": len(flights),
            "reporting_stations": len(parsed_metars),
            "active_alerts": len(alerts),
        },
        "watch_office": {
            "metar_count": len(parsed_metars),
            "ifr_stations": len(ifr_stations),
            "stations_reporting": len(parsed_metars),
        },
        "flight_ops": {
            "total_flights": len(flights),
            "airborne": len([f for f in flights if not f.get("on_ground")]),
            "on_ground": len([f for f in flights if f.get("on_ground")]),
        },
        "emissions": {
            "total_co2_tonnes": emissions["total_co2_tonnes"],
            "monitored_flights": emissions["total_flights"],
            "compliance_status": "compliant",
        },
        "emergency": {
            "active_incidents": 0,
            "channels_configured": len(CHANNELS),
            "last_dispatch": None,
        },
        "sensors": {
            "total_stations": 15,
            "operational": len(parsed_metars),
            "health_pct": round(len(parsed_metars) / 15 * 100, 1),
        },
        "agents": {
            "total": len(agents),
            "running": len([a for a in agents if a["status"] == "running"]),
            "idle": len([a for a in agents if a["status"] == "idle"]),
        },
    }
