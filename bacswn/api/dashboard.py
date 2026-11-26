"""BACSWN — Dashboard summary API router.

What: one summary endpoint with headline counts for every page (flights,
stations, alerts, emissions, channels, sensors, agents).

Why: the overview dashboard needs all headline numbers in a single request.

How: gathers flights, METARs and NWS alerts from their clients, estimates
airspace CO2 with ``services.emissions_calculator`` and reads agent status from
the orchestrator, then reduces each to counts.
"""

import logging

from fastapi import APIRouter
from datetime import datetime, timezone
from services.opensky_client import fetch_flights
from services.awc_client import fetch_metars, parse_metar
from services.nws_client import fetch_alerts
from services.emissions_calculator import estimate_airspace_emissions
from services.agent_orchestrator import orchestrator
from services.channel_dispatcher import CHANNELS

router = APIRouter()
logger = logging.getLogger("bacswn.dashboard")


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

    try:  # the CORSIA register gives the real position; this overview must not fail because of it
        from services.carbon_oversight import compliance_overview
        corsia_status = (await compliance_overview())["status"]
    except Exception as e:
        logger.warning("CORSIA overview unavailable: %s", e)
        corsia_status = "unknown"

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
            "compliance_status": corsia_status,
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
