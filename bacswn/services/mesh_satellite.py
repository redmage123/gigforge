"""BACSWN — Simulated Tomorrow.io satellite feed for the mesh stations.

Models the two instrument families Tomorrow.io flies: a Ka-band precipitation
radar and a microwave sounder. Each pass over a station scans a wide footprint
(well beyond the station's own sensors), and its products arrive one tick
(5 sim-minutes) later. The observations are generated from the simulation's
weather field so they stay consistent with the storms on the map; a real
Tomorrow.io client can replace `SatelliteFeed.observe_*` behind the same shape.

How the stations use it (see services/mesh_network.py):
  * tie-break — when the three precogs split, a fresh satellite call that
    matches one of them decides, instead of holding the old verdict;
  * an extra, independent vote in multi-station hazard verification, and the
    only verifier for a station cut off from its peers;
  * cross-checks of the station's rain gauge and visibility sensor — a local
    reading the satellite contradicts is flagged SUSPECT and TEMPO's confidence
    is cut;
  * an outlook of cells due within the next hour, beyond VISTA's 30-min nowcast.
"""

from __future__ import annotations

import math

INSTRUMENTS = {
    "radar": {"name": "Tomorrow.io precipitation radar (Ka-band)", "revisit_ticks": 12, "latency_ticks": 1},
    "sounder": {"name": "Tomorrow.io microwave sounder", "revisit_ticks": 6, "latency_ticks": 1},
}
FOOTPRINT_DEG = 1.6              # ~95 nm scan radius around the station
FRESH_TICKS = 9                  # products older than 45 sim-minutes are not used for decisions
OUTLOOK_TICKS = 12               # cells due within 60 min


def _bearing(lat1, lon1, lat2, lon2) -> float:
    dy, dx = lat2 - lat1, (lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2))
    return math.degrees(math.atan2(dx, dy)) % 360


