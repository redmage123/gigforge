"""BACSWN — Storm surge and coastal flood zone mapping.

Generates flood zone polygons for Bahamas coastal areas based on
hurricane category and proximity. Uses SLOSH-model-inspired estimates.
"""

import logging
from config import STATION_COORDS

logger = logging.getLogger("bacswn.storm_surge")

# Storm surge height estimates by Saffir-Simpson category (feet)
SURGE_BY_CATEGORY = {
    1: {"min_ft": 4, "max_ft": 5, "inland_miles": 0.5},
    2: {"min_ft": 6, "max_ft": 8, "inland_miles": 1.0},
    3: {"min_ft": 9, "max_ft": 12, "inland_miles": 1.5},
    4: {"min_ft": 13, "max_ft": 18, "inland_miles": 3.0},
    5: {"min_ft": 19, "max_ft": 25, "inland_miles": 5.0},
}

# Key coastal zones in the Bahamas with simplified flood polygons
# Each zone: center point + approximate flood extent radius in degrees
COASTAL_ZONES = [
    {"name": "Nassau Harbour", "lat": 25.08, "lon": -77.34, "exposure": "high",
     "population": 128000, "critical_infra": ["Lynden Pindling Intl Airport", "Princess Margaret Hospital", "Port of Nassau"]},
    {"name": "Freeport Harbour", "lat": 26.53, "lon": -78.70, "exposure": "high",
     "population": 52000, "critical_infra": ["Grand Bahama Intl Airport", "Rand Memorial Hospital", "Freeport Container Port"]},
    {"name": "Marsh Harbour", "lat": 26.54, "lon": -77.06, "exposure": "extreme",
     "population": 6000, "critical_infra": ["Marsh Harbour Airport", "Abaco Medical Centre"]},
    {"name": "George Town", "lat": 23.52, "lon": -75.79, "exposure": "moderate",
     "population": 1500, "critical_infra": ["Exuma International Airport", "George Town Clinic"]},
    {"name": "Matthew Town", "lat": 20.95, "lon": -73.67, "exposure": "high",
     "population": 450, "critical_infra": ["Inagua Airport", "Matthew Town Clinic"]},
    {"name": "Governor's Harbour", "lat": 25.29, "lon": -76.24, "exposure": "moderate",
     "population": 1500, "critical_infra": ["Governor's Harbour Airport"]},
    {"name": "Rock Sound", "lat": 24.90, "lon": -76.18, "exposure": "moderate",
     "population": 900, "critical_infra": ["Rock Sound Airport"]},
    {"name": "Congo Town", "lat": 24.16, "lon": -77.59, "exposure": "high",
     "population": 800, "critical_infra": ["Congo Town Airport", "Andros Medical Clinic"]},
    {"name": "Bimini", "lat": 25.70, "lon": -79.26, "exposure": "extreme",
     "population": 1800, "critical_infra": ["South Bimini Airport"]},
    {"name": "Treasure Cay", "lat": 26.75, "lon": -77.39, "exposure": "extreme",
     "population": 500, "critical_infra": ["Treasure Cay Airport"]},
]


def _generate_flood_polygon(lat, lon, radius_deg):
    """Generate a simplified circular flood zone polygon."""
    import math
    points = []
    for i in range(24):
        angle = 2 * math.pi * i / 24
        plat = lat + radius_deg * math.sin(angle)
        plon = lon + radius_deg * math.cos(angle) / math.cos(math.radians(lat))
        points.append([round(plat, 4), round(plon, 4)])
    points.append(points[0])  # close polygon
    return points


def get_storm_surge_zones(category: int, storm_lat: float = None, storm_lon: float = None) -> dict:
    """Get flood zone data for a given hurricane category.

    Returns zones with flood polygons, surge heights, and affected infrastructure.
    """
    if category < 1 or category > 5:
        category = max(1, min(5, category))

    surge = SURGE_BY_CATEGORY[category]
    radius_base = 0.02 + category * 0.015  # degrees, grows with category

    zones = []
    total_population = 0
    total_infra = 0

    for cz in COASTAL_ZONES:
        # Exposure multiplier
        exposure_mult = {"extreme": 1.5, "high": 1.2, "moderate": 1.0, "low": 0.7}.get(cz["exposure"], 1.0)
        radius = radius_base * exposure_mult

        zone = {
            "name": cz["name"],
            "lat": cz["lat"],
            "lon": cz["lon"],
            "exposure": cz["exposure"],
            "population_at_risk": cz["population"],
            "critical_infrastructure": cz["critical_infra"],
            "surge_min_ft": surge["min_ft"],
            "surge_max_ft": surge["max_ft"],
            "inland_penetration_miles": surge["inland_miles"],
            "flood_polygon": _generate_flood_polygon(cz["lat"], cz["lon"], radius),
            "risk_level": "extreme" if category >= 4 else "high" if category >= 3 else "moderate" if category >= 2 else "elevated",
        }
        zones.append(zone)
        total_population += cz["population"]
        total_infra += len(cz["critical_infra"])

    return {
        "category": category,
        "surge_range_ft": f"{surge['min_ft']}-{surge['max_ft']}",
        "total_population_at_risk": total_population,
        "total_critical_infrastructure": total_infra,
        "zones": zones,
    }
