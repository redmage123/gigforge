"""BACSWN — Hurricane Operations API router.

Storm surge, evacuation, shelters, airports, historical tracks,
and Saffir-Simpson escalation alerts.
"""

from fastapi import APIRouter
from services.hurricane_client import fetch_hurricanes
from services.storm_surge import get_storm_surge_zones
from services.evacuation import get_shelter_status, get_airport_status, get_evacuation_routes
from services.hurdat import get_historical_storms, find_similar_storms
from services.channel_dispatcher import dispatch_to_all
from services.cache import cache

router = APIRouter()

# Saffir-Simpson scale reference
SAFFIR_SIMPSON = {
    1: {"label": "Category 1", "wind_mph": "74-95", "damage": "Minimal", "surge_ft": "4-5",
        "action": "Monitor situation, secure loose objects"},
    2: {"label": "Category 2", "wind_mph": "96-110", "damage": "Moderate", "surge_ft": "6-8",
        "action": "Board windows, prepare evacuation plan"},
    3: {"label": "Category 3 (Major)", "wind_mph": "111-129", "damage": "Extensive", "surge_ft": "9-12",
        "action": "Evacuate coastal areas, open shelters"},
    4: {"label": "Category 4 (Major)", "wind_mph": "130-156", "damage": "Catastrophic", "surge_ft": "13-18",
        "action": "Mandatory evacuation of flood zones, full shelter activation"},
    5: {"label": "Category 5 (Major)", "wind_mph": "157+", "damage": "Catastrophic", "surge_ft": "19+",
        "action": "Total evacuation, all airports closed, maximum emergency posture"},
}


def _wind_to_category(wind_mph: int) -> int:
    """Convert wind speed (mph) to Saffir-Simpson category."""
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


@router.get("/active")
async def get_active_hurricanes():
    """Get active tropical cyclones with Saffir-Simpson classification."""
    storms = await fetch_hurricanes()
    result = []
    for s in storms:
        cat = _wind_to_category(s.get("wind_mph", 0))
        info = SAFFIR_SIMPSON.get(cat, {})
        result.append({
            **s,
            "category": cat,
            "saffir_simpson": info,
        })
    return {"storms": result, "count": len(result)}


@router.get("/surge/{category}")
async def get_surge_zones(category: int):
    """Get storm surge flood zones for a given hurricane category."""
    return get_storm_surge_zones(category)


@router.get("/shelters")
async def get_shelters(category: int = 0):
    """Get shelter status and availability."""
    shelters = get_shelter_status(category)
    total_capacity = sum(s["capacity"] for s in shelters)
    total_occupancy = sum(s["occupancy"] for s in shelters)
    return {
        "shelters": shelters,
        "total_capacity": total_capacity,
        "total_occupancy": total_occupancy,
        "total_available": total_capacity - total_occupancy,
        "shelters_open": len([s for s in shelters if s["status"] == "open"]),
    }


@router.get("/airports")
async def get_airports(category: int = 0):
    """Get airport operational status during hurricane conditions."""
    airports = get_airport_status(category)
    return {
        "airports": airports,
        "operational": len([a for a in airports if a["status"] == "operational"]),
        "limited": len([a for a in airports if a["status"] == "limited"]),
        "closed": len([a for a in airports if a["status"] == "closed"]),
    }


@router.get("/evacuation")
async def get_evac_routes():
    """Get evacuation routes with current status."""
    routes = get_evacuation_routes()
    return {"routes": routes, "total": len(routes)}


@router.get("/historical")
async def get_historical(min_category: int = 1):
    """Get historical hurricane tracks near the Bahamas."""
    storms = get_historical_storms(min_category)
    return {"storms": storms, "count": len(storms)}


@router.get("/compare")
async def compare_with_current():
    """Compare active storms with historical track data."""
    active = await fetch_hurricanes()
    comparisons = []
    for storm in active:
        lat = storm.get("lat", 24.0)
        lon = storm.get("lon", -76.0)
        wind = storm.get("wind_mph", 0)
        similar = find_similar_storms(lat, lon, wind)
        comparisons.append({
            "active_storm": storm["name"],
            "position": {"lat": lat, "lon": lon},
            "similar_historical": similar,
        })
    return {"comparisons": comparisons}


@router.post("/escalate")
async def escalate_category(category: int, storm_name: str = "Active Storm"):
    """Trigger Saffir-Simpson escalation alert and auto-dispatch to all channels."""
    info = SAFFIR_SIMPSON.get(category, SAFFIR_SIMPSON[1])

    # Check if we already alerted for this category
    cache_key = f"hurricane:escalation:{category}"
    if cache.get(cache_key):
        return {"status": "already_dispatched", "category": category}

    # Build alert message
    title = f"HURRICANE ALERT: {storm_name} — {info['label']}"
    body = (
        f"URGENT: {storm_name} has reached {info['label']}.\n"
        f"Sustained winds: {info['wind_mph']} mph\n"
        f"Expected storm surge: {info['surge_ft']} feet\n"
        f"Damage potential: {info['damage']}\n"
        f"Required action: {info['action']}\n"
        f"\nThis is an automated alert from the BACSWN SkyWatch system."
    )

    # Dispatch to all 42 channels
    results = await dispatch_to_all(title, body, severity="extreme" if category >= 3 else "severe")

    # Mark as dispatched (cache for 1 hour)
    cache.set(cache_key, True, 3600)

    return {
        "status": "dispatched",
        "category": category,
        "label": info["label"],
        "channels_reached": len([r for r in results if r.get("status") == "sent"]),
        "total_channels": len(results),
        "message": title,
    }


@router.get("/dashboard")
async def hurricane_dashboard():
    """Full hurricane operations dashboard data."""
    storms = await fetch_hurricanes()
    max_cat = 0
    for s in storms:
        cat = _wind_to_category(s.get("wind_mph", 0))
        max_cat = max(max_cat, cat)

    surge = get_storm_surge_zones(max(1, max_cat))
    shelters = get_shelter_status(max_cat)
    airports = get_airport_status(max_cat)
    routes = get_evacuation_routes()
    historical = get_historical_storms(1)

    # Find similar historical storms
    comparisons = []
    for s in storms:
        similar = find_similar_storms(s.get("lat", 24), s.get("lon", -76), s.get("wind_mph", 0))
        comparisons.extend(similar)

    return {
        "active_storms": [{**s, "category": _wind_to_category(s.get("wind_mph", 0))} for s in storms],
        "max_category": max_cat,
        "saffir_simpson": SAFFIR_SIMPSON.get(max_cat, {}),
        "surge_zones": surge,
        "shelters": {
            "list": shelters,
            "total_capacity": sum(s["capacity"] for s in shelters),
            "total_occupancy": sum(s["occupancy"] for s in shelters),
        },
        "airports": {
            "list": airports,
            "operational": len([a for a in airports if a["status"] == "operational"]),
            "closed": len([a for a in airports if a["status"] == "closed"]),
        },
        "evacuation_routes": routes,
        "historical_comparisons": comparisons[:5],
        "historical_storms": [{"id": h["id"], "name": h["name"], "year": h["year"], "peak_category": h["peak_category"]} for h in historical],
    }
