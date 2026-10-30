"""BACSWN — Distributed mesh network of AI radar/weather stations (simulation).

Implements the Mesh Architecture Master Plan (BACSWN-ARCH) behaviour as a live
simulation that advances while it is being observed:

* A synthetic weather field (convective cells, frontal squall lines, fog banks)
  drifts across the Bahamas. It is the ground truth every station samples.
* Each station runs THREE independent "precog" models on different modalities
  (§4.1 L4, 2-of-3 model-consensus ensemble):
      TEMPO — the station's own sensor time-series
      VISTA — radar / satellite imagery, with a 30-minute nowcast look-ahead
      LEXIS — METAR text + climatology + warnings received from upstream peers
  Two must agree before the station acts. A dissenting model files a
  *minority report*, which is later scored against what actually happened
  ("vindicated" when the lone model saw the future). A model that keeps
  dissenting while the other two agree is quarantined.
* Multi-station consensus (§4.2) guards against a bad *station*: a local hazard
  call is put to neighbouring stations, which vote from their own radar view of
  the originator's location. Only a confirmed hazard becomes an ALERT, routed to
  the Nassau hub over the mesh (shortest-latency path); if the mesh is
  partitioned the alert waits in the node's store-and-forward queue.
* Stations send PROPAGATION hand-offs to downstream peers when a cell is headed
  their way, and the receiving LEXIS model uses them.

Fault injection (node/link outages, stuck sensors, corrupted models) and canned
scenarios let a presenter show each safeguard working.
"""

from __future__ import annotations

import heapq
import itertools
import logging
import math
import random
import time
from collections import deque
from datetime import datetime, timedelta, timezone

from config import STATION_COORDS, BAHAMAS_STATIONS

logger = logging.getLogger("bacswn.mesh")

# ── Tunables ────────────────────────────────────────────────────────────
RADIO_RANGE_DEG = 2.5          # max link distance (~150 nm, VHF + relays)
TICK_SECONDS = 1.0             # wall-clock seconds per simulation tick
SIM_MINUTES_PER_TICK = 5       # simulated minutes per tick
MAX_CATCHUP_TICKS = 10
NOWCAST_TICKS = 6              # VISTA look-ahead (30 sim-minutes)
EVAL_TICKS = 8                 # minority reports scored over 40 sim-minutes
REPORT_STREAK = 2              # a dissent must persist this many ticks to file a minority report
QUARANTINE_DISMISSALS = 3      # dismissed (proven-wrong) reports within the window → quarantine
QUARANTINE_WINDOW = 30         # ticks
HUB = "MYNN"                   # Nassau NOC gateway
BOUNDS = {"lat": (20.0, 27.5), "lon": (-80.5, -72.0)}

HAZARDS = ["CLEAR", "SHOWERS", "IFR", "TSRA", "SQUALL"]
SEVERITY = {h: i for i, h in enumerate(HAZARDS)}

PRECOGS = {
    "TEMPO": "Sensor time-series model",
    "VISTA": "Radar / satellite imagery nowcast",
    "LEXIS": "METAR text + climatology + peer warnings",
}

SENSOR_FAULTS = {
    "visibility": "Visibility sensor stuck at 0.5 SM",
    "wind": "Anemometer bearing failure — spurious 55 kt gusts",
    "pressure": "Barometer drift — reading 994 hPa and falling",
    "rain": "Rain gauge flooded — reporting 45 mm/h",
}


def _distance_deg(lat1, lon1, lat2, lon2):
    """Euclidean distance in degrees with latitude correction.

    At ~25°N, a degree of longitude is cos(25°) ≈ 0.906 of a degree of latitude.
    Applying the cosine factor corrects E-W distances so topology is accurate.
    """
    lat_mid = math.radians((lat1 + lat2) / 2)
    cos_lat = math.cos(lat_mid)
    dlat = lat1 - lat2
    dlon = (lon1 - lon2) * cos_lat
    return math.sqrt(dlat ** 2 + dlon ** 2)


