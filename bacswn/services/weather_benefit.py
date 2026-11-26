"""BACSWN — fuel and CO2 saved by early weather warnings (the weather-benefit ledger).

When the mesh predicts that an aircraft will fly into a storm core or fog bank
(services/mesh_airspace.py), the warning arrives minutes before the crew could
see the cell on the aircraft's own weather radar. An early, gentle deviation
needs less extra track than a late, sharp one. This module estimates that
difference for each predicted conflict and keeps a ledger of it.

Method (deliberately conservative and transparent):

* The aircraft must move sideways by ``offset`` nm to keep the hazard plus its
  buffer clear: hazard radius + buffer − the miss distance of its present track.
* A deviation that reaches that offset over a forward distance ``a`` and then
  returns symmetrically adds ``2·(√(a² + offset²) − a)`` nm of track (a dogleg).
* **With BACSWN** the deviation can start as soon as the warning arrives: ``a``
  is the distance to the hazard, capped at ``MAX_LEAD_NM``.
* **Without it** the crew starts deviating when the cell is ``BASELINE_DECISION_NM``
  ahead on the onboard radar (or immediately, if it is already closer).
* Saved track ÷ ground speed × the category fuel-burn rate → fuel; × 3.16 → CO2.

Only lateral reroutes are credited. Warnings where no single heading change
clears the hazard ("hold or divert") and aircraft already inside a hazard are
logged but earn no credit, although avoided holding and diversions are where
the largest real savings are. Each flight/hazard pair is counted once, at the
first (earliest) warning.

Why: the fuel and CO2 an operator never burns because of an early warning is a
climate benefit of the network that should be shown with its working, not
asserted.

How: ``record`` is called with each airspace picture; it assesses every
conflict, writes one row per flight/hazard pair to ``wx_benefit_events`` (INSERT
OR IGNORE on the run/flight/hazard key) and marks the minute as monitored in
``wx_benefit_coverage``. ``summary`` and ``export_csv`` read the ledger back.
"""

from __future__ import annotations

import csv
import io
import math
import time
from datetime import datetime, timedelta, timezone

from config import CO2_PER_KG_FUEL, FUEL_BURN_RATES
from services.carbon_oversight import csv_safe
from services.database import get_db
from services.emissions_calculator import fuel_burn_category

BASELINE_DECISION_NM = 25.0     # assumption: tactical deviation range without ground-based warning
MAX_LEAD_NM = 80.0              # never credit an earlier start than this
MIN_OFFSET_NM = 1.0

# One run of the mesh simulation: hazard ids restart when the server restarts.
RUN_ID = time.strftime("%Y%m%dT%H%M%S")

ASSUMPTIONS = {
    "baseline_decision_nm": BASELINE_DECISION_NM,
    "max_lead_nm": MAX_LEAD_NM,
    "fuel_burn_kg_per_hr": FUEL_BURN_RATES,
    "co2_per_kg_fuel": CO2_PER_KG_FUEL,
    "credited": "Lateral reroutes only; hold/divert warnings and aircraft already inside a hazard earn no credit",
}


def _category(flight: dict | None) -> str:
    """Fuel-burn class of the flight in the conflict ("medium" when the flight is unknown)."""
    return fuel_burn_category((flight or {}).get("category", "medium"))


def _window(days, now: datetime | None) -> tuple[int, str]:
    """Clamp a look-back window to 1–366 days; return it with its ISO start timestamp."""
    days = max(1, min(int(days), 366))
    now = now or datetime.now(timezone.utc)
    return days, (now - timedelta(days=days)).isoformat(timespec="seconds")


def dogleg_extra_nm(lead_nm: float, offset_nm: float) -> float:
    """Extra track for an offset reached over ``lead_nm`` and returned symmetrically."""
    if lead_nm <= 0:
        return 2 * offset_nm
    return 2 * (math.hypot(lead_nm, offset_nm) - lead_nm)


