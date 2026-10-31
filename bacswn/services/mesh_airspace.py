"""BACSWN — Mesh weather → air traffic: hazard areas, conflict prediction, reroutes.

Turns the mesh's storm picture into what air traffic control needs:

* **Hazards** — each convective/squall cell's ≥40 dBZ core (the area aircraft
  avoid) and each fog bank (a low-level hazard, below 10,000 ft). A hazard is
  *confirmed* when a station near it had the hazard confirmed by peer/satellite
  verification recently, *detected* when a nearby station's ensemble calls it,
  and *tracked* otherwise.
* **Conflicts** — every airborne aircraft is dead-reckoned along its track at
  its ground speed for the next 30 minutes, against each hazard moving at its
  real speed and heading. The first predicted entry is reported.
* **Advice** — the smallest heading change (20°, 40°, 60°, either side) that
  keeps the aircraft clear of every hazard over the same horizon.

Note: the mesh's *simulation clock* is compressed (1 s = 5 sim-min), but the
prediction uses physical speeds in real minutes, so the geometry is right for
the picture shown at the moment it is computed.
"""

from __future__ import annotations

import math

HORIZON_MIN = 30
STEP_MIN = 2
CORE_DBZ = 40                  # reflectivity aircraft avoid
FOG_MIN = 0.5                  # fog-bank intensity that makes a low-level hazard
LOW_LEVEL_FT = 10_000
BUFFER_NM = 5                  # lateral buffer around a hazard
CONFIRM_WINDOW_TICKS = 12      # a confirmation counts for the last hour of sim time
TURNS = (20, -20, 40, -40, 60, -60)


def _move(lat: float, lon: float, track_deg: float, nm: float) -> tuple[float, float]:
    r = math.radians(track_deg)
    dlat = nm * math.cos(r) / 60
    dlon = nm * math.sin(r) / 60 / max(0.2, math.cos(math.radians(lat)))
    return lat + dlat, lon + dlon


def _dist_nm(lat1, lon1, lat2, lon2) -> float:
    dx = (lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(lat2 - lat1, dx) * 60


def _bearing(lat1, lon1, lat2, lon2) -> float:
    dx = (lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2))
    return math.degrees(math.atan2(dx, lat2 - lat1)) % 360


def hazards(sim) -> list[dict]:
    out = []
    recent = [e for e in sim.consensus_log
              if e.get("result") == "CONFIRMED" and sim.tick - e.get("tick", -999) <= CONFIRM_WINDOW_TICKS]
    for c in sim.cells:
        inten = sim._intensity(c)
        if c["kind"] == "fog":
            if inten < FOG_MIN:
                continue
            kind, radius_deg, low_level = "IFR", c["radius"] * 0.9, True
        else:
            if inten < CORE_DBZ:
                continue
            # Radius at which the cell's Gaussian profile drops to CORE_DBZ.
            radius_deg = c["radius"] * math.sqrt(math.log(inten / CORE_DBZ))
            kind = "SQUALL" if c["kind"] == "squall" and inten >= 48 else "TSRA"
            low_level = False
        radius_nm = max(4.0, radius_deg * 60)
        near = [n for n in sim.nodes.values()
                if _dist_nm(n["lat"], n["lon"], c["lat"], c["lon"]) <= radius_nm + 25]
        confirmed = [e for e in recent if e["station"] in {n["station"] for n in near}
                     and (e["claim"] == kind or (kind != "IFR" and e["claim"] in ("TSRA", "SQUALL")))]
        detected = [n["station"] for n in near if n["alive"] and n["verdict"]["call"] != "CLEAR"]
        if confirmed:
            status = "confirmed"
            ev = confirmed[0]
            agree = sorted(s for s, v in ev["votes"].items() if v == "AGREE")
            basis = f"Confirmed at {ev['station']} by " + ", ".join("satellite" if s == "SAT" else s for s in agree)
        elif detected:
            status, basis = "detected", "Called by " + ", ".join(detected) + " — not yet verified"
        else:
            status, basis = "tracked", "Tracked by station radar/satellite; no station affected yet"
        out.append({
            "id": c["id"], "kind": kind, "status": status, "basis": basis,
            "lat": round(c["lat"], 3), "lon": round(c["lon"], 3), "radius_nm": round(radius_nm, 1),
            "intensity": round(inten, 2 if kind == "IFR" else 0), "heading": round(c["heading"]),
            "speed_kt": round(c["speed_kt"]), "low_level": low_level,
            "stations": [n["station"] for n in near],
        })
    return out


