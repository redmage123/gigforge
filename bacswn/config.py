"""BACSWN SkyWatch Bahamas — Configuration & Constants."""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"

# ── Server ──────────────────────────────────────────────────────────────
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8060"))

# ── JWT ─────────────────────────────────────────────────────────────────
_jwt_secret = os.getenv("JWT_SECRET", "")
if not _jwt_secret:
    if os.getenv("TESTING"):
        _jwt_secret = "test-secret-not-for-production"
    else:
        raise ValueError(
            "JWT_SECRET environment variable is required. "
            "Generate one with: python3 -c \"import secrets; print(secrets.token_hex(64))\""
        )
JWT_SECRET = _jwt_secret
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "24"))
JWT_ALGORITHM = "HS256"

# ── Database ────────────────────────────────────────────────────────────
DB_PATH = DATA_DIR / "bacswn.db"

# ── Bahamas FIR Bounding Box (for OpenSky queries) ──────────────────────
BAHAMAS_BBOX = {
    "lamin": 20.0,   # south
    "lamax": 27.5,   # north
    "lomin": -80.5,  # west
    "lomax": -72.0,  # east
}

# ── Bahamas Weather Stations (ICAO codes) ───────────────────────────────
BAHAMAS_STATIONS = [
    "MYNN",  # Nassau / Lynden Pindling International
    "MYGF",  # Freeport / Grand Bahama International
    "MYEG",  # George Town / Exuma International
    "MYEM",  # Governor's Harbour
    "MYER",  # Rock Sound
    "MYES",  # San Salvador
    "MYAM",  # Marsh Harbour
    "MYAT",  # Treasure Cay
    "MYBS",  # South Bimini
    "MYIG",  # Inagua / Matthew Town
    "MYMM",  # Mayaguana
    "MYRD",  # Duncan Town / Ragged Island
    "MYLD",  # Deadman's Cay / Long Island
    "MYBC",  # Chub Cay
    "MYCB",  # Congo Town / Andros
]

# ── Station Coordinates (for map display) ───────────────────────────────
STATION_COORDS = {
    "MYNN": {"lat": 25.039, "lon": -77.466, "name": "Nassau / Lynden Pindling Intl", "elevation_ft": 16},
    "MYGF": {"lat": 26.559, "lon": -78.696, "name": "Freeport / Grand Bahama Intl", "elevation_ft": 7},
    "MYEG": {"lat": 23.562, "lon": -75.878, "name": "Exuma International", "elevation_ft": 9},
    "MYEM": {"lat": 25.285, "lon": -76.331, "name": "Governor's Harbour", "elevation_ft": 26},
    "MYER": {"lat": 24.895, "lon": -76.177, "name": "Rock Sound", "elevation_ft": 10},
    "MYES": {"lat": 24.063, "lon": -74.524, "name": "San Salvador", "elevation_ft": 24},
    "MYAM": {"lat": 26.511, "lon": -77.084, "name": "Marsh Harbour", "elevation_ft": 6},
    "MYAT": {"lat": 26.745, "lon": -77.391, "name": "Treasure Cay", "elevation_ft": 8},
    "MYBS": {"lat": 25.700, "lon": -79.264, "name": "South Bimini", "elevation_ft": 10},
    "MYIG": {"lat": 20.975, "lon": -73.669, "name": "Inagua / Matthew Town", "elevation_ft": 8},
    "MYMM": {"lat": 22.379, "lon": -73.013, "name": "Mayaguana", "elevation_ft": 7},
    "MYRD": {"lat": 22.182, "lon": -75.729, "name": "Duncan Town / Ragged Island", "elevation_ft": 8},
    "MYLD": {"lat": 23.179, "lon": -75.094, "name": "Deadman's Cay / Long Island", "elevation_ft": 9},
    "MYBC": {"lat": 25.417, "lon": -77.881, "name": "Chub Cay", "elevation_ft": 5},
    "MYCB": {"lat": 24.159, "lon": -77.590, "name": "Congo Town / Andros", "elevation_ft": 7},
}

# ── Live API Endpoints ──────────────────────────────────────────────────
AWC_METAR_URL = "https://aviationweather.gov/api/data/metar"
AWC_TAF_URL = "https://aviationweather.gov/api/data/taf"
AWC_SIGMET_URL = "https://aviationweather.gov/api/data/airsigmet"
AWC_PIREP_URL = "https://aviationweather.gov/api/data/pirep"

OPENSKY_API_URL = "https://opensky-network.org/api"
OPENSKY_USERNAME = os.getenv("OPENSKY_USERNAME", "")
OPENSKY_PASSWORD = os.getenv("OPENSKY_PASSWORD", "")

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"

NWS_API_URL = "https://api.weather.gov"

TOMORROW_API_KEY = os.getenv("TOMORROW_API_KEY", "")
TOMORROW_API_URL = "https://api.tomorrow.io/v4"

# ── Cache TTLs (seconds) ───────────────────────────────────────────────
CACHE_TTL_METAR = 120       # 2 minutes
CACHE_TTL_TAF = 600         # 10 minutes
CACHE_TTL_FLIGHTS = 10      # 10 seconds (aggressive for live feel)
CACHE_TTL_FORECAST = 900    # 15 minutes
CACHE_TTL_ALERTS = 120      # 2 minutes
CACHE_TTL_EMISSIONS = 3600  # 1 hour

# ── ICAO Emissions Constants (CORSIA methodology) ──────────────────────
FUEL_BURN_RATES = {
    # kg/hr by aircraft category
    "heavy": 3500,
    "large": 2500,
    "medium": 1800,
    "small": 400,
    "light": 150,
}
CO2_PER_KG_FUEL = 3.16  # kg CO2 per kg jet fuel (ICAO standard)

# ── Bahamas FIR GeoJSON (simplified polygon) ───────────────────────────
BAHAMAS_FIR_POLYGON = [
    [-80.5, 27.5], [-72.0, 27.5], [-72.0, 20.0],
    [-80.5, 20.0], [-80.5, 27.5],
]

# ── Agent Configuration ────────────────────────────────────────────────
AGENT_POLL_INTERVALS = {
    "bacswn-wx-monitor": 60,
    "bacswn-flight-tracker": 30,
    "bacswn-sigmet-drafter": 0,   # event-driven
    "bacswn-emissions-analyst": 3600,
    "bacswn-dispatch": 0,         # event-driven
    "bacswn-qc": 30,
    "bacswn-chief": 0,            # escalation-driven
}
