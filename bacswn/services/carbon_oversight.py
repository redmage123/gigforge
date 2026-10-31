"""BACSWN — CORSIA oversight register.

Under CORSIA the obligation sits with aircraft operators: each one buys and
cancels eligible emissions units in a registry. The state that administers the
operator verifies its emissions reports and its unit cancellations, then reports
to ICAO. This module is that state-side register:

  * operators attributed to the Bahamas (ICAO designator);
  * verified annual emissions reports → offsetting requirement
    (verified CO2 × the growth factor ICAO publishes for that year);
  * the units each operator claims to have cancelled, and the state's review
    decision on each claim (VERIFIED / REJECTED / REOPENED);
  * automatic findings: shortfalls, missing reports, units claimed twice,
    ineligible units, vintages outside the phase window, and reports lower than
    the emissions BACSWN itself observed in the FIR.

Evidence is append-only (enforced by triggers): a revised emissions report is a
new row that supersedes the old one; a review is a new decision, never an edit.
"""

from __future__ import annotations

import csv
import io
import re
from datetime import date, datetime, timedelta, timezone

from config import CO2_PER_KG_FUEL, FUEL_BURN_RATES
from services.database import get_db

# CORSIA compliance periods. Eligible-unit vintage windows follow ICAO's
# "CORSIA Eligible Emissions Units" document for the pilot and first phase;
# later windows are not yet set (None = no vintage check). Review against the
# current ICAO document before relying on these for real compliance work.
PERIODS: dict[str, dict] = {
    "2021-2023": {"label": "Pilot phase", "years": (2021, 2023), "vintages": (2016, 2020)},
    "2024-2026": {"label": "First phase", "years": (2024, 2026), "vintages": (2021, 2026)},
    "2027-2029": {"label": "Second phase (1)", "years": (2027, 2029), "vintages": None},
    "2030-2032": {"label": "Second phase (2)", "years": (2030, 2032), "vintages": None},
    "2033-2035": {"label": "Second phase (3)", "years": (2033, 2035), "vintages": None},
}

# Reported emissions cover the operator's whole international network, so they
# can never be lower than the slice BACSWN sees inside the FIR. Our estimate is
# category-based, so allow a margin before raising a finding.
OBSERVED_TOLERANCE = 1.10
# A flight unseen for longer than this starts a new FIR segment.
SEGMENT_GAP = timedelta(minutes=10)
# Sightings are taken once a minute; each counts for one interval of FIR time.
OBSERVE_INTERVAL = timedelta(seconds=60)

_DESIGNATOR_RE = re.compile(r"^[A-Z]{3}$")
_CALLSIGN_RE = re.compile(r"^([A-Z]{3})\d[0-9A-Z]*$")
_CATEGORY = {5: "heavy", 6: "heavy", 7: "heavy", 4: "large", 3: "medium", 2: "small", 1: "light", 0: "medium"}
_DECISIONS = {"VERIFIED", "REJECTED", "REOPENED"}
# Which decisions are allowed from each current status.
_TRANSITIONS = {
    "PENDING": {"VERIFIED", "REJECTED"},
    "REOPENED": {"VERIFIED", "REJECTED"},
    "VERIFIED": {"REOPENED"},
    "REJECTED": {"REOPENED"},
}