def required_offset_nm(conflict: dict, hazard: dict) -> float:
    """How far sideways the aircraft must move to keep the hazard plus buffer clear."""
    from services.mesh_airspace import BUFFER_NM, _hazard_at
    hlat, hlon = _hazard_at(hazard, conflict["minutes_to_entry"])
    lat, lon = conflict["lat"], conflict["lon"]
    dy = (hlat - lat) * 60
    dx = (hlon - lon) * 60 * math.cos(math.radians((lat + hlat) / 2))
    t = math.radians(conflict["track"])
    miss = abs(dx * math.cos(t) - dy * math.sin(t))          # cross-track distance of the hazard centre
    return max(MIN_OFFSET_NM, hazard["radius_nm"] + BUFFER_NM - miss)


def assess(conflict: dict, hazard: dict, flight: dict | None) -> dict:
    """Ledger entry for one predicted conflict."""
    category = _category(flight)
    gs = max(conflict["ground_speed_kt"], 1)
    lead_nm = gs * conflict["minutes_to_entry"] / 60
    advice = conflict.get("advice") or {}
    entry = {
        "icao24": conflict.get("icao24") or "", "callsign": conflict.get("callsign") or "",
        "category": category, "simulated": bool(conflict.get("simulated")),
        "hazard_id": conflict["hazard_id"], "hazard_kind": conflict["hazard"],
        "hazard_status": conflict["hazard_status"], "lead_min": conflict["minutes_to_entry"],
        "lead_nm": round(lead_nm, 1), "ground_speed_kt": round(gs), "advice": advice.get("text", ""),
        "offset_nm": 0.0, "early_extra_nm": 0.0, "baseline_extra_nm": 0.0, "saved_nm": 0.0,
        "saved_fuel_kg": 0.0, "saved_co2_kg": 0.0, "credited": False,
    }
    if conflict.get("inside") or advice.get("turn") not in ("left", "right"):
        entry["reason"] = "inside the hazard" if conflict.get("inside") else "hold or divert: no reroute credited"
        return entry
    offset = required_offset_nm(conflict, hazard)
    early = dogleg_extra_nm(min(lead_nm, MAX_LEAD_NM), offset)
    late = dogleg_extra_nm(min(lead_nm, BASELINE_DECISION_NM), offset)
    saved = max(0.0, late - early)
    fuel = saved / gs * FUEL_BURN_RATES[category]
    entry.update(offset_nm=round(offset, 1), early_extra_nm=round(early, 2), baseline_extra_nm=round(late, 2),
                 saved_nm=round(saved, 2), saved_fuel_kg=round(fuel, 1),
                 saved_co2_kg=round(fuel * CO2_PER_KG_FUEL, 1), credited=saved > 0,
                 reason="reroute" if saved > 0 else "warning came too late to gain on the onboard radar")
    return entry


async def record(result: dict, flights: list[dict], now: datetime | None = None) -> int:
    """Add the conflicts in one airspace picture to the ledger; returns new entries."""
    now = now or datetime.now(timezone.utc)
    stamp = now.isoformat(timespec="seconds")
    hazards = {h["id"]: h for h in result.get("hazards", [])}
    by_icao = {f.get("icao24"): f for f in flights}
    added = 0
    async with get_db() as db:
        await db.execute("INSERT OR IGNORE INTO wx_benefit_coverage (minute) VALUES (?)", [stamp[:16]])
        for c in result.get("conflicts", []):
            h = hazards.get(c["hazard_id"])
            if not h or not c.get("icao24"):
                continue
            e = assess(c, h, by_icao.get(c["icao24"]))
            cur = await db.execute(
                "INSERT OR IGNORE INTO wx_benefit_events (run_id, recorded_at, icao24, callsign, category, simulated,"
                " hazard_id, hazard_kind, hazard_status, lead_min, lead_nm, ground_speed_kt, advice, offset_nm,"
                " early_extra_nm, baseline_extra_nm, saved_nm, saved_fuel_kg, saved_co2_kg, credited, reason)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [RUN_ID, stamp, e["icao24"], e["callsign"], e["category"], int(e["simulated"]), e["hazard_id"],
                 e["hazard_kind"], e["hazard_status"], e["lead_min"], e["lead_nm"], e["ground_speed_kt"],
                 e["advice"], e["offset_nm"], e["early_extra_nm"], e["baseline_extra_nm"], e["saved_nm"],
                 e["saved_fuel_kg"], e["saved_co2_kg"], int(e["credited"]), e["reason"]])
            added += cur.rowcount
        await db.commit()
    return added


