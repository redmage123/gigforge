"""BACSWN — OpenSky Network API client.

What: fetches live ADS-B state vectors for the Bahamas FIR bounding box and
normalises them into flight dicts, flagging emergency squawks (7500/7600/7700).

Why: the airspace picture (map, Flight Ops, emissions, carbon cross-checks)
needs current traffic.

How: a shared ``httpx.AsyncClient`` (with credentials if configured) behind a
``CircuitBreaker`` that stops calling OpenSky after repeated failures. Results are
cached for ``CACHE_TTL_FLIGHTS``. When OpenSky is down, rate-limited or the
breaker is open, simulated flights marked ``simulated: True`` are returned
instead (frozen while the demo is paused). Never raises.
"""

import logging
import random
import time
import httpx
from services.cache import cache
from services import demo_pause
from config import BAHAMAS_BBOX, OPENSKY_API_URL, OPENSKY_USERNAME, OPENSKY_PASSWORD, CACHE_TTL_FLIGHTS

logger = logging.getLogger("bacswn.opensky")

_auth = (OPENSKY_USERNAME, OPENSKY_PASSWORD) if OPENSKY_USERNAME else None
_client = httpx.AsyncClient(timeout=15.0, auth=_auth)


class CircuitBreaker:
    """Simple in-process circuit breaker to protect against repeated downstream failures.

    States: closed (normal) → open (blocking) → half-open (testing recovery).
    """

    def __init__(self, name: str, failure_threshold: int = 3, timeout_seconds: int = 60):
        """Start closed; open after ``failure_threshold`` consecutive failures, retry after ``timeout_seconds``."""
        self.name = name
        self.failure_threshold = failure_threshold
        self.timeout = timeout_seconds
        self._failures = 0
        self._opened_at: float | None = None
        self._state = "closed"  # closed, open, half-open

    def is_open(self) -> bool:
        """Return True if the circuit is open (calls should be skipped)."""
        if self._state == "open":
            if time.time() - self._opened_at > self.timeout:
                self._state = "half-open"
                return False
            return True
        return False

    def record_success(self):
        """Call after a successful request — resets the breaker to closed."""
        self._failures = 0
        self._state = "closed"
        self._opened_at = None

    def record_failure(self):
        """Call after a failed request — may trip the breaker to open."""
        self._failures += 1
        if self._failures >= self.failure_threshold:
            self._state = "open"
            self._opened_at = time.time()


# Module-level circuit breaker for OpenSky API
_opensky_breaker = CircuitBreaker("opensky")

# ── Transponder emergency codes (ICAO Annex 10 / Doc 4444) ──────────────
EMERGENCY_SQUAWKS = {
    "7500": "Unlawful interference (hijack)",
    "7600": "Radio communication failure",
    "7700": "General emergency",
}


def squawk_emergency(squawk) -> dict | None:
    """The emergency a transponder code declares, or None for an ordinary code."""
    code = str(squawk or "").strip()
    return {"code": code, "meaning": EMERGENCY_SQUAWKS[code]} if code in EMERGENCY_SQUAWKS else None


def _sim_squawk(sf: dict) -> str:
    """A stable, ordinary code per simulated flight: 1200 (VFR) for light aircraft, else a
    discrete code from the address. Never an emergency or conspicuity code."""
    if sf["baro_altitude"] < 3000:
        return "1200"
    n = int(sf["icao24"], 16)
    while True:
        code = f"{(n % 7) + 1}{(n >> 3) % 8}{(n >> 6) % 8}{(n >> 9) % 8}"
        if code not in EMERGENCY_SQUAWKS and code not in ("1200", "2000", "7000"):
            return code
        n += 1


