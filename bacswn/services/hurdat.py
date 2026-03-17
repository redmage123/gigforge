"""BACSWN — HURDAT2 historical hurricane track database.

Provides historical storm tracks near the Bahamas for comparison
with current/forecast tracks. Based on notable Atlantic hurricanes.
"""

import logging

logger = logging.getLogger("bacswn.hurdat")

# Notable historical hurricanes that affected the Bahamas
# Simplified track points: [lat, lon, wind_kt, category, timestamp_label]
HISTORICAL_STORMS = [
    {
        "id": "AL052019",
        "name": "Hurricane Dorian (2019)",
        "year": 2019,
        "peak_category": 5,
        "peak_wind_kt": 165,
        "deaths": 84,
        "damage_usd": "3.4B",
        "summary": "Cat 5 stalled over Abaco & Grand Bahama for 40+ hours. Deadliest Bahamas hurricane on record.",
        "track": [
            [15.5, -57.5, 60, 0, "Aug 28"], [17.0, -60.0, 75, 1, "Aug 29"],
            [19.5, -64.0, 100, 2, "Aug 30"], [22.0, -68.0, 130, 4, "Aug 31"],
            [24.5, -72.0, 150, 4, "Sep 1"], [26.5, -77.0, 165, 5, "Sep 1 PM"],
            [26.6, -77.1, 160, 5, "Sep 2"], [26.7, -78.0, 145, 4, "Sep 2 PM"],
            [27.5, -78.5, 120, 3, "Sep 3"], [29.0, -79.5, 100, 2, "Sep 4"],
            [31.5, -79.5, 90, 2, "Sep 5"], [35.0, -75.0, 80, 1, "Sep 6"],
        ],
    },
    {
        "id": "AL112016",
        "name": "Hurricane Matthew (2016)",
        "year": 2016,
        "peak_category": 5,
        "peak_wind_kt": 145,
        "deaths": 603,
        "damage_usd": "16.5B",
        "summary": "Cat 5 hurricane that tracked through the central Bahamas. Caused severe flooding in Nassau.",
        "track": [
            [13.0, -60.0, 60, 0, "Sep 29"], [13.5, -63.0, 75, 1, "Sep 30"],
            [13.3, -68.0, 130, 4, "Oct 1"], [13.5, -72.0, 145, 5, "Oct 1 PM"],
            [15.0, -74.0, 140, 4, "Oct 2"], [18.0, -74.5, 130, 4, "Oct 3"],
            [21.0, -74.5, 120, 3, "Oct 4"], [23.5, -75.0, 115, 3, "Oct 5"],
            [25.0, -76.0, 110, 3, "Oct 6"], [27.0, -77.5, 100, 2, "Oct 6 PM"],
            [30.0, -79.5, 100, 2, "Oct 7"], [32.0, -79.0, 85, 2, "Oct 8"],
        ],
    },
    {
        "id": "AL182005",
        "name": "Hurricane Wilma (2005)",
        "year": 2005,
        "peak_category": 5,
        "peak_wind_kt": 160,
        "deaths": 87,
        "damage_usd": "29.4B",
        "summary": "Most intense Atlantic hurricane ever recorded (882 mb). Crossed the Bahamas moving NE.",
        "track": [
            [16.0, -79.0, 60, 0, "Oct 17"], [17.0, -82.0, 90, 2, "Oct 18"],
            [17.5, -84.0, 160, 5, "Oct 19"], [18.0, -85.5, 140, 4, "Oct 20"],
            [19.5, -87.0, 130, 4, "Oct 21"], [21.0, -87.5, 110, 3, "Oct 22"],
            [23.0, -85.0, 100, 2, "Oct 23"], [24.0, -83.0, 110, 3, "Oct 24"],
            [25.5, -81.0, 110, 3, "Oct 24 PM"], [26.5, -79.0, 100, 2, "Oct 25"],
            [28.0, -76.0, 90, 2, "Oct 25 PM"], [32.0, -70.0, 75, 1, "Oct 26"],
        ],
    },
    {
        "id": "AL122004",
        "name": "Hurricane Jeanne (2004)",
        "year": 2004,
        "peak_category": 3,
        "peak_wind_kt": 105,
        "deaths": 3035,
        "damage_usd": "7.7B",
        "summary": "Looped over the Bahamas before striking Florida. Caused catastrophic flooding in Haiti.",
        "track": [
            [16.0, -60.0, 40, 0, "Sep 14"], [18.0, -64.0, 60, 0, "Sep 15"],
            [19.0, -68.0, 70, 1, "Sep 16"], [19.5, -70.0, 75, 1, "Sep 17"],
            [20.0, -72.0, 80, 1, "Sep 18"], [21.5, -73.0, 65, 0, "Sep 19"],
            [23.0, -73.5, 50, 0, "Sep 20"], [24.5, -74.0, 55, 0, "Sep 22"],
            [25.5, -75.0, 65, 0, "Sep 23"], [26.5, -77.0, 80, 1, "Sep 24"],
            [27.0, -79.0, 100, 3, "Sep 25"], [27.5, -80.0, 105, 3, "Sep 26"],
        ],
    },
    {
        "id": "AL151999",
        "name": "Hurricane Floyd (1999)",
        "year": 1999,
        "peak_category": 4,
        "peak_wind_kt": 135,
        "deaths": 84,
        "damage_usd": "6.9B",
        "summary": "Cat 4 hurricane that passed through the Bahamas. Triggered one of the largest peacetime evacuations in US history.",
        "track": [
            [16.5, -52.0, 40, 0, "Sep 8"], [18.0, -57.0, 65, 0, "Sep 10"],
            [20.0, -62.0, 90, 2, "Sep 11"], [22.0, -66.0, 120, 3, "Sep 12"],
            [23.5, -70.0, 135, 4, "Sep 13"], [25.0, -74.0, 130, 4, "Sep 13 PM"],
            [26.0, -77.0, 125, 3, "Sep 14"], [27.5, -78.5, 110, 3, "Sep 14 PM"],
            [30.0, -78.5, 100, 2, "Sep 15"], [33.0, -77.0, 90, 2, "Sep 16"],
            [36.0, -75.0, 75, 1, "Sep 16 PM"], [40.0, -70.0, 60, 0, "Sep 17"],
        ],
    },
]


def get_historical_storms(min_category: int = 1) -> list:
    """Get historical storms that affected the Bahamas."""
    return [s for s in HISTORICAL_STORMS if s["peak_category"] >= min_category]


def get_storm_by_id(storm_id: str) -> dict | None:
    """Get a specific historical storm by ID."""
    for s in HISTORICAL_STORMS:
        if s["id"] == storm_id:
            return s
    return None


def find_similar_storms(lat: float, lon: float, wind_kt: int) -> list:
    """Find historical storms with tracks near the given position."""
    similar = []
    for storm in HISTORICAL_STORMS:
        for pt in storm["track"]:
            dlat = abs(pt[0] - lat)
            dlon = abs(pt[1] - lon)
            if dlat < 3.0 and dlon < 3.0:
                similar.append({
                    "id": storm["id"],
                    "name": storm["name"],
                    "year": storm["year"],
                    "peak_category": storm["peak_category"],
                    "summary": storm["summary"],
                    "closest_point": {"lat": pt[0], "lon": pt[1], "wind_kt": pt[2]},
                })
                break
    return similar