def _hazard_at(h: dict, minutes: float) -> tuple[float, float]:
    return _move(h["lat"], h["lon"], h["heading"], h["speed_kt"] * minutes / 60)


def _first_entry(lat, lon, track, gs_kt, alt_ft, hz_list) -> tuple[dict, int, tuple] | None:
    for t in range(0, HORIZON_MIN + 1, STEP_MIN):
        alat, alon = _move(lat, lon, track, gs_kt * t / 60)
        for h in hz_list:
            if h["low_level"] and alt_ft >= LOW_LEVEL_FT:
                continue
            hlat, hlon = _hazard_at(h, t)
            if _dist_nm(alat, alon, hlat, hlon) <= h["radius_nm"] + BUFFER_NM:
                return h, t, (round(alat, 3), round(alon, 3))
    return None


def conflicts(flights: list[dict], hz_list: list[dict]) -> list[dict]:
    out = []
    for f in flights:
        lat = f.get("latitude", f.get("lat"))
        lon = f.get("longitude", f.get("lon"))
        vel = f.get("velocity")
        track = f.get("true_track", f.get("track"))
        if lat is None or lon is None or not vel or track is None or f.get("on_ground"):
            continue
        gs_kt = vel * 1.944
        alt_ft = (f.get("baro_altitude") or f.get("altitude") or 0) * 3.281
        hit = _first_entry(lat, lon, track, gs_kt, alt_ft, hz_list)
        if not hit:
            continue
        h, t, entry = hit
        advice = None
        if t == 0:
            # Already inside the hazard plus buffer: the useful advice is the way out.
            away = round(_bearing(h["lat"], h["lon"], lat, lon)) % 360
            advice = {"turn": "exit", "degrees": None, "heading": away,
                      "text": f"Inside the hazard area — exit on heading {away:03d}, away from the core"}
        for d in (() if advice else TURNS):
            new = (track + d) % 360
            if not _first_entry(lat, lon, new, gs_kt, alt_ft, hz_list):
                advice = {"turn": "right" if d > 0 else "left", "degrees": abs(d), "heading": round(new),
                          "text": f"Turn {'right' if d > 0 else 'left'} {abs(d)}° to heading {round(new):03d}"}
                break
        if advice is None:
            advice = {"turn": None, "degrees": None, "heading": None,
                      "text": "No single heading change clears it within 30 min — hold or divert"}
        callsign = (f.get("callsign") or "").strip() or f.get("icao24", "?")
        out.append({
            "icao24": f.get("icao24"), "callsign": callsign, "lat": round(lat, 3), "lon": round(lon, 3),
            "track": round(track), "ground_speed_kt": round(gs_kt), "altitude_ft": round(alt_ft, -2),
            "simulated": bool(f.get("simulated")),
            "hazard_id": h["id"], "hazard": h["kind"], "hazard_status": h["status"],
            "minutes_to_entry": t, "inside": t == 0, "entry_point": list(entry),
            "distance_nm": round(_dist_nm(lat, lon, h["lat"], h["lon"])),
            "bearing": round(_bearing(lat, lon, h["lat"], h["lon"])),
            "severity": "severe" if t <= 10 and h["status"] == "confirmed" else "high" if t <= 15 else "moderate",
            "advice": advice,
        })
    return sorted(out, key=lambda c: (c["minutes_to_entry"], c["callsign"]))


def airspace(sim, flights: list[dict]) -> dict:
    hz = hazards(sim)
    cf = conflicts(flights, hz)
    return {
        "sim_time": sim.sim_time().isoformat(), "tick": sim.tick,
        "horizon_min": HORIZON_MIN, "buffer_nm": BUFFER_NM,
        "hazards": hz, "conflicts": cf,
        "flights_checked": sum(1 for f in flights if not f.get("on_ground")),
        "flights_simulated": sum(1 for f in flights if f.get("simulated")),
        "note": ("Hazards come from the mesh simulation (1 s = 5 sim-min); conflicts use real "
                 "aircraft and storm speeds over the next 30 minutes."),
    }