async def summary(days: int = 30, now: datetime | None = None) -> dict:
    """Totals, daily series and recent entries of the ledger for the last ``days`` days (1–366).

    The annualised figure is extrapolated from the minutes actually monitored and
    is only given once at least an hour of monitoring is on record.
    """
    days, since = _window(days, now)
    async with get_db() as db:
        rows = [dict(r) for r in await (await db.execute(
            "SELECT * FROM wx_benefit_events WHERE recorded_at >= ? ORDER BY recorded_at DESC", [since])).fetchall()]
        monitored_min = (await (await db.execute(
            "SELECT COUNT(*) FROM wx_benefit_coverage WHERE minute >= ?", [since[:16]])).fetchone())[0]

    credited = [r for r in rows if r["credited"]]

    def tot(rs, k):
        """Sum field ``k`` over rows ``rs``, rounded to 0.1."""
        return round(sum(r[k] for r in rs), 1)

    daily: dict[str, dict] = {}
    for r in credited:
        d = daily.setdefault(r["recorded_at"][:10], {"date": r["recorded_at"][:10], "reroutes": 0,
                                                     "saved_fuel_kg": 0.0, "saved_co2_kg": 0.0})
        d["reroutes"] += 1
        d["saved_fuel_kg"] = round(d["saved_fuel_kg"] + r["saved_fuel_kg"], 1)
        d["saved_co2_kg"] = round(d["saved_co2_kg"] + r["saved_co2_kg"], 1)
    by_status = {s: {"reroutes": sum(1 for r in credited if r["hazard_status"] == s),
                     "saved_co2_kg": tot([r for r in credited if r["hazard_status"] == s], "saved_co2_kg")}
                 for s in ("confirmed", "detected", "tracked")}
    co2 = tot(credited, "saved_co2_kg")
    hours = monitored_min / 60
    return {
        "days": days, "monitored_hours": round(hours, 1),
        "warnings": len(rows), "reroutes": len(credited),
        "hold_or_divert": sum(1 for r in rows if r["reason"].startswith("hold")),
        "saved_nm": tot(credited, "saved_nm"), "saved_fuel_kg": tot(credited, "saved_fuel_kg"),
        "saved_co2_kg": co2,
        "live_flight_co2_kg": tot([r for r in credited if not r["simulated"]], "saved_co2_kg"),
        "simulated_flight_co2_kg": tot([r for r in credited if r["simulated"]], "saved_co2_kg"),
        # Extrapolation only once there is at least an hour of monitoring behind it.
        "annualised_co2_t": round(co2 / hours * 8760 / 1000, 1) if hours >= 1 else None,
        "by_status": by_status, "daily": sorted(daily.values(), key=lambda d: d["date"]),
        "recent": rows[:25], "assumptions": ASSUMPTIONS,
        "note": ("Estimate, not a measurement. In this demo the storms are simulated by the mesh; flights are live "
                 "when the OpenSky feed is available and simulated otherwise."),
    }


CSV_COLUMNS = ("recorded_at", "callsign", "icao24", "category", "simulated", "hazard_id", "hazard_kind",
               "hazard_status", "lead_min", "lead_nm", "ground_speed_kt", "advice", "offset_nm", "early_extra_nm",
               "baseline_extra_nm", "saved_nm", "saved_fuel_kg", "saved_co2_kg", "credited", "reason")


async def export_csv(days: int = 30, now: datetime | None = None) -> str:
    """The ledger entries of the last ``days`` days (1–366) as CSV, oldest first, formula-safe."""
    _, since = _window(days, now)
    async with get_db() as db:
        rows = await (await db.execute(
            f"SELECT {', '.join(CSV_COLUMNS)} FROM wx_benefit_events WHERE recorded_at >= ? ORDER BY recorded_at",
            [since])).fetchall()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(CSV_COLUMNS)
    for r in rows:
        w.writerow([csv_safe(v) for v in r])
    return buf.getvalue()
