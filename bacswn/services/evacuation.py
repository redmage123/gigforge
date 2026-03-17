"""BACSWN — Evacuation routes, shelter status, and airport operations.

Manages evacuation route visualization, emergency shelter tracking,
and airport operational status during hurricane events.
"""

import logging
import time
import random

logger = logging.getLogger("bacswn.evacuation")

# Emergency shelters across the Bahamas
SHELTERS = [
    {"id": "S01", "name": "Kendal Isaacs National Gymnasium", "lat": 25.047, "lon": -77.345,
     "island": "New Providence", "capacity": 2000, "type": "primary",
     "amenities": ["generator", "medical", "water", "food"]},
    {"id": "S02", "name": "Anatol Rodgers High School", "lat": 25.020, "lon": -77.380,
     "island": "New Providence", "capacity": 800, "type": "primary",
     "amenities": ["generator", "water", "food"]},
    {"id": "S03", "name": "Sir Jack Hayward High School", "lat": 26.520, "lon": -78.680,
     "island": "Grand Bahama", "capacity": 600, "type": "primary",
     "amenities": ["generator", "water", "food"]},
    {"id": "S04", "name": "Central Abaco Primary School", "lat": 26.530, "lon": -77.070,
     "island": "Abaco", "capacity": 400, "type": "secondary",
     "amenities": ["water", "food"]},
    {"id": "S05", "name": "Exuma Community Centre", "lat": 23.550, "lon": -75.870,
     "island": "Exuma", "capacity": 300, "type": "secondary",
     "amenities": ["generator", "water"]},
    {"id": "S06", "name": "Bimini Government Complex", "lat": 25.710, "lon": -79.250,
     "island": "Bimini", "capacity": 200, "type": "secondary",
     "amenities": ["water", "food"]},
    {"id": "S07", "name": "Long Island Community Centre", "lat": 23.170, "lon": -75.100,
     "island": "Long Island", "capacity": 250, "type": "secondary",
     "amenities": ["water"]},
    {"id": "S08", "name": "Andros Town Community Hall", "lat": 24.700, "lon": -77.770,
     "island": "Andros", "capacity": 350, "type": "secondary",
     "amenities": ["generator", "water", "food"]},
    {"id": "S09", "name": "Eleuthera Community Centre", "lat": 25.280, "lon": -76.330,
     "island": "Eleuthera", "capacity": 300, "type": "secondary",
     "amenities": ["water", "food"]},
    {"id": "S10", "name": "Cat Island Community Hall", "lat": 24.300, "lon": -75.450,
     "island": "Cat Island", "capacity": 150, "type": "secondary",
     "amenities": ["water"]},
]

# Airport operational status
AIRPORTS = [
    {"icao": "MYNN", "name": "Lynden Pindling Intl", "island": "New Providence",
     "lat": 25.039, "lon": -77.466, "runways": 2, "cat_rating": "4E",
     "services": ["customs", "fuel", "maintenance", "medevac"]},
    {"icao": "MYGF", "name": "Grand Bahama Intl", "island": "Grand Bahama",
     "lat": 26.559, "lon": -78.696, "runways": 2, "cat_rating": "4D",
     "services": ["customs", "fuel", "maintenance"]},
    {"icao": "MYEG", "name": "Exuma International", "island": "Exuma",
     "lat": 23.562, "lon": -75.878, "runways": 1, "cat_rating": "3C",
     "services": ["customs", "fuel"]},
    {"icao": "MYAM", "name": "Marsh Harbour", "island": "Abaco",
     "lat": 26.511, "lon": -77.084, "runways": 1, "cat_rating": "2B",
     "services": ["fuel"]},
    {"icao": "MYBS", "name": "South Bimini", "island": "Bimini",
     "lat": 25.700, "lon": -79.264, "runways": 1, "cat_rating": "2B",
     "services": ["customs", "fuel"]},
    {"icao": "MYAT", "name": "Treasure Cay", "island": "Abaco",
     "lat": 26.745, "lon": -77.391, "runways": 1, "cat_rating": "2B",
     "services": ["fuel"]},
    {"icao": "MYCB", "name": "Congo Town", "island": "Andros",
     "lat": 24.159, "lon": -77.590, "runways": 1, "cat_rating": "2B",
     "services": ["fuel"]},
    {"icao": "MYEM", "name": "Governor's Harbour", "island": "Eleuthera",
     "lat": 25.285, "lon": -76.331, "runways": 1, "cat_rating": "2B",
     "services": ["fuel"]},
]