class OversightError(ValueError):
    """Validation failure; the message is safe to show to the user."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _text(value, field: str, max_len: int, required: bool = False) -> str:
    s = (value or "").strip() if isinstance(value, str) or value is None else str(value).strip()
    if required and not s:
        raise OversightError(f"{field} is required")
    if len(s) > max_len:
        raise OversightError(f"{field} must be at most {max_len} characters")
    return s


def _int(value, field: str, lo: int, hi: int) -> int:
    if isinstance(value, bool) or value is None or value == "":
        raise OversightError(f"{field} is required")
    try:
        n = int(value)
    except (TypeError, ValueError):
        raise OversightError(f"{field} must be a whole number") from None
    if n != float(value) or not lo <= n <= hi:
        raise OversightError(f"{field} must be a whole number from {lo:,} to {hi:,}")
    return n


def _date(value, field: str) -> str:
    try:
        d = date.fromisoformat(str(value))
    except ValueError:
        raise OversightError(f"{field} must be a date (YYYY-MM-DD)") from None
    if d > _now().date():
        raise OversightError(f"{field} cannot be in the future")
    return d.isoformat()


def period_for_year(year: int) -> str | None:
    return next((p for p, v in PERIODS.items() if v["years"][0] <= year <= v["years"][1]), None)


def _period(name: str) -> dict:
    if name not in PERIODS:
        raise OversightError(f"Unknown compliance period {name!r}")
    return PERIODS[name]


def designator_for(callsign: str | None) -> str | None:
    """ICAO airline designator from an ICAO-format callsign (BHS201 → BHS)."""
    m = _CALLSIGN_RE.match((callsign or "").strip().upper())
    return m.group(1) if m else None


# ── writes ──────────────────────────────────────────────────────────────────

async def create_operator(data: dict, user: str) -> dict:
    designator = _text(data.get("icao_designator"), "ICAO designator", 10, required=True).upper()
    if not _DESIGNATOR_RE.match(designator):
        raise OversightError("ICAO designator must be three letters (e.g. BHS)")
    name = _text(data.get("name"), "Operator name", 120, required=True)
    notes = _text(data.get("notes"), "Notes", 1000)
    async with get_db() as db:
        cur = await db.execute("SELECT id FROM carbon_operators WHERE icao_designator = ?", [designator])
        if await cur.fetchone():
            raise OversightError(f"Operator {designator} is already registered", status=409)
        cur = await db.execute(
            "INSERT INTO carbon_operators (icao_designator, name, notes, created_by) VALUES (?, ?, ?, ?)",
            [designator, name, notes, user])
        await db.commit()
        return {"id": cur.lastrowid, "icao_designator": designator, "name": name}


async def _require_operator(db, operator_id: int) -> dict:
    cur = await db.execute("SELECT * FROM carbon_operators WHERE id = ?", [operator_id])
    row = await cur.fetchone()
    if not row:
        raise OversightError("Operator not found", status=404)
    return dict(row)


async def add_emission_report(operator_id: int, data: dict, user: str) -> dict:
    year = _int(data.get("year"), "Year", 2019, _now().year)
    if not period_for_year(year) and year != 2019:
        raise OversightError("Year is outside the CORSIA compliance periods")
    co2 = _int(data.get("verified_co2_t"), "Verified CO₂ (tonnes)", 0, 1_000_000_000)
    try:
        factor = float(data.get("growth_factor"))
    except (TypeError, ValueError):
        raise OversightError("Growth factor is required (a number from 0 to 1)") from None
    if not 0 <= factor <= 1:
        raise OversightError("Growth factor must be a number from 0 to 1")
    verifier = _text(data.get("verifier"), "Verification body", 120)
    reference = _text(data.get("reference"), "Report reference", 120)
    notes = _text(data.get("notes"), "Notes", 1000)
    async with get_db() as db:
        await _require_operator(db, operator_id)
        cur = await db.execute(
            "SELECT COUNT(*) FROM carbon_emission_reports WHERE operator_id = ? AND year = ?", [operator_id, year])
        revision = (await cur.fetchone())[0] + 1
        cur = await db.execute(
            "INSERT INTO carbon_emission_reports (operator_id, year, verified_co2_t, growth_factor, verifier,"
            " reference, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [operator_id, year, co2, factor, verifier, reference, notes, user])
        await db.commit()
        return {"id": cur.lastrowid, "year": year, "revision": revision,
                "offsetting_requirement_t": round(co2 * factor)}


async def add_unit_claim(operator_id: int, data: dict, user: str) -> dict:
    period = _text(data.get("compliance_period"), "Compliance period", 9, required=True)
    _period(period)
    registry = _text(data.get("registry"), "Registry", 80, required=True)
    block = _text(data.get("serial_block"), "Serial block", 200)
    quantity = _int(data.get("quantity"), "Quantity", 1, 100_000_000)
    start = end = None
    if data.get("serial_start") not in (None, "") or data.get("serial_end") not in (None, ""):
        start = _int(data.get("serial_start"), "Serial start", 0, 10**15)
        end = _int(data.get("serial_end"), "Serial end", 0, 10**15)
        if end < start:
            raise OversightError("Serial end must not be before serial start")
        if end - start + 1 != quantity:
            raise OversightError(f"The serial range holds {end - start + 1:,} units but quantity is {quantity:,}")
    vintage = _int(data.get("vintage"), "Vintage", 2000, _now().year)
    cancelled_on = _date(data.get("cancelled_on"), "Cancellation date")
    row = [operator_id, period, registry, block, start, end, quantity, vintage,
           _text(data.get("project_id"), "Project ID", 80),
           _text(data.get("project_name"), "Project name", 200),
           1 if data.get("declared_eligible", True) else 0,
           cancelled_on,
           _text(data.get("registry_reference"), "Registry cancellation reference", 120),
           _text(data.get("notes"), "Notes", 1000), user]
    async with get_db() as db:
        await _require_operator(db, operator_id)
        cur = await db.execute(
            "INSERT INTO carbon_unit_claims (operator_id, compliance_period, registry, serial_block, serial_start,"
            " serial_end, quantity, vintage, project_id, project_name, declared_eligible, cancelled_on,"
            " registry_reference, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", row)
        await db.commit()
        return {"id": cur.lastrowid, "status": "PENDING"}


async def review_claim(claim_id: int, data: dict, user: str) -> dict:
    decision = _text(data.get("decision"), "Decision", 10, required=True).upper()
    if decision not in _DECISIONS:
        raise OversightError("Decision must be VERIFIED, REJECTED or REOPENED")
    reason = _text(data.get("reason"), "Reason", 1000)
    if decision != "VERIFIED" and len(reason) < 3:
        raise OversightError("A reason is required to reject or reopen a claim")
    async with get_db() as db:
        await db.execute("BEGIN IMMEDIATE")  # status check + insert must not interleave
        try:
            cur = await db.execute("SELECT id FROM carbon_unit_claims WHERE id = ?", [claim_id])
            if not await cur.fetchone():
                raise OversightError("Claim not found", status=404)
            status = await _claim_status(db, claim_id)
            if decision not in _TRANSITIONS[status]:
                raise OversightError(f"A {status.lower()} claim cannot be marked {decision.lower()}", status=409)
            await db.execute(
                "INSERT INTO carbon_claim_reviews (claim_id, decision, reason, created_by) VALUES (?, ?, ?, ?)",
                [claim_id, decision, reason, user])
            await db.commit()
        except BaseException:
            await db.rollback()
            raise
    return {"id": claim_id, "status": decision}


async def _claim_status(db, claim_id: int) -> str:
    cur = await db.execute(
        "SELECT decision FROM carbon_claim_reviews WHERE claim_id = ? ORDER BY id DESC LIMIT 1", [claim_id])
    row = await cur.fetchone()
    return row[0] if row else "PENDING"


# ── BACSWN's own observations (cross-check evidence) ───────────────────────

async def record_observations(flights: list[dict], now: datetime | None = None) -> int:
    """Extend or open an FIR segment for every airline flight in this snapshot."""
    now = now or _now()
    stamp = now.isoformat(timespec="seconds")
    cutoff = (now - SEGMENT_GAP).isoformat(timespec="seconds")
    seen = 0
    async with get_db() as db:
        for f in flights:
            callsign = (f.get("callsign") or "").strip().upper()
            designator = designator_for(callsign)
            icao24 = (f.get("icao24") or "").strip().lower()
            if not designator or not icao24 or f.get("on_ground"):
                continue
            raw = f.get("category", "medium")
            category = _CATEGORY.get(raw, "medium") if isinstance(raw, int) else (raw if raw in FUEL_BURN_RATES else "medium")
            cur = await db.execute(
                "SELECT id FROM carbon_fir_observations WHERE icao24 = ? AND callsign = ? AND last_seen >= ?"
                " ORDER BY id DESC LIMIT 1", [icao24, callsign, cutoff])
            row = await cur.fetchone()
            if row:
                await db.execute("UPDATE carbon_fir_observations SET last_seen = ? WHERE id = ?", [stamp, row[0]])
            else:
                await db.execute(
                    "INSERT INTO carbon_fir_observations (icao24, callsign, designator, category, simulated,"
                    " first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [icao24, callsign, designator, category, 1 if f.get("simulated") else 0, stamp, stamp])
            seen += 1
        await db.commit()
    return seen


async def observed_emissions(year: int) -> dict[str, dict]:
    """Estimated FIR CO2 per designator for a year, split into live vs simulated data."""
    out: dict[str, dict] = {}
    async with get_db() as db:
        cur = await db.execute(
            "SELECT designator, category, simulated, first_seen, last_seen FROM carbon_fir_observations"
            " WHERE first_seen >= ? AND first_seen < ?", [f"{year}-01-01", f"{year + 1}-01-01"])
        for d, cat, sim, first, last in await cur.fetchall():
            hours = ((datetime.fromisoformat(last) - datetime.fromisoformat(first)) + OBSERVE_INTERVAL).total_seconds() / 3600
            co2_t = FUEL_BURN_RATES.get(cat, FUEL_BURN_RATES["medium"]) * hours * CO2_PER_KG_FUEL / 1000
            o = out.setdefault(d, {"live_co2_t": 0.0, "simulated_co2_t": 0.0, "live_segments": 0, "simulated_segments": 0})
            key = "simulated" if sim else "live"
            o[f"{key}_co2_t"] += co2_t
            o[f"{key}_segments"] += 1
    for o in out.values():
        o["live_co2_t"] = round(o["live_co2_t"], 1)
        o["simulated_co2_t"] = round(o["simulated_co2_t"], 1)
    return out


# ── reads ───────────────────────────────────────────────────────────────────

async def _load(db, period: str) -> tuple[list[dict], list[dict], list[dict]]:
    p = _period(period)
    y0, y1 = p["years"]
    ops = [dict(r) for r in await (await db.execute("SELECT * FROM carbon_operators ORDER BY icao_designator")).fetchall()]
    # Latest revision per operator/year wins.
    reports = [dict(r) for r in await (await db.execute(
        "SELECT r.*, (SELECT COUNT(*) FROM carbon_emission_reports x WHERE x.operator_id = r.operator_id"
        " AND x.year = r.year AND x.id <= r.id) AS revision FROM carbon_emission_reports r"
        " WHERE r.year BETWEEN ? AND ? ORDER BY r.operator_id, r.year, r.id", [y0, y1])).fetchall()]
    claims = [dict(r) for r in await (await db.execute(
        "SELECT c.*, o.icao_designator, COALESCE((SELECT decision FROM carbon_claim_reviews v WHERE v.claim_id = c.id"
        " ORDER BY v.id DESC LIMIT 1), 'PENDING') AS status FROM carbon_unit_claims c"
        " JOIN carbon_operators o ON o.id = c.operator_id ORDER BY c.id")).fetchall()]
    return ops, reports, claims


def _overlaps(a: dict, b: dict) -> bool:
    if a["registry"].strip().lower() != b["registry"].strip().lower():
        return False
    if a["serial_start"] is not None and b["serial_start"] is not None:
        return (a["serial_block"].strip().lower() == b["serial_block"].strip().lower()
                and a["serial_start"] <= b["serial_end"] and b["serial_start"] <= a["serial_end"])
    # Without numeric ranges, fall back to an identical non-empty serial block.
    return bool(a["serial_block"].strip()) and a["serial_block"].strip().lower() == b["serial_block"].strip().lower()


async def register(period: str) -> dict:
    """Per-operator position for a compliance period, plus findings."""
    p = _period(period)
    y0, y1 = p["years"]
    this_year = _now().year
    async with get_db() as db:
        ops, reports, all_claims = await _load(db, period)

    latest: dict[tuple[int, int], dict] = {}
    for r in reports:
        latest[(r["operator_id"], r["year"])] = r
    claims = [c for c in all_claims if c["compliance_period"] == period]
    # Units claimed twice can span periods, so compare against every live claim.
    live = [c for c in all_claims if c["status"] != "REJECTED"]

    observed = {y: await observed_emissions(y) for y in range(y0, min(y1, this_year) + 1)}
    findings: list[dict] = []

    def finding(severity, kind, op, message, claim_id=None):
        findings.append({"severity": severity, "kind": kind, "operator": op["icao_designator"],
                         "operator_id": op["id"], "claim_id": claim_id, "message": message})

    rows = []
    for op in ops:
        years = []
        requirement = 0
        for y in range(y0, y1 + 1):
            r = latest.get((op["id"], y))
            obs = observed.get(y, {}).get(op["icao_designator"], {})
            req = round(r["verified_co2_t"] * r["growth_factor"]) if r else None
            requirement += req or 0
            years.append({"year": y, "report": r and {k: r[k] for k in (
                "id", "verified_co2_t", "growth_factor", "verifier", "reference", "revision", "created_by", "created_at")},
                "offsetting_requirement_t": req,
                "observed_live_co2_t": obs.get("live_co2_t"), "observed_simulated_co2_t": obs.get("simulated_co2_t")})
            if not r and y < this_year:
                finding("medium", "MISSING_REPORT", op, f"No verified emissions report for {y}")
            if r and obs.get("live_co2_t") and obs["live_co2_t"] > r["verified_co2_t"] * OBSERVED_TOLERANCE:
                finding("high", "BELOW_OBSERVED", op,
                        f"{y} report ({r['verified_co2_t']:,} t CO₂) is lower than the {obs['live_co2_t']:,.0f} t "
                        "BACSWN observed inside the Bahamas FIR alone")

        mine = [c for c in claims if c["operator_id"] == op["id"]]
        units = {s: sum(c["quantity"] for c in mine if c["status"] == s) for s in ("VERIFIED", "PENDING", "REOPENED", "REJECTED")}
        pending = units["PENDING"] + units["REOPENED"]
        shortfall = max(0, requirement - units["VERIFIED"])
        reported_years = sum(1 for y in years if y["report"])
        period_closed = y1 < this_year
        if reported_years == 0:
            status = "NO_REPORTS"
        elif shortfall == 0:
            status = "COVERED"
        elif shortfall <= pending:
            status = "AWAITING_REVIEW"
        else:
            status = "SHORTFALL"
        if period_closed and shortfall > 0:
            finding("high", "SHORTFALL", op,
                    f"Period closed with {shortfall:,} units outstanding ({units['VERIFIED']:,} of {requirement:,} verified)")

        for c in mine:
            if c["status"] == "REJECTED":
                continue
            if not c["declared_eligible"]:
                finding("high", "INELIGIBLE_UNIT", op, f"Claim #{c['id']} uses units not declared CORSIA-eligible", c["id"])
            win = p["vintages"]
            if win and not win[0] <= c["vintage"] <= win[1]:
                finding("medium", "VINTAGE_OUTSIDE_WINDOW", op,
                        f"Claim #{c['id']}: vintage {c['vintage']} is outside the {p['label'].lower()} window "
                        f"({win[0]}–{win[1]})", c["id"])
            for other in live:
                if other["id"] < c["id"] and _overlaps(c, other):
                    who = "the same operator" if other["operator_id"] == op["id"] else other["icao_designator"]
                    finding("high", "DOUBLE_CLAIM", op,
                            f"Claim #{c['id']} overlaps units already claimed in #{other['id']} by {who}", c["id"])

        rows.append({"id": op["id"], "icao_designator": op["icao_designator"], "name": op["name"],
                     "years": years, "reported_years": reported_years,
                     "offsetting_requirement_t": requirement, "verified_units": units["VERIFIED"],
                     "pending_units": pending, "rejected_units": units["REJECTED"],
                     "shortfall_units": shortfall, "status": status})

    order = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: (order[f["severity"]], f["operator"], f["claim_id"] or 0))
    totals = {k: sum(r[k] for r in rows) for k in
              ("offsetting_requirement_t", "verified_units", "pending_units", "shortfall_units")}
    return {"period": period, **{k: p[k] for k in ("label", "years", "vintages")},
            "period_closed": y1 < this_year, "operators": rows, "totals": totals,
            "findings": findings, "claims": [_claim_view(c) for c in claims]}


def _claim_view(c: dict) -> dict:
    keys = ("id", "operator_id", "icao_designator", "compliance_period", "registry", "serial_block", "serial_start",
            "serial_end", "quantity", "vintage", "project_id", "project_name", "declared_eligible", "cancelled_on",
            "registry_reference", "notes", "status", "created_by", "created_at")
    v = {k: c[k] for k in keys}
    v["declared_eligible"] = bool(v["declared_eligible"])
    return v


async def operator_detail(operator_id: int) -> dict:
    async with get_db() as db:
        op = await _require_operator(db, operator_id)
        reports = [dict(r) for r in await (await db.execute(
            "SELECT * FROM carbon_emission_reports WHERE operator_id = ? ORDER BY year, id", [operator_id])).fetchall()]
        claims = [dict(r) for r in await (await db.execute(
            "SELECT c.*, ? AS icao_designator, COALESCE((SELECT decision FROM carbon_claim_reviews v"
            " WHERE v.claim_id = c.id ORDER BY v.id DESC LIMIT 1), 'PENDING') AS status"
            " FROM carbon_unit_claims c WHERE c.operator_id = ? ORDER BY c.id", [op["icao_designator"], operator_id])).fetchall()]
        reviews = [dict(r) for r in await (await db.execute(
            "SELECT v.* FROM carbon_claim_reviews v JOIN carbon_unit_claims c ON c.id = v.claim_id"
            " WHERE c.operator_id = ? ORDER BY v.id", [operator_id])).fetchall()]
    seen: dict[int, int] = {}
    for r in reports:
        seen[r["year"]] = seen.get(r["year"], 0) + 1
        r["revision"] = seen[r["year"]]
    latest_ids = {max(r["id"] for r in reports if r["year"] == y) for y in seen}
    for r in reports:
        r["superseded"] = r["id"] not in latest_ids
    by_claim: dict[int, list] = {}
    for v in reviews:
        by_claim.setdefault(v["claim_id"], []).append(
            {k: v[k] for k in ("decision", "reason", "created_by", "created_at")})
    return {"operator": op, "reports": reports,
            "claims": [{**_claim_view(c), "reviews": by_claim.get(c["id"], [])} for c in claims]}


def _csv_safe(v) -> str:
    """Neutralise spreadsheet formula injection in exported text."""
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


async def export_csv(period: str) -> str:
    reg = await register(period)
    flagged: dict[int, list[str]] = {}
    for f in reg["findings"]:
        if f["claim_id"]:
            flagged.setdefault(f["claim_id"], []).append(f["kind"])
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["claim_id", "operator", "compliance_period", "registry", "serial_block", "serial_start", "serial_end",
                "quantity", "vintage", "project_id", "project_name", "declared_eligible", "cancelled_on",
                "registry_reference", "status", "findings", "recorded_by", "recorded_at"])
    for c in reg["claims"]:
        w.writerow([_csv_safe(x) for x in (
            c["id"], c["icao_designator"], c["compliance_period"], c["registry"], c["serial_block"], c["serial_start"],
            c["serial_end"], c["quantity"], c["vintage"], c["project_id"], c["project_name"],
            "yes" if c["declared_eligible"] else "no", c["cancelled_on"], c["registry_reference"], c["status"],
            " ".join(flagged.get(c["id"], [])), c["created_by"], c["created_at"])])
    return buf.getvalue()


def periods() -> list[dict]:
    this_year = _now().year
    return [{"id": k, "label": v["label"], "years": v["years"], "vintages": v["vintages"],
             "current": v["years"][0] <= this_year <= v["years"][1]} for k, v in PERIODS.items()]