# ── Simulated flight routes across the Bahamas FIR ────────────────────
_SIM_FLIGHTS = [
    {"icao24": "a0b1c2", "callsign": "BHS201", "origin_country": "Bahamas",
     "base_lat": 25.04, "base_lon": -77.47, "true_track": 45, "baro_altitude": 8500, "velocity": 210,
     "airline": "Bahamasair", "aircraft_type": "ATR 42-600", "registration": "C6-BFO", "route": "MYNN-MYEG"},
    {"icao24": "a1c3d4", "callsign": "AAL1492", "origin_country": "United States",
     "base_lat": 26.2, "base_lon": -78.1, "true_track": 135, "baro_altitude": 11200, "velocity": 245,
     "airline": "American Airlines", "aircraft_type": "Boeing 737-800", "registration": "N874NN", "route": "KMIA-MYNN"},
    {"icao24": "b2d4e5", "callsign": "BWA447", "origin_country": "Bahamas",
     "base_lat": 24.1, "base_lon": -75.5, "true_track": 310, "baro_altitude": 6700, "velocity": 185,
     "airline": "Bahamasair", "aircraft_type": "ATR 72-600", "registration": "C6-BFS", "route": "MYEG-MYNN"},
    {"icao24": "c3e5f6", "callsign": "DAL889", "origin_country": "United States",
     "base_lat": 23.5, "base_lon": -76.0, "true_track": 20, "baro_altitude": 10800, "velocity": 230,
     "airline": "Delta Air Lines", "aircraft_type": "Airbus A320neo", "registration": "N351DN", "route": "KATL-MYNN"},
    {"icao24": "d4f6a7", "callsign": "JBU322", "origin_country": "United States",
     "base_lat": 25.7, "base_lon": -79.0, "true_track": 90, "baro_altitude": 9100, "velocity": 220,
     "airline": "JetBlue Airways", "aircraft_type": "Airbus A321", "registration": "N947JT", "route": "KJFK-MYNN"},
    {"icao24": "e5a7b8", "callsign": "BHS105", "origin_country": "Bahamas",
     "base_lat": 24.5, "base_lon": -77.8, "true_track": 180, "baro_altitude": 3500, "velocity": 140,
     "airline": "Bahamasair", "aircraft_type": "Beechcraft 1900D", "registration": "C6-BFJ", "route": "MYNN-MYEM"},
    {"icao24": "f6b8c9", "callsign": "UAL773", "origin_country": "United States",
     "base_lat": 26.5, "base_lon": -77.0, "true_track": 200, "baro_altitude": 11500, "velocity": 250,
     "airline": "United Airlines", "aircraft_type": "Boeing 757-200", "registration": "N14107", "route": "KEWR-MYNN"},
    {"icao24": "a7c9d0", "callsign": "CUB401", "origin_country": "Cuba",
     "base_lat": 21.5, "base_lon": -74.5, "true_track": 350, "baro_altitude": 7800, "velocity": 195},
    {"icao24": "b8d0e1", "callsign": "BHS308", "origin_country": "Bahamas",
     "base_lat": 22.5, "base_lon": -73.5, "true_track": 270, "baro_altitude": 4200, "velocity": 160},
    {"icao24": "c9e1f2", "callsign": "AAL2205", "origin_country": "United States",
     "base_lat": 25.3, "base_lon": -76.3, "true_track": 55, "baro_altitude": 10200, "velocity": 235},
    {"icao24": "d0f2a3", "callsign": "BWA112", "origin_country": "Bahamas",
     "base_lat": 26.0, "base_lon": -77.4, "true_track": 160, "baro_altitude": 2800, "velocity": 130},
    {"icao24": "e1a3b4", "callsign": "SKW550", "origin_country": "Canada",
     "base_lat": 24.8, "base_lon": -75.0, "true_track": 225, "baro_altitude": 9800, "velocity": 215},
]


_last_simulated: list[dict] = []


def _generate_simulated_flights() -> list[dict]:
    """Simulated flights with position drift; they hold position while the demo is paused."""
    global _last_simulated
    if demo_pause.is_paused() and _last_simulated:
        return [dict(f) for f in _last_simulated]
    _last_simulated = _generate_simulated_flights_now()
    return [dict(f) for f in _last_simulated]


def _generate_simulated_flights_now() -> list[dict]:
    """Fresh simulated positions: each ``_SIM_FLIGHTS`` entry jittered randomly and kept inside the FIR."""
    t = time.time()
    flights = []
    for sf in _SIM_FLIGHTS:
        # Drift position slowly based on heading and time
        drift = (t % 600) / 600  # 0-1 over 10 minutes
        rad = sf["true_track"] * 3.14159 / 180
        lat = sf["base_lat"] + drift * 0.5 * (-1 if random.random() > 0.5 else 1) * abs(round(random.gauss(0, 0.1), 4))
        lon = sf["base_lon"] + drift * 0.5 * (-1 if random.random() > 0.5 else 1) * abs(round(random.gauss(0, 0.1), 4))
        # Keep within FIR bounds
        lat = max(BAHAMAS_BBOX["lamin"] + 0.5, min(BAHAMAS_BBOX["lamax"] - 0.5, lat))
        lon = max(BAHAMAS_BBOX["lomin"] + 0.5, min(BAHAMAS_BBOX["lomax"] - 0.5, lon))
        flights.append({
            "icao24": sf["icao24"],
            "callsign": sf["callsign"],
            "origin_country": sf["origin_country"],
            "airline": sf.get("airline", ""),
            "aircraft_type": sf.get("aircraft_type", ""),
            "registration": sf.get("registration", ""),
            "route": sf.get("route", ""),
            "latitude": round(lat, 4),
            "longitude": round(lon, 4),
            "baro_altitude": sf["baro_altitude"] + random.randint(-200, 200),
            "on_ground": False,
            "velocity": sf["velocity"] + random.randint(-10, 10),
            "true_track": sf["true_track"] + random.randint(-5, 5),
            "vertical_rate": round(random.uniform(-3, 3), 1),
            "geo_altitude": sf["baro_altitude"] + random.randint(-100, 100),
            "squawk": _sim_squawk(sf),
            "emergency": None,
            "category": _categorize_aircraft(sf["baro_altitude"]),
            "simulated": True,  # never count as evidence (e.g. carbon oversight cross-checks)
        })
    return flights