# Primary evacuation routes
EVACUATION_ROUTES = [
    {"name": "Nassau → Lynden Pindling Airport", "island": "New Providence",
     "waypoints": [[25.08, -77.34], [25.06, -77.38], [25.05, -77.42], [25.04, -77.47]],
     "type": "airport", "priority": "critical"},
    {"name": "Nassau → Kendal Isaacs Gym", "island": "New Providence",
     "waypoints": [[25.06, -77.36], [25.05, -77.35], [25.047, -77.345]],
     "type": "shelter", "priority": "critical"},
    {"name": "Nassau → South Shore Evacuation", "island": "New Providence",
     "waypoints": [[25.08, -77.34], [25.03, -77.34], [24.98, -77.34]],
     "type": "coastal_evac", "priority": "high"},
    {"name": "Freeport → Grand Bahama Intl", "island": "Grand Bahama",
     "waypoints": [[26.53, -78.70], [26.54, -78.68], [26.55, -78.70]],
     "type": "airport", "priority": "critical"},
    {"name": "Freeport → Sir Jack Hayward HS", "island": "Grand Bahama",
     "waypoints": [[26.53, -78.70], [26.52, -78.69], [26.52, -78.68]],
     "type": "shelter", "priority": "high"},
    {"name": "Marsh Harbour → Central Abaco School", "island": "Abaco",
     "waypoints": [[26.54, -77.06], [26.53, -77.07], [26.53, -77.07]],
     "type": "shelter", "priority": "high"},
    {"name": "Bimini → Government Complex", "island": "Bimini",
     "waypoints": [[25.70, -79.28], [25.71, -79.26], [25.71, -79.25]],
     "type": "shelter", "priority": "critical"},
]


def get_shelter_status(category: int = 0) -> list:
    """Get all shelter statuses. Category affects occupancy simulation."""
    shelters = []
    for s in SHELTERS:
        # Simulate occupancy based on hurricane category
        if category >= 4:
            occupancy_pct = min(95, 50 + random.randint(20, 45))
        elif category >= 3:
            occupancy_pct = min(80, 30 + random.randint(15, 35))
        elif category >= 2:
            occupancy_pct = random.randint(10, 30)
        elif category >= 1:
            occupancy_pct = random.randint(0, 15)
        else:
            occupancy_pct = 0

        occupancy = int(s["capacity"] * occupancy_pct / 100)
        status = "open" if category > 0 else "standby"
        if occupancy_pct > 90:
            status = "at_capacity"

        shelters.append({
            **s,
            "status": status,
            "occupancy": occupancy,
            "occupancy_pct": occupancy_pct,
            "available": s["capacity"] - occupancy,
        })
    return shelters


def get_airport_status(category: int = 0) -> list:
    """Get airport operational status based on hurricane conditions."""
    airports = []
    for a in AIRPORTS:
        if category >= 4:
            status = "closed"
            ops = "NOTAM: Airport closed due to hurricane conditions"
        elif category >= 3:
            status = "limited"
            ops = "Emergency/military operations only"
        elif category >= 2:
            status = "limited"
            ops = "Commercial flights suspended, GA may depart"
        elif category >= 1:
            status = "operational"
            ops = "Operating with delays expected"
        else:
            status = "operational"
            ops = "Normal operations"

        # Smaller airports close earlier
        if a["cat_rating"] in ("2B",) and category >= 2:
            status = "closed"
            ops = "Airport closed — insufficient infrastructure for storm conditions"

        airports.append({
            **a,
            "status": status,
            "operations_note": ops,
            "accepting_arrivals": status == "operational",
            "departures_available": status in ("operational", "limited"),
        })
    return airports


def get_evacuation_routes() -> list:
    """Get all evacuation routes with current status."""
    routes = []
    for r in EVACUATION_ROUTES:
        routes.append({
            **r,
            "status": "open",
            "congestion": random.choice(["clear", "moderate", "heavy"]),
        })
    return routes
