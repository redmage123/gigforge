"""BACSWN — Mock ground sensor network around each mesh station.

Each station is the hub of a small field network: its own automatic weather
station instruments, a lightning detector, a tide / sea-state gauge and two
remote outstations on outlying cays. The station's instruments are the source
of the readings its TEMPO model uses (`node["sensors"]`); the outstations sample
the weather field at their own positions, so a storm shows up across the
network before it reaches the station.

Status is the network's own view — OK, STALE (missed reports) or SUSPECT
(contradicted by satellite). Injected faults are hidden from that view and
reported separately as presenter ground truth, so the demo shows the network
*detecting* a bad sensor rather than being told about it.
"""

from __future__ import annotations

import math
from collections import deque

HISTORY = 24                     # readings kept per metric (2 sim-hours at 5 min/tick)
OUTSTATION_OFFSETS = ((300, 0.22), (120, 0.18))   # (bearing°, distance°) from the station
DROPOUT_P = 0.004                # chance per tick a node misses reports for a while

METRICS = {
    "wind_kt": ("Wind", "kt"), "gust_kt": ("Gust", "kt"), "wind_dir_deg": ("Direction", "°"),
    "pressure_hpa": ("Pressure", "hPa"), "pressure_tendency": ("Δ pressure", "hPa/5 min"),
    "rain_mm_h": ("Rain rate", "mm/h"), "rain_1h_mm": ("Rain, last hour", "mm"),
    "temp_c": ("Temperature", "°C"), "humidity_pct": ("Humidity", "%"), "dewpoint_c": ("Dew point", "°C"),
    "visibility_sm": ("Visibility", "SM"), "present_weather": ("Present weather", ""),
    "ceiling_ft": ("Cloud base", "ft"),
    "strikes_10km": ("Strikes ≤10 km", "/5 min"), "strikes_30km": ("Strikes ≤30 km", "/5 min"),
    "water_level_m": ("Water level", "m"), "wave_height_m": ("Wave height", "m"),
}

# code: (label, metrics, primary metric for the trend line)
SENSOR_TYPES = {
    "WND": ("Anemometer mast", ("wind_kt", "gust_kt", "wind_dir_deg"), "gust_kt"),
    "BAR": ("Barometer", ("pressure_hpa", "pressure_tendency"), "pressure_hpa"),
    "RNG": ("Rain gauge", ("rain_mm_h", "rain_1h_mm"), "rain_mm_h"),
    "THR": ("Thermo-hygrometer", ("temp_c", "humidity_pct", "dewpoint_c"), "temp_c"),
    "VIS": ("Visibility / present-weather sensor", ("visibility_sm", "present_weather"), "visibility_sm"),
    "CEI": ("Ceilometer", ("ceiling_ft",), "ceiling_ft"),
    "LTG": ("Lightning detector", ("strikes_10km", "strikes_30km"), "strikes_30km"),
    "TID": ("Tide & sea-state gauge", ("water_level_m", "wave_height_m"), "water_level_m"),
    "OS1": ("Remote outstation", ("wind_kt", "gust_kt", "rain_mm_h", "pressure_hpa"), "rain_mm_h"),
    "OS2": ("Remote outstation", ("wind_kt", "gust_kt", "rain_mm_h", "pressure_hpa"), "rain_mm_h"),
}
# Injected station sensor faults → the instruments they break.
FAULT_SENSORS = {"visibility": ("VIS", "CEI"), "wind": ("WND",), "pressure": ("BAR",), "rain": ("RNG",)}


def _offset(lat: float, lon: float, bearing: float, dist: float) -> tuple[float, float]:
    r = math.radians(bearing)
    return lat + math.cos(r) * dist, lon + math.sin(r) * dist / math.cos(math.radians(lat))


def _poisson(rng, lam: float) -> int:
    if lam <= 0:
        return 0
    n, p, threshold = 0, 1.0, math.exp(-min(lam, 30))
    while True:
        p *= rng.random()
        if p <= threshold:
            return n
        n += 1