async def fetch_flights() -> list[dict]:
    """Fetch live flights in the Bahamas bounding box.

    Falls back to simulated data when OpenSky is unavailable, rate-limited, the
    circuit breaker is open, or OpenSky reports no aircraft. Never raises.
    """
    cached = cache.get("flights:bahamas")
    if cached is not None:
        return cached

    if _opensky_breaker.is_open():
        logger.warning("OpenSky circuit breaker OPEN — skipping API call, using simulated flights")
    else:
        try:
            resp = await _client.get(f"{OPENSKY_API_URL}/states/all", params={
                "lamin": BAHAMAS_BBOX["lamin"],
                "lamax": BAHAMAS_BBOX["lamax"],
                "lomin": BAHAMAS_BBOX["lomin"],
                "lomax": BAHAMAS_BBOX["lomax"],
            })
            resp.raise_for_status()
            data = resp.json()
            states = data.get("states") or []
            flights = [_parse_state(s) for s in states]
            if flights:
                _opensky_breaker.record_success()
                cache.set("flights:bahamas", flights, CACHE_TTL_FLIGHTS)
                logger.info(f"Fetched {len(flights)} live flights in Bahamas airspace")
                return flights
            _opensky_breaker.record_success()
        except httpx.HTTPStatusError as e:
            _opensky_breaker.record_failure()
            if e.response.status_code == 429:
                logger.warning("OpenSky rate limited — falling back to simulated flights")
            else:
                logger.error(f"OpenSky fetch failed: {e}")
        except Exception as e:
            _opensky_breaker.record_failure()
            logger.error(f"OpenSky fetch failed: {e}")

    # Fallback: simulated flights so the map always has traffic
    sim = _generate_simulated_flights()
    cache.set("flights:bahamas", sim, CACHE_TTL_FLIGHTS)
    logger.info(f"Using {len(sim)} simulated flights (OpenSky unavailable)")
    return sim


def _parse_state(state: list) -> dict:
    """Parse an OpenSky state vector into a normalized dict."""
    return {
        "icao24": state[0] if len(state) > 0 else "",
        "callsign": (state[1] or "").strip() if len(state) > 1 else "",
        "origin_country": state[2] if len(state) > 2 else "",
        "longitude": state[5] if len(state) > 5 else None,
        "latitude": state[6] if len(state) > 6 else None,
        "baro_altitude": state[7] if len(state) > 7 else None,
        "on_ground": state[8] if len(state) > 8 else False,
        "velocity": state[9] if len(state) > 9 else None,
        "true_track": state[10] if len(state) > 10 else None,
        "vertical_rate": state[11] if len(state) > 11 else None,
        "geo_altitude": state[13] if len(state) > 13 else None,
        "squawk": state[14] if len(state) > 14 else None,
        "emergency": squawk_emergency(state[14] if len(state) > 14 else None),
        "category": (
            state[17]
            if len(state) > 17 and state[17] is not None and state[17] != 0
            else _categorize_aircraft(state[7] if len(state) > 7 else None)
        ),
    }


def _categorize_aircraft(altitude: float | None) -> int:
    """Rough ICAO aircraft category based on altitude (fallback when no type data).
    Returns numeric category matching OpenSky/ICAO conventions:
    0=unknown, 2-3=light/GA, 4-7=commercial(large/heavy), 8=rotorcraft, 9-10=military
    """
    if altitude is None:
        return 0
    if altitude > 10000:
        return 5  # Large commercial / heavy
    if altitude > 5000:
        return 4  # Large
    if altitude > 1000:
        return 3  # Small / GA
    return 2  # Light