class SatelliteFeed:
    def __init__(self, sim, rng):
        self.sim = sim
        self.rng = rng

    def build(self, node: dict) -> None:
        # Passes sweep west → east, like a ground track crossing the islands.
        frac = (node["lon"] + 80.5) / 8.5
        node["satellite"] = {
            "radar": None, "sounder": None, "pending": [],
            "phase": {k: int(frac * v["revisit_ticks"]) for k, v in INSTRUMENTS.items()},
        }

    # ── passes ──────────────────────────────────────────────────────────
    def update(self, n: dict) -> None:
        sat, tick = n["satellite"], self.sim.tick
        ready = [p for p in sat["pending"] if p["available_tick"] <= tick]
        sat["pending"] = [p for p in sat["pending"] if p["available_tick"] > tick]
        for obs in ready:
            sat[obs["instrument"]] = obs
        for inst, spec in INSTRUMENTS.items():
            if (tick - sat["phase"][inst]) % spec["revisit_ticks"] == 0:
                obs = self.observe_radar(n) if inst == "radar" else self.observe_sounder(n)
                obs.update(instrument=inst, source=spec["name"], tick=tick,
                           available_tick=tick + spec["latency_ticks"])
                sat["pending"].append(obs)

    def observe_radar(self, n: dict) -> dict:
        from services.mesh_network import _classify, _dbz_to_rain
        f = self.sim._field(n["lat"], n["lon"])
        dbz = max(0.0, f["dbz"] + self.rng.gauss(0, 3))
        cells = []
        for c in self.sim.cells:
            if c["kind"] == "fog":
                continue
            inten = self.sim._intensity(c)
            d = math.hypot(c["lat"] - n["lat"], (c["lon"] - n["lon"]) * math.cos(math.radians(n["lat"])))
            if inten < 25 or d > FOOTPRINT_DEG:
                continue
            cells.append({"id": c["id"], "kind": c["kind"], "dbz": round(inten + self.rng.gauss(0, 2)),
                          "lat": c["lat"], "lon": c["lon"], "dlat": c["dlat"], "dlon": c["dlon"],
                          "radius": c["radius"], "speed_kt": round(c["speed_kt"]), "heading": round(c["heading"])})
        return {"dbz": round(dbz, 1), "precip_mm_h": _dbz_to_rain(dbz),
                "call": _classify(dbz, f["gust"], 10, 3500, f["squall"]), "cells": cells}

    def observe_sounder(self, n: dict) -> dict:
        f = self.sim._field(n["lat"], n["lon"])
        near = max([self.sim._intensity(c) for c in self.sim.cells if c["kind"] != "fog" and
                    math.hypot(c["lat"] - n["lat"], c["lon"] - n["lon"]) < 0.6] or [0])
        hour = self.sim.sim_time().hour
        instability = min(1.0, near / 60 + (0.2 if 12 <= hour <= 18 else 0.05) + self.rng.uniform(0, 0.08))
        return {
            "cloud_top_c": round(12 - max(0.0, f["dbz"] - 15) * 1.6 + self.rng.gauss(0, 2)),
            "precipitable_water_mm": round(38 + f["fog"] * 8 + min(20, near / 3) + self.rng.gauss(0, 1.5), 1),
            "instability": round(instability, 2),
            "low_stratus": f["fog"] > 0.3,
            "call": "IFR" if f["fog"] > 0.3 else None,
        }

    # ── derived ─────────────────────────────────────────────────────────
    def _fresh(self, obs: dict | None) -> bool:
        return obs is not None and self.sim.tick - obs["tick"] <= FRESH_TICKS

    def call_now(self, n: dict, lat: float | None = None, lon: float | None = None) -> str | None:
        """Satellite's best current hazard call at a point (default: the station),
        advecting the cells it last saw by the age of the pass. None = no fresh data."""
        from services.mesh_network import _classify, SEVERITY
        sat = n["satellite"]
        radar, sounder = sat["radar"], sat["sounder"]
        if not (self._fresh(radar) or self._fresh(sounder)):
            return None
        lat, lon = (n["lat"], n["lon"]) if lat is None else (lat, lon)
        call = "CLEAR"
        if self._fresh(radar):
            age = self.sim.tick - radar["tick"]
            dbz, squall = 0.0, False
            for c in radar["cells"]:
                clat, clon = c["lat"] + c["dlat"] * age, c["lon"] + c["dlon"] * age
                d = math.hypot(lat - clat, (lon - clon) * math.cos(math.radians(lat)))
                z = c["dbz"] * math.exp(-(d / c["radius"]) ** 2)
                if z > dbz:
                    dbz, squall = z, c["kind"] == "squall"
            gust = 12 + max(0.0, dbz - 25) * (1.6 if squall else 0.9)
            call = _classify(dbz, gust, 10, 3500, squall)
        if self._fresh(sounder) and sounder["call"] and SEVERITY[sounder["call"]] > SEVERITY[call] \
                and (lat, lon) == (n["lat"], n["lon"]):
            call = sounder["call"]
        return call

    def outlook(self, n: dict) -> list[dict]:
        """Cells from the last fresh radar pass that will reach the station within the hour."""
        radar = n["satellite"]["radar"]
        if not self._fresh(radar):
            return []
        age, out = self.sim.tick - radar["tick"], []
        for c in radar["cells"]:
            for k in range(0, OUTLOOK_TICKS + 1):
                t = age + k
                clat, clon = c["lat"] + c["dlat"] * t, c["lon"] + c["dlon"] * t
                if math.hypot(n["lat"] - clat, (n["lon"] - clon) * math.cos(math.radians(n["lat"]))) < c["radius"] * 0.9:
                    out.append({"id": c["id"], "kind": c["kind"], "dbz": c["dbz"], "eta_min": k * 5})
                    break
        return sorted(out, key=lambda x: x["eta_min"])

    def cross_check(self, n: dict) -> list[str]:
        """Compare local instruments with fresh satellite products; flag contradictions."""
        net, s, tick = self.sim.sensor_net, n["sensors"], self.sim.tick
        radar, sounder = n["satellite"]["radar"], n["satellite"]["sounder"]
        # Only a pass taken after the unusual reading began can contradict it —
        # otherwise fog or rain that arrived since the last pass looks like a fault.
        since = n.setdefault("abnormal_since", {})
        for key, abnormal in (("rain", s["rain_mm_h"] >= 10), ("vis", s["visibility_sm"] < 3)):
            if not abnormal:
                since.pop(key, None)
            else:
                since.setdefault(key, tick)
        issues = []
        rain_flag = vis_flag = None
        if "rain" in since and self._fresh(radar) and radar["tick"] >= since["rain"]:
            sat_rain = radar["precip_mm_h"]
            if sat_rain < 1 and not radar["cells"]:
                rain_flag = f"Gauge {s['rain_mm_h']} mm/h, satellite radar {sat_rain} mm/h with no echoes in view"
        if "vis" in since and self._fresh(sounder) and self._fresh(radar) \
                and min(sounder["tick"], radar["tick"]) >= since["vis"]:
            if not sounder["low_stratus"] and radar["precip_mm_h"] < 2:
                vis_flag = f"Visibility {s['visibility_sm']} SM, but satellite sees no low stratus or rain"
        for code, text in (("RNG", rain_flag), ("VIS", vis_flag)):
            was = n["sensor_net"][code]["sat_flag"]
            net.flag(n, code, text)
            if text:
                issues.append(f"{code}: {text}")
                if not was:
                    self.sim._event(n["station"], "SAT CHECK", f"{n['sensor_net'][code]['type']} flagged — {text}")
        return issues

    def view(self, n: dict) -> dict:
        sat, tick = n["satellite"], self.sim.tick

        def pub(obs):
            if obs is None:
                return None
            out = {k: v for k, v in obs.items() if k not in ("cells", "available_tick", "tick")}
            out["age_min"] = (tick - obs["tick"]) * 5
            out["fresh"] = self._fresh(obs)
            out["observed_at"] = self.sim.sim_time(obs["tick"]).isoformat()
            if "cells" in obs:
                out["cells"] = [{
                    "id": c["id"], "kind": c["kind"], "dbz": c["dbz"], "speed_kt": c["speed_kt"],
                    "heading": c["heading"],
                    "distance_nm": round(math.hypot(c["lat"] - n["lat"], (c["lon"] - n["lon"]) * math.cos(math.radians(n["lat"]))) * 60),
                    "bearing": round(_bearing(n["lat"], n["lon"], c["lat"], c["lon"])),
                } for c in obs["cells"]]
            return out

        next_pass = {}
        for inst, spec in INSTRUMENTS.items():
            k = (sat["phase"][inst] - tick) % spec["revisit_ticks"]
            next_pass[inst] = (k or spec["revisit_ticks"]) * 5
        return {"radar": pub(sat["radar"]), "sounder": pub(sat["sounder"]), "call": self.call_now(n),
                "outlook": self.outlook(n), "next_pass_min": next_pass, "fresh_limit_min": FRESH_TICKS * 5,
                "simulated": True}