class SensorNetwork:
    def __init__(self, sim, rng):
        self.sim = sim
        self.rng = rng

    def build(self, node: dict) -> None:
        nodes = {}
        for code, (label, metrics, primary) in SENSOR_TYPES.items():
            lat, lon = node["lat"], node["lon"]
            if code.startswith("OS"):
                bearing, dist = OUTSTATION_OFFSETS[int(code[2]) - 1]
                lat, lon = _offset(lat, lon, bearing, dist)
            elif code in ("TID", "LTG"):
                lat, lon = _offset(lat, lon, 45 if code == "TID" else 200, 0.02)
            nodes[code] = {
                "id": f"{node['station']}-{code}", "code": code, "type": label, "metrics": list(metrics),
                "primary": primary, "lat": round(lat, 4), "lon": round(lon, 4),
                "distance_km": round(math.hypot(lat - node["lat"], (lon - node["lon"]) * math.cos(math.radians(lat))) * 111, 1),
                "battery_pct": self.rng.randint(70, 100), "rssi_dbm": self.rng.randint(-88, -62),
                "readings": {}, "history": {m: deque(maxlen=HISTORY) for m in metrics if m != "present_weather"},
                "stale_until": 0, "last_tick": None, "sat_flag": None,
            }
        node["sensor_net"] = nodes

    # ── per tick ────────────────────────────────────────────────────────
    def update(self, n: dict) -> None:
        sim, s, tick = self.sim, n["sensors"], self.sim.tick
        hour = sim.sim_time().hour
        rains = [h["rain_mm_h"] for h in list(n["history"])[-12:]]
        wind_dir = (90 + 10 * (tick % 4)) % 360
        station = {
            "WND": {"wind_kt": s["wind_kt"], "gust_kt": s["gust_kt"], "wind_dir_deg": wind_dir},
            "BAR": {"pressure_hpa": s["pressure_hpa"], "pressure_tendency": s["pressure_tendency"]},
            "RNG": {"rain_mm_h": s["rain_mm_h"], "rain_1h_mm": round(sum(rains) * 5 / 60, 1)},
            "THR": {"temp_c": s["temp_c"], "humidity_pct": s["humidity_pct"],
                    "dewpoint_c": round(s["temp_c"] - (100 - s["humidity_pct"]) / 5, 1)},
            "VIS": {"visibility_sm": s["visibility_sm"], "present_weather": self._present_weather(s)},
            "CEI": {"ceiling_ft": s["ceiling_ft"]},
        }
        # Lightning: strikes scale with reflectivity above ~42 dBZ, near and in a 30 km ring.
        here = sim._field(n["lat"], n["lon"])["dbz"]
        ring = max(sim._field(*_offset(n["lat"], n["lon"], b, 0.27))["dbz"] for b in range(0, 360, 45))
        near = _poisson(self.rng, max(0.0, here - 42) * 0.8)
        station["LTG"] = {"strikes_10km": near, "strikes_30km": near + _poisson(self.rng, max(0.0, max(here, ring) - 42) * 1.4)}
        # Tide: semi-diurnal M2 (12.42 h) plus wind set-up; waves from local wind.
        minutes = tick * 5 + sum(map(ord, n["station"])) * 37 % 745   # per-station tidal phase
        surge = max(0.0, s["wind_kt"] - 25) * 0.012
        station["TID"] = {"water_level_m": round(0.4 * math.sin(2 * math.pi * minutes / 745) + 0.45 + surge
                                                 + self.rng.gauss(0, 0.01), 2),
                          "wave_height_m": round(0.3 + s["wind_kt"] * 0.045 + self.rng.gauss(0, 0.05), 1)}

        for code, sensor in n["sensor_net"].items():
            if code.startswith("OS"):
                readings = self._outstation(sensor)
            else:
                readings = station[code]
            if sensor["stale_until"] > tick:
                continue                                   # missed report: keep the last one
            if self.rng.random() < DROPOUT_P:
                sensor["stale_until"] = tick + self.rng.randint(2, 4)
                continue
            sensor["readings"], sensor["last_tick"] = readings, tick
            for m, q in sensor["history"].items():
                if isinstance(readings.get(m), (int, float)):
                    q.append(readings[m])
            solar = 1 if 9 <= hour <= 16 else -1
            sensor["battery_pct"] = max(15, min(100, sensor["battery_pct"] + solar * self.rng.choice((0, 0, 1))))
            sensor["rssi_dbm"] = max(-105, min(-55, sensor["rssi_dbm"] + self.rng.choice((-1, 0, 0, 1))))

    def _outstation(self, sensor: dict) -> dict:
        f = self.sim._field(sensor["lat"], sensor["lon"])
        from services.mesh_network import _dbz_to_rain
        return {
            "wind_kt": round(10 + max(0, f["dbz"] - 25) * 0.5 + self.rng.gauss(0, 1.5)),
            "gust_kt": round(f["gust"] + self.rng.gauss(0, 2)),
            "rain_mm_h": max(0.0, round(_dbz_to_rain(f["dbz"]) * self.rng.uniform(0.8, 1.2), 1)),
            "pressure_hpa": round(1014 - max(0, f["dbz"] - 25) * 0.12 + self.rng.gauss(0, 0.2), 1),
        }

    @staticmethod
    def _present_weather(s: dict) -> str:
        if s["rain_mm_h"] >= 20:
            return "Heavy rain"
        if s["rain_mm_h"] >= 4:
            return "Rain"
        if s["rain_mm_h"] > 0.2:
            return "Light rain"
        if s["visibility_sm"] < 1:
            return "Fog"
        if s["visibility_sm"] < 5:
            return "Mist"
        return "None"

    def flag(self, n: dict, code: str, text: str | None) -> None:
        n["sensor_net"][code]["sat_flag"] = text

    # ── views ───────────────────────────────────────────────────────────
    def view(self, n: dict) -> list[dict]:
        tick, out = self.sim.tick, []
        injected = {code: kind for kind in n["sensor_faults"] for code in FAULT_SENSORS.get(kind, ())}
        for code, s in n["sensor_net"].items():
            if not n["alive"]:
                status = "OFFLINE"
            elif s["stale_until"] > tick:
                status = "STALE"
            elif s["sat_flag"]:
                status = "SUSPECT"
            else:
                status = "OK"
            age = None if s["last_tick"] is None else (tick - s["last_tick"]) * 5
            out.append({
                "id": s["id"], "code": code, "type": s["type"], "status": status,
                "flag": s["sat_flag"], "injected_fault": injected.get(code),
                "lat": s["lat"], "lon": s["lon"], "distance_km": s["distance_km"],
                "battery_pct": s["battery_pct"], "rssi_dbm": s["rssi_dbm"], "report_age_min": age,
                "readings": s["readings"], "primary": s["primary"],
                "history": {m: list(q) for m, q in s["history"].items()},
            })
        return out

    def summary(self, n: dict) -> dict:
        v = self.view(n)
        return {"total": len(v), **{k.lower(): sum(x["status"] == k for x in v) for k in ("OK", "STALE", "SUSPECT", "OFFLINE")}}