def _bearing_to_compass(deg: float) -> str:
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][int(((deg % 360) + 22.5) // 45) % 8]


def _classify(dbz: float, gust: float, vis: float, ceiling: float, squall: bool = False) -> str:
    """Map observed/forecast conditions to a hazard class (most severe wins)."""
    if squall and dbz >= 40 and gust >= 34:
        return "SQUALL"
    if dbz >= 45:
        return "TSRA"
    if vis < 3 or ceiling < 1000:
        return "IFR"
    if dbz >= 28:
        return "SHOWERS"
    return "CLEAR"


def _dbz_to_rain(dbz: float) -> float:
    """Marshall–Palmer Z-R: R = (Z/200)^(1/1.6) mm/h."""
    return 0.0 if dbz < 15 else round((10 ** (dbz / 10) / 200) ** (1 / 1.6), 1)


def _rain_to_dbz(rain: float) -> float:
    return 0.0 if rain <= 0.05 else 10 * math.log10(200 * rain ** 1.6)


class MeshSimulation:
    def __init__(self, seed: int | None = None):
        self.rng = random.Random(seed)
        self._ids = itertools.count(1)
        self.reset()

    # ── lifecycle ───────────────────────────────────────────────────────
    def reset(self) -> None:
        self.tick = 0
        self.sim_start = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        self._last_wall = time.time()
        self.cells: list[dict] = []
        self.links = self._build_links()
        self.nodes = {code: self._new_node(code) for code in BAHAMAS_STATIONS}
        self.messages: deque = deque(maxlen=150)
        self.heartbeats: deque = deque(maxlen=40)
        self.consensus_log: deque = deque(maxlen=40)
        self.minority_reports: deque = deque(maxlen=60)
        self.propagation: dict[tuple, dict] = {}
        self.events: deque = deque(maxlen=60)
        self.counters = {"alerts": 0, "confirmed": 0, "rejected": 0, "store_forward": 0,
                         "vindicated": 0, "dismissed": 0, "quarantines": 0}
        for _ in range(3):
            self._spawn_random_cell(initial=True)
        for _ in range(3):
            self.step()

    def _build_links(self) -> dict[tuple, dict]:
        links = {}
        codes = list(STATION_COORDS)
        for i, a in enumerate(codes):
            for b in codes[i + 1:]:
                ia, ib = STATION_COORDS[a], STATION_COORDS[b]
                d = _distance_deg(ia["lat"], ia["lon"], ib["lat"], ib["lon"])
                if d > RADIO_RANGE_DEG:
                    continue
                kind = "vhf" if d < 1.0 else "cellular" if d < 1.8 else "satellite"
                base_latency = {"vhf": 8, "cellular": 35, "satellite": 600}[kind]
                links[(a, b)] = {
                    "a": a, "b": b, "type": kind, "distance_nm": round(d * 60, 1),
                    "latency_ms": int(base_latency + d * 12),
                    "quality": max(35, int(100 - d / RADIO_RANGE_DEG * 55)),
                    "up": True, "traffic": deque(maxlen=30),
                }
        return links

    def _new_node(self, code: str) -> dict:
        info = STATION_COORDS[code]
        return {
            "station": code, "name": info["name"], "lat": info["lat"], "lon": info["lon"],
            "alive": True, "sensor_faults": set(), "battery_pct": self.rng.randint(82, 100),
            "history": deque(maxlen=8), "truth_history": deque(maxlen=EVAL_TICKS + 4),
            "precogs": {pid: {"id": pid, "modality": desc, "call": "CLEAR", "confidence": 0.9,
                              "reason": "Initialising", "corrupted": False, "quarantined": False,
                              "dissent_streak": 0, "lexis_pending": None, "dismissals": deque(maxlen=10),
                              "reported_call": None}
                        for pid, desc in PRECOGS.items()},
            "verdict": {"call": "CLEAR", "agreement": "3/3", "confidence": 0.9, "split": False},
            "warnings": [], "queue": [], "msgs_sent": 0, "msgs_recv": 0, "alerts_issued": 0,
            "sensors": {}, "truth": "CLEAR", "suspect": None,
        }

    def sim_time(self, tick: int | None = None) -> datetime:
        return self.sim_start + timedelta(minutes=SIM_MINUTES_PER_TICK * (self.tick if tick is None else tick))

    def advance(self) -> None:
        """Catch the simulation up to wall-clock time (it runs only while observed)."""
        now = time.time()
        due = int((now - self._last_wall) / TICK_SECONDS)
        if due <= 0:
            return
        self._last_wall += due * TICK_SECONDS
        for _ in range(min(due, MAX_CATCHUP_TICKS)):
            self.step()

    # ── weather field ───────────────────────────────────────────────────
    def _spawn_cell(self, kind: str, lat: float, lon: float, heading: float, speed_kt: float,
                    peak: float, radius: float, life: int) -> dict:
        rad = math.radians(heading)
        deg_per_tick = speed_kt / 3600 * SIM_MINUTES_PER_TICK   # kt → deg/min (1° ≈ 60 nm)
        cell = {
            "id": f"C{next(self._ids)}", "kind": kind, "lat": lat, "lon": lon,
            "dlat": math.cos(rad) * deg_per_tick, "dlon": math.sin(rad) * deg_per_tick / math.cos(math.radians(lat)),
            "heading": heading, "speed_kt": speed_kt, "peak": peak, "radius": radius,
            "age": 0, "life": life,
        }
        self.cells.append(cell)
        return cell

    def _spawn_random_cell(self, initial: bool = False) -> None:
        r = self.rng.random()
        if r < 0.5:      # trade-wind convection drifting west
            lat, lon = self.rng.uniform(21.5, 26.5), self.rng.uniform(-75, -72.2)
            heading, kind = self.rng.uniform(255, 290), "convective"
            speed, peak, radius = self.rng.uniform(12, 22), self.rng.uniform(42, 56), self.rng.uniform(0.22, 0.4)
        elif r < 0.8:    # frontal squall from the NW
            lat, lon = self.rng.uniform(25.5, 27.3), self.rng.uniform(-80.3, -78.8)
            heading, kind = self.rng.uniform(115, 150), "squall"
            speed, peak, radius = self.rng.uniform(22, 34), self.rng.uniform(48, 60), self.rng.uniform(0.3, 0.5)
        else:            # radiation fog near an island
            st = STATION_COORDS[self.rng.choice(BAHAMAS_STATIONS)]
            lat, lon = st["lat"] + self.rng.uniform(-0.4, 0.4), st["lon"] + self.rng.uniform(-0.4, 0.4)
            heading, kind = self.rng.uniform(0, 360), "fog"
            speed, peak, radius = self.rng.uniform(2, 5), self.rng.uniform(0.7, 0.95), self.rng.uniform(0.25, 0.45)
        if initial:
            lat, lon = self.rng.uniform(21.5, 26.8), self.rng.uniform(-79.5, -73)
        self._spawn_cell(kind, lat, lon, heading, speed, peak, radius, self.rng.randint(28, 60))

    def _intensity(self, c: dict, age: int | None = None) -> float:
        age = c["age"] if age is None else age
        frac = min(1.0, max(0.0, age / c["life"]))
        return c["peak"] * math.sqrt(max(0.0, math.sin(math.pi * frac))) if c["kind"] != "fog" else \
            c["peak"] * (1 if frac < 0.8 else max(0.0, (1 - frac) * 5))

    def _field(self, lat: float, lon: float, ahead: int = 0) -> dict:
        """True conditions at a point, `ahead` ticks into the future (cells advected)."""
        dbz, fog, squall, nearest = 0.0, 0.0, False, None
        for c in self.cells:
            clat, clon = c["lat"] + c["dlat"] * ahead, c["lon"] + c["dlon"] * ahead
            d = _distance_deg(lat, lon, clat, clon)
            w = math.exp(-(d / c["radius"]) ** 2)
            inten = self._intensity(c, c["age"] + ahead)
            if c["kind"] == "fog":
                fog = max(fog, inten * w)
            else:
                z = inten * w
                if z > dbz:
                    dbz, squall, nearest = z, c["kind"] == "squall", c
        gust = 12 + max(0.0, dbz - 25) * (1.6 if squall else 0.9)
        vis = max(0.25, 10 / (1 + _dbz_to_rain(dbz) / 6) * (1 - 0.92 * fog))
        ceiling = max(200, 3500 - max(0.0, dbz - 30) * 70 - fog * 3200)
        return {"dbz": dbz, "gust": gust, "vis": vis, "ceiling": ceiling, "squall": squall,
                "fog": fog, "cell": nearest}

    # ── per-tick update ─────────────────────────────────────────────────
    def step(self) -> None:
        self.tick += 1
        for c in self.cells:
            c["lat"] += c["dlat"]
            c["lon"] += c["dlon"]
            c["age"] += 1
        self.cells = [c for c in self.cells if c["age"] < c["life"]
                      and BOUNDS["lat"][0] - 1 < c["lat"] < BOUNDS["lat"][1] + 1
                      and BOUNDS["lon"][0] - 1 < c["lon"] < BOUNDS["lon"][1] + 1]
        if len(self.cells) < 2 or (len(self.cells) < 5 and self.rng.random() < 0.08):
            self._spawn_random_cell()

        for n in self.nodes.values():
            n["warnings"] = [w for w in n["warnings"] if w["expires"] > self.tick]
            if not n["alive"]:
                continue
            self._sample_sensors(n)
            self._run_precogs(n)
            self._decide(n)
            self._score_minority_reports(n)

        for n in self.nodes.values():
            if n["alive"]:
                self._propagation_handoffs(n)
                self._flush_queue(n)
                if self.tick % 3 == sum(map(ord, n["station"])) % 3:
                    self._heartbeat(n)

    def _sample_sensors(self, n: dict) -> None:
        t = self._field(n["lat"], n["lon"])
        truth = _classify(t["dbz"], t["gust"], t["vis"], t["ceiling"], t["squall"])
        n["truth"] = truth
        n["truth_history"].append((self.tick, truth))
        hour = self.sim_time().hour
        prev_p = n["sensors"].get("pressure_hpa")
        s = {
            "temp_c": round(28 + 2.5 * math.sin((hour - 9) / 24 * 2 * math.pi) - max(0, t["dbz"] - 30) * 0.15
                            + self.rng.gauss(0, 0.3), 1),
            "pressure_hpa": round(1014 - max(0, t["dbz"] - 25) * 0.12 + self.rng.gauss(0, 0.2), 1),
            "wind_kt": round(10 + max(0, t["dbz"] - 25) * 0.5 + self.rng.gauss(0, 1.5)),
            "gust_kt": round(t["gust"] + self.rng.gauss(0, 2)),
            "rain_mm_h": max(0.0, round(_dbz_to_rain(t["dbz"]) * self.rng.uniform(0.8, 1.2), 1)),
            "visibility_sm": round(max(0.25, t["vis"] * self.rng.uniform(0.9, 1.1)), 1),
            "ceiling_ft": int(max(100, t["ceiling"] * self.rng.uniform(0.92, 1.08)) // 100 * 100),
            "humidity_pct": int(min(100, 72 + t["fog"] * 28 + min(20, t["dbz"] / 3))),
        }
        faults = n["sensor_faults"]
        if "visibility" in faults:
            s["visibility_sm"], s["ceiling_ft"] = 0.5, 300
        if "wind" in faults:
            s["gust_kt"], s["wind_kt"] = 55, 38
        if "pressure" in faults:
            s["pressure_hpa"] = round((prev_p or 1000) - 0.8, 1) if (prev_p or 0) > 980 else 994.0
        if "rain" in faults:
            s["rain_mm_h"] = 45.0
        s["pressure_tendency"] = round(s["pressure_hpa"] - prev_p, 1) if prev_p else 0.0
        n["sensors"] = s
        n["history"].append(s)
        n["battery_pct"] = max(20, min(100, n["battery_pct"] + (1 if 9 <= hour <= 16 else -1) * self.rng.choice((0, 0, 1))))

    # ── the three precogs ───────────────────────────────────────────────
    def _run_precogs(self, n: dict) -> None:
        s = n["sensors"]
        p = n["precogs"]

        # TEMPO — sensor time-series.
        dbz_est = _rain_to_dbz(s["rain_mm_h"])
        falling = sum(h.get("pressure_tendency", 0) for h in list(n["history"])[-3:])
        call = _classify(dbz_est, s["gust_kt"], s["visibility_sm"], s["ceiling_ft"],
                         squall=s["gust_kt"] >= 34 and falling <= -0.8)
        if call == "SHOWERS" and falling <= -1.2 and s["gust_kt"] >= 25:
            call = "TSRA"
        reason = (f"rain {s['rain_mm_h']} mm/h (~{dbz_est:.0f} dBZ), gust {s['gust_kt']} kt, "
                  f"vis {s['visibility_sm']} SM, cig {s['ceiling_ft']} ft, Δp {falling:+.1f} hPa")
        self._set_precog(p["TEMPO"], call, 0.62 + min(0.33, abs(dbz_est - 35) / 60), reason)

        # VISTA — radar/satellite with nowcast look-ahead (independent of station sensors).
        best, best_t, best_f = "CLEAR", None, None
        for k in range(NOWCAST_TICKS + 1):
            f = self._field(n["lat"], n["lon"], ahead=k)
            dbz = f["dbz"] + self.rng.gauss(0, 2.5)
            foggy = f["fog"] > 0.3
            c = _classify(dbz, f["gust"], f["vis"] if foggy else 10, f["ceiling"] if foggy else 3500, f["squall"])
            if SEVERITY[c] > SEVERITY[best]:
                best, best_t, best_f = c, k, f
        if best == "CLEAR":
            reason = "No echoes ≥ 28 dBZ within 30 min; satellite shows no low stratus"
            conf = 0.9
        else:
            cell = best_f["cell"]
            what = "Low stratus / fog on satellite" if cell is None or best == "IFR" else \
                f"{cell['id']} {cell['kind']} cell {self._intensity(cell):.0f} dBZ moving {_bearing_to_compass(cell['heading'])} {cell['speed_kt']:.0f} kt"
            when = "overhead now" if best_t == 0 else f"arrival in ~{best_t * SIM_MINUTES_PER_TICK} min"
            reason = f"{what} — {when}"
            conf = 0.93 - best_t * 0.04
        self._set_precog(p["VISTA"], best, conf, reason)

        # LEXIS — METAR text + climatology + upstream warnings; conservative.
        metar = self._metar(n)
        wx_call = "CLEAR"
        if "TSRA" in metar:
            wx_call = "SQUALL" if " SQ" in metar else "TSRA"
        elif " FG " in metar or s["visibility_sm"] < 3 or s["ceiling_ft"] < 1000:
            wx_call = "IFR"
        elif "SHRA" in metar:
            wx_call = "SHOWERS"
        warn = max(n["warnings"], key=lambda w: SEVERITY[w["call"]], default=None)
        lex = p["LEXIS"]
        if warn and SEVERITY[warn["call"]] > SEVERITY[wx_call] and warn["eta_ticks"] <= 3:
            call = warn["call"]
            reason = f"Upstream warning from {warn['from']}: {warn['call']} ETA {warn['eta_ticks'] * SIM_MINUTES_PER_TICK} min · {metar}"
        elif wx_call != lex["call"] and lex["lexis_pending"] != wx_call:
            # Persistence rule: needs the same signal on two consecutive reports.
            lex["lexis_pending"] = wx_call
            call, reason = lex["call"], f"Holding {lex['call']} pending confirmation of {wx_call} · {metar}"
        else:
            lex["lexis_pending"] = None
            call, reason = wx_call, metar
        hour = self.sim_time().hour
        clim = 0.05 if 13 <= hour <= 18 else 0.0       # afternoon convection prior
        self._set_precog(lex, call, 0.7 + clim + self.rng.uniform(0, 0.15), reason)

    def _set_precog(self, pc: dict, call: str, conf: float, reason: str) -> None:
        if pc["corrupted"]:
            call = self.rng.choices(HAZARDS, weights=[1, 2, 2, 3, 3])[0]
            conf = self.rng.uniform(0.9, 0.99)
            reason = "Output drift: weights checksum mismatch — inference not grounded in inputs"
        pc["call"], pc["confidence"], pc["reason"] = call, round(min(0.99, max(0.3, conf)), 2), reason

    def _metar(self, n: dict) -> str:
        s = n["sensors"]
        t = self.sim_time()
        wx = []
        dbz = _rain_to_dbz(s["rain_mm_h"])
        if dbz >= 45:
            wx.append(("+TSRA" if dbz >= 52 else "TSRA") + (" SQ" if s["gust_kt"] >= 34 else ""))
        elif dbz >= 28:
            wx.append("SHRA")
        if s["visibility_sm"] < 1 and dbz < 28:
            wx.append("FG")
        elif s["visibility_sm"] < 5 and dbz < 28:
            wx.append("BR")
        vis = f"{s['visibility_sm']:.0f}SM" if s["visibility_sm"] >= 1 else "1/2SM"
        cig = f"BKN{s['ceiling_ft'] // 100:03d}" + ("CB" if dbz >= 45 else "")
        gust = f"G{s['gust_kt']}" if s["gust_kt"] - s["wind_kt"] >= 10 else ""
        dew = round(s["temp_c"] - (100 - s["humidity_pct"]) / 5)
        wind_dir = (90 + 10 * (self.tick % 4)) % 360
        return (f"{n['station']} {t:%d%H%M}Z {wind_dir:03d}{s['wind_kt']:02d}{gust}KT "
                f"{vis} {' '.join(wx) + ' ' if wx else ''}{cig} {round(s['temp_c']):02d}/{dew:02d} Q{round(s['pressure_hpa'])}")

    # ── 2-of-3 ensemble + minority reports ──────────────────────────────
    def _decide(self, n: dict) -> None:
        active = [pc for pc in n["precogs"].values() if not pc["quarantined"]]
        calls = [pc["call"] for pc in active]
        tally = {c: calls.count(c) for c in set(calls)}
        majority = max(tally, key=lambda c: (tally[c], SEVERITY[c]))
        prev = n["verdict"]["call"]
        if tally[majority] >= 2:
            agree = [pc for pc in active if pc["call"] == majority]
            n["verdict"] = {"call": majority, "agreement": f"{tally[majority]}/{len(active)}",
                            "confidence": round(sum(pc["confidence"] for pc in agree) / len(agree), 2), "split": False}
            for pc in active:
                if pc["call"] == majority:
                    pc["dissent_streak"], pc["reported_call"] = 0, None
                    continue
                pc["dissent_streak"] += 1
                # One report per dissent episode (and per change of call within it).
                # One-tick disagreements (e.g. LEXIS's persistence lag) are noise, not a report.
                if pc["dissent_streak"] >= REPORT_STREAK and pc["reported_call"] != pc["call"]:
                    pc["reported_call"] = pc["call"]
                    self._file_minority_report(n, pc, majority)
        else:
            n["verdict"] = {"call": prev, "agreement": "SPLIT", "confidence": 0.0, "split": True}
            if self.tick % 4 == 0:
                self._event(n["station"], "SPLIT", f"Ensemble split ({', '.join(calls)}) — holding {prev}, no autonomous action")

        new = n["verdict"]["call"]
        if new != prev:
            if SEVERITY[new] > 0:
                self._start_consensus(n, new)
            elif SEVERITY[prev] > 0:
                n["suspect"] = None
                self._send_to_hub(n, "ALERT", f"ALL CLEAR — {prev} ended at {n['station']}")

    def _file_minority_report(self, n: dict, pc: dict, majority: str) -> None:
        self.minority_reports.appendleft({
            "id": f"MR-{next(self._ids)}", "station": n["station"], "precog": pc["id"],
            "minority_call": pc["call"], "majority_call": majority, "confidence": pc["confidence"],
            "reason": pc["reason"], "tick": self.tick, "time": self.sim_time().isoformat(),
            "status": "OPEN", "corrupted": pc["corrupted"],
        })

    def _score_minority_reports(self, n: dict) -> None:
        for r in self.minority_reports:
            if r["station"] != n["station"] or r["status"] != "OPEN":
                continue
            window = [c for (t, c) in n["truth_history"] if t >= r["tick"]]
            if r["minority_call"] in window:
                r["status"], r["outcome"] = "VINDICATED", f"{r['minority_call']} verified at {n['station']}"
                self.counters["vindicated"] += 1
            elif self.tick - r["tick"] >= EVAL_TICKS:
                r["status"] = "DISMISSED"
                r["outcome"] = f"{r['minority_call']} did not occur within {EVAL_TICKS * SIM_MINUTES_PER_TICK} min"
                self.counters["dismissed"] += 1
                self._maybe_quarantine(n, n["precogs"][r["precog"]])

    def _maybe_quarantine(self, n: dict, pc: dict) -> None:
        """Quarantine a model whose lone dissents keep being proven wrong.

        Dissent alone is not enough — VISTA routinely dissents *correctly* while a
        storm is still inbound. Only dismissed reports count against a model.
        """
        pc["dismissals"].append(self.tick)
        recent = [t for t in pc["dismissals"] if self.tick - t <= QUARANTINE_WINDOW]
        others_ok = sum(not p["quarantined"] for p in n["precogs"].values() if p is not pc) == 2
        if len(recent) >= QUARANTINE_DISMISSALS and not pc["quarantined"] and others_ok:
            pc["quarantined"] = True
            self.counters["quarantines"] += 1
            self._event(n["station"], "QUARANTINE",
                        f"{pc['id']} quarantined: {len(recent)} minority reports proven wrong in "
                        f"{QUARANTINE_WINDOW * SIM_MINUTES_PER_TICK} min — ensemble continues 2-of-2")

    # ── multi-station consensus ─────────────────────────────────────────
    def _peers(self, code: str) -> list[str]:
        out = []
        for (a, b), l in self.links.items():
            if not l["up"] or code not in (a, b):
                continue
            other = b if a == code else a
            if self.nodes[other]["alive"]:
                out.append(other)
        return out

    def _start_consensus(self, n: dict, claim: str) -> None:
        peers = sorted(self._peers(n["station"]),
                       key=lambda c: _distance_deg(n["lat"], n["lon"], self.nodes[c]["lat"], self.nodes[c]["lon"]))[:4]
        event = {"id": f"CV-{next(self._ids)}", "station": n["station"], "claim": claim,
                 "time": self.sim_time().isoformat(), "tick": self.tick, "votes": {}, "reasons": {}}
        if not peers:
            event.update(result="UNVERIFIED", detail="Isolated node — local alert only, no peer can verify")
            self.consensus_log.appendleft(event)
            self._send_to_hub(n, "ALERT", f"UNVERIFIED {claim} at {n['station']} (isolated)")
            return

        origin_field = self._field(n["lat"], n["lon"])
        foggy = origin_field["fog"] > 0.3
        for code in peers:
            self._send(n["station"], code, "HAZARD", f"{claim} detected — requesting verification")
            peer = self.nodes[code]
            if peer["battery_pct"] < 25:
                vote, why = "ABSTAIN", "Low power — radar in standby"
            else:
                # Peer's own radar/satellite view of the originator's location.
                seen_dbz = origin_field["dbz"] + self.rng.gauss(0, 3)
                seen = _classify(seen_dbz, origin_field["gust"],
                                 origin_field["vis"] if foggy else 10,
                                 origin_field["ceiling"] if foggy else 3500,
                                 origin_field["squall"])
                if seen != "CLEAR" and SEVERITY[seen] >= SEVERITY[claim] - 1:
                    vote, why = "AGREE", f"Radar/satellite sees {seen} ({max(0, seen_dbz):.0f} dBZ) over {n['station']}"
                else:
                    vote, why = "DISAGREE", f"Radar/satellite sees {seen} ({max(0, seen_dbz):.0f} dBZ) over {n['station']}"
            event["votes"][code], event["reasons"][code] = vote, why
            self._send(code, n["station"], "VOTE", f"{vote} — {why}")

        agree = sum(v == "AGREE" for v in event["votes"].values())
        disagree = sum(v == "DISAGREE" for v in event["votes"].values())
        if agree >= 2 and agree >= 0.6 * (agree + disagree):
            event["result"] = "CONFIRMED"
            event["detail"] = f"{agree}/{len(peers)} peers confirm — ALERT routed to hub"
            self.counters["confirmed"] += 1
            n["suspect"] = None
            n["alerts_issued"] += 1
            self._send_to_hub(n, "ALERT", f"{claim} CONFIRMED at {n['station']} by {agree} peers")
        else:
            event["result"] = "REJECTED"
            event["detail"] = (f"Peers outvoted ({agree} agree / {disagree} disagree) — "
                               + ("suspected local sensor fault" if disagree > agree else "insufficient corroboration"))
            self.counters["rejected"] += 1
            if disagree > agree:
                n["suspect"] = "Peers' radar contradicts local sensors — maintenance ticket raised"
                self._send_to_hub(n, "MAINT", f"{n['station']} flagged: local {claim} not corroborated by radar")
        self.consensus_log.appendleft(event)

    def _propagation_handoffs(self, n: dict) -> None:
        if n["precogs"]["VISTA"]["quarantined"]:
            return
        for c in self.cells:
            if c["kind"] == "fog" or self._intensity(c) < 38:
                continue
            if _distance_deg(n["lat"], n["lon"], c["lat"], c["lon"]) > c["radius"] * 2.2:
                continue      # only the station currently under/near the cell hands it off
            for code in self._peers(n["station"]):
                peer = self.nodes[code]
                for k in range(1, NOWCAST_TICKS + 2):
                    d = _distance_deg(peer["lat"], peer["lon"], c["lat"] + c["dlat"] * k, c["lon"] + c["dlon"] * k)
                    if d >= c["radius"] * 0.9:
                        continue
                    call = "SQUALL" if c["kind"] == "squall" else "TSRA"
                    key = (n["station"], code, c["id"])
                    if key not in self.propagation:
                        self.propagation[key] = {
                            "source": n["station"], "target": code, "cell": c["id"],
                            "phenomenon": f"{c['kind'].title()} cell {self._intensity(c):.0f} dBZ",
                            "direction": _bearing_to_compass(c["heading"]), "speed_kt": round(c["speed_kt"]),
                            "eta_minutes": k * SIM_MINUTES_PER_TICK, "call": call,
                            "time": self.sim_time().isoformat(), "tick": self.tick,
                        }
                        self._send(n["station"], code, "PROPAGATION",
                                   f"{c['id']} {call} moving {_bearing_to_compass(c['heading'])} "
                                   f"{c['speed_kt']:.0f} kt — ETA {k * SIM_MINUTES_PER_TICK} min")
                    else:
                        self.propagation[key].update(eta_minutes=k * SIM_MINUTES_PER_TICK, tick=self.tick)
                    peer["warnings"] = [w for w in peer["warnings"] if w["cell"] != c["id"]]
                    peer["warnings"].append({"from": n["station"], "cell": c["id"], "call": call,
                                             "eta_ticks": k, "expires": self.tick + 3})
                    break
        for k in [k for k, v in self.propagation.items() if self.tick - v["tick"] > 2]:
            del self.propagation[k]

    # ── routing & messaging ─────────────────────────────────────────────
    def route(self, src: str, dst: str) -> tuple[list[str], int] | None:
        """Dijkstra over live nodes/links, cost = link latency (ms)."""
        if not (self.nodes[src]["alive"] and self.nodes[dst]["alive"]):
            return None
        dist, prev, pq = {src: 0}, {}, [(0, src)]
        while pq:
            d, u = heapq.heappop(pq)
            if u == dst:
                break
            if d > dist.get(u, math.inf):
                continue
            for v in self._peers(u):
                l = self.links.get((u, v)) or self.links[(v, u)]
                nd = d + l["latency_ms"]
                if nd < dist.get(v, math.inf):
                    dist[v], prev[v] = nd, u
                    heapq.heappush(pq, (nd, v))
        if dst not in dist:
            return None
        path = [dst]
        while path[-1] != src:
            path.append(prev[path[-1]])
        return path[::-1], dist[dst]

    def _log_message(self, mtype: str, src: str, dst: str, path: list[str], detail: str, via: str = "MESH") -> None:
        for a, b in zip(path, path[1:]):
            l = self.links.get((a, b)) or self.links.get((b, a))
            if l:
                l["traffic"].append(self.tick)
        self.nodes[src]["msgs_sent"] += 1
        self.nodes[dst]["msgs_recv"] += 1
        (self.heartbeats if mtype == "HEARTBEAT" else self.messages).appendleft({
            "id": next(self._ids), "type": mtype, "source": src, "destination": dst, "path": path,
            "hops": len(path) - 1, "detail": detail, "via": via, "tick": self.tick,
            "time": self.sim_time().isoformat(),
        })

    def _send(self, src: str, dst: str, mtype: str, detail: str) -> bool:
        r = self.route(src, dst)
        if r is None:
            return False
        self._log_message(mtype, src, dst, r[0], detail)
        return True

    def _send_to_hub(self, n: dict, mtype: str, detail: str) -> None:
        if mtype == "ALERT":
            self.counters["alerts"] += 1
        if n["station"] == HUB:
            self._log_message(mtype, HUB, HUB, [HUB], detail, via="LOCAL")
            return
        if not self._send(n["station"], HUB, mtype, detail):
            n["queue"].append({"type": mtype, "detail": detail, "queued_tick": self.tick})
            self._event(n["station"], "STORE_FWD",
                        f"No route to hub — {mtype} queued (store-and-forward, {len(n['queue'])} pending)")

    def _flush_queue(self, n: dict) -> None:
        if not n["queue"]:
            return
        r = self.route(n["station"], HUB)
        if r is None:
            return
        for m in n["queue"]:
            waited = (self.tick - m["queued_tick"]) * SIM_MINUTES_PER_TICK
            self._log_message(m["type"], n["station"], HUB, r[0], f"[delayed {waited} min] {m['detail']}", via="STORE_FWD")
            self.counters["store_forward"] += 1
        self._event(n["station"], "STORE_FWD", f"Route to hub restored — {len(n['queue'])} queued message(s) delivered")
        n["queue"] = []

    def _heartbeat(self, n: dict) -> None:
        peers = self._peers(n["station"])
        if peers:
            s = n["sensors"]
            self._send(n["station"], self.rng.choice(peers), "HEARTBEAT",
                       f"{n['verdict']['call']} {n['verdict']['agreement']} | p {s['pressure_hpa']} | batt {n['battery_pct']}%")

    def _event(self, station: str, kind: str, detail: str) -> None:
        self.events.appendleft({"tick": self.tick, "time": self.sim_time().isoformat(),
                                "station": station, "kind": kind, "detail": detail})

    # ── fault injection & scenarios ─────────────────────────────────────
    def inject_fault(self, kind: str, station: str | None = None, peer: str | None = None,
                     precog: str | None = None, sensor: str | None = None) -> dict:
        n = self.nodes.get(station or "")
        if kind in ("node_down", "node_up", "sensor_fault", "corrupt_precog", "clear") and not n:
            return {"error": f"Unknown station {station}"}
        if kind == "node_down":
            n["alive"] = False
            self._event(station, "NODE_DOWN", f"{station} offline — mesh re-routing around it")
        elif kind == "node_up":
            n["alive"] = True
            self._event(station, "NODE_UP", f"{station} back online")
        elif kind in ("link_down", "link_up"):
            l = self.links.get((station, peer)) or self.links.get((peer, station))
            if not l:
                return {"error": f"No link {station}–{peer}"}
            l["up"] = kind == "link_up"
            self._event(station, kind.upper(), f"Link {station}–{peer} {'restored' if l['up'] else 'cut'}")
        elif kind == "sensor_fault":
            if sensor not in SENSOR_FAULTS:
                return {"error": f"sensor must be one of {sorted(SENSOR_FAULTS)}"}
            n["sensor_faults"].add(sensor)
            self._event(station, "SENSOR_FAULT", SENSOR_FAULTS[sensor])
        elif kind == "corrupt_precog":
            if precog not in PRECOGS:
                return {"error": f"precog must be one of {sorted(PRECOGS)}"}
            n["precogs"][precog]["corrupted"] = True
            self._event(station, "MODEL_CORRUPT", f"{precog} model corrupted (simulated bad OTA / bit-flip)")
        elif kind == "clear":
            n["alive"] = True
            n["sensor_faults"].clear()
            n["suspect"] = None
            for pc in n["precogs"].values():
                pc.update(corrupted=False, quarantined=False, dissent_streak=0, reported_call=None)
                pc["dismissals"].clear()
            for l in self.links.values():
                if station in (l["a"], l["b"]):
                    l["up"] = True
            self._event(station, "CLEARED", f"All faults cleared at {station}; models restored from signed image")
        else:
            return {"error": f"Unknown fault {kind}"}
        return {"ok": True, "kind": kind, "station": station}

    def spawn_storm(self, kind: str = "squall", lat: float | None = None, lon: float | None = None,
                    heading: float | None = None, speed_kt: float | None = None) -> dict:
        kind = kind if kind in ("convective", "squall", "fog") else "squall"
        defaults = {"convective": (270, 16, 54, 0.32), "squall": (125, 28, 58, 0.42), "fog": (90, 3, 0.9, 0.38)}
        h, sp, peak, radius = defaults[kind]
        cell = self._spawn_cell(kind, lat if lat is not None else 26.6, lon if lon is not None else -79.9,
                                heading if heading is not None else h, speed_kt or sp, peak, radius,
                                life=60 if kind != "fog" else 40)
        cell["age"] = int(cell["life"] * 0.3)    # spawn already mature
        self._event("—", "STORM", f"{cell['id']} {kind} spawned at {cell['lat']:.1f}, {cell['lon']:.1f}")
        return self._cell_view(cell)

    def run_scenario(self, name: str) -> dict:
        if name == "reset":
            self.reset()
        elif name == "squall_line":
            for i in range(3):
                self.spawn_storm("squall", lat=27.0 - i * 0.55, lon=-80.2 + i * 0.25, heading=118, speed_kt=30)
        elif name == "rogue_precog":
            self.inject_fault("corrupt_precog", station="MYNN", precog="LEXIS")
        elif name == "sensor_fault":
            self.inject_fault("sensor_fault", station="MYEG", sensor="visibility")
        elif name == "partition":
            south = {"MYIG", "MYMM", "MYRD"}
            for (a, b), l in self.links.items():
                if (a in south) != (b in south):
                    l["up"] = False
            self.spawn_storm("convective", lat=21.0, lon=-73.25, heading=270, speed_kt=18)
            self._event("—", "PARTITION", "Southern stations (Inagua, Mayaguana, Ragged Island) cut off from the mesh")
        else:
            return {"error": f"Unknown scenario {name}"}
        return {"ok": True, "scenario": name}

    # ── views ───────────────────────────────────────────────────────────
    def _cell_view(self, c: dict) -> dict:
        return {"id": c["id"], "kind": c["kind"], "lat": round(c["lat"], 3), "lon": round(c["lon"], 3),
                "radius_deg": c["radius"], "radius_nm": round(c["radius"] * 60),
                "intensity": round(self._intensity(c), 2 if c["kind"] == "fog" else 0),
                "heading": round(c["heading"]), "direction": _bearing_to_compass(c["heading"]),
                "speed_kt": round(c["speed_kt"]),
                "track": [[round(c["lat"] + c["dlat"] * k, 3), round(c["lon"] + c["dlon"] * k, 3)]
                          for k in range(0, NOWCAST_TICKS + 1, 2)]}

    def _node_view(self, n: dict) -> dict:
        r = self.route(n["station"], HUB) if n["alive"] else None
        if not n["alive"]:
            status = "offline"
        elif n["sensor_faults"] or n["suspect"] or any(pc["corrupted"] or pc["quarantined"] for pc in n["precogs"].values()):
            status = "degraded"
        elif n["verdict"]["split"] or (r is None and n["station"] != HUB):
            status = "caution"         # split ensemble, or cut off from the hub
        else:
            status = "healthy"
        return {
            "station": n["station"], "name": n["name"], "lat": n["lat"], "lon": n["lon"],
            "alive": n["alive"], "status": status, "is_hub": n["station"] == HUB,
            "sensors": n["sensors"], "sensor_faults": sorted(n["sensor_faults"]),
            "precogs": [{k: v for k, v in pc.items() if k not in ("lexis_pending", "dismissals", "reported_call")}
                        for pc in n["precogs"].values()],
            "verdict": n["verdict"], "truth": n["truth"], "suspect": n["suspect"],
            "warnings": [{k: w[k] for k in ("from", "call", "eta_ticks")} for w in n["warnings"]],
            "route_to_hub": {"path": r[0], "latency_ms": r[1], "hops": len(r[0]) - 1} if r else None,
            "queue": len(n["queue"]), "battery_pct": n["battery_pct"],
            "msgs_sent": n["msgs_sent"], "msgs_recv": n["msgs_recv"], "alerts_issued": n["alerts_issued"],
            "peers": self._peers(n["station"]) if n["alive"] else [],
        }

    def status(self) -> dict:
        nodes = [self._node_view(n) for n in self.nodes.values()]
        links = [{"a": l["a"], "b": l["b"], "type": l["type"], "distance_nm": l["distance_nm"],
                  "latency_ms": l["latency_ms"], "quality": l["quality"],
                  "up": l["up"] and self.nodes[l["a"]]["alive"] and self.nodes[l["b"]]["alive"],
                  "traffic": sum(1 for t in l["traffic"] if self.tick - t < 10)}
                 for l in self.links.values()]
        alive = [n for n in nodes if n["alive"]]
        return {
            "tick": self.tick, "sim_time": self.sim_time().isoformat(),
            "sim_minutes_per_tick": SIM_MINUTES_PER_TICK, "hub": HUB,
            "nodes": nodes, "links": links,
            "cells": [self._cell_view(c) for c in self.cells],
            "messages": list(self.messages)[:50],
            "heartbeats": list(self.heartbeats)[:15],
            "consensus_events": list(self.consensus_log)[:25],
            "minority_reports": list(self.minority_reports)[:40],
            "propagation_forecasts": sorted(self.propagation.values(), key=lambda p: p["eta_minutes"])[:12],
            "events": list(self.events)[:30],
            "counters": self.counters,
            "total_nodes": len(nodes), "online_nodes": len(alive),
            "healthy_nodes": sum(n["status"] == "healthy" for n in nodes),
            "degraded_nodes": sum(n["status"] in ("degraded", "caution") for n in nodes),
            "hub_reachable": sum(1 for n in alive if n["route_to_hub"]),
            "total_links": len(links), "links_up": sum(l["up"] for l in links),
            "network_health_pct": round(sum(n["status"] == "healthy" for n in nodes) / len(nodes) * 100, 1),
            "precogs": PRECOGS, "sensor_fault_types": SENSOR_FAULTS,
        }


mesh = MeshSimulation()


# ── Module API (used by api/mesh.py) ────────────────────────────────────
def get_mesh_status() -> dict:
    mesh.advance()
    return mesh.status()


def get_node_detail(station_id: str) -> dict | None:
    mesh.advance()
    n = mesh.nodes.get(station_id)
    return mesh._node_view(n) if n else None


def trigger_consensus(station_id: str = HUB) -> dict:
    """Force a multi-station verification of a station's current verdict."""
    mesh.advance()
    n = mesh.nodes.get(station_id)
    if not n or not n["alive"]:
        return {"error": f"Station {station_id} unavailable"}
    claim = n["verdict"]["call"] if n["verdict"]["call"] != "CLEAR" else "SHOWERS"
    mesh._start_consensus(n, claim)
    return mesh.consensus_log[0]
