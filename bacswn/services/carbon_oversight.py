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
    ineligible units, vintages outside the phase window, reports lower than
    the emissions BACSWN itself observed in the FIR, and — for units from the
    Bahamas National Emissions Registry — claims its statements do not support
    (services/ner_registry.py).

Evidence is append-only (enforced by triggers): a revised emissions report is a
new row that supersedes the old one; a review is a new decision, never an edit.

Why: the state is answerable to ICAO for the operators it administers, so it
needs its own record of what each operator reported and claimed, what it
verified, and what does not add up, independent of the operators' paperwork.

How: writes validate their input (raising ``OversightError`` with a user-safe
message) and insert rows into the ``carbon_*`` tables; ``register`` loads one
compliance period, computes each operator's requirement, eligible-fuel
reductions and shortfall, and runs the finding checks in memory. The API layer
(api/carbon_oversight.py) is a thin wrapper over these functions.
"""

from __future__ import annotations

import csv
import io
import math
import re
from datetime import date, datetime, timedelta, timezone

from config import CO2_PER_KG_FUEL, FUEL_BURN_RATES
from services import ner_registry
from services.database import get_db
from services.emissions_calculator import fuel_burn_category
from services.errors import BacswnNotFoundError, BacswnValidationError

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

# CORSIA eligible fuels (Annex 16 Vol IV): the emissions reduction claimed is
#   ER = FCF × Σ MS × (1 − LS_f / LS_0)
# with FCF the fuel conversion factor (3.16 t CO2 per t of jet fuel), MS the mass
# of eligible fuel (t), LS_f its life-cycle emissions value and LS_0 the fossil
# jet-fuel baseline (89 gCO2e/MJ). To be eligible a fuel must cut life-cycle
# emissions by at least 10 % (LS_f ≤ 80.1) and be certified by an ICAO-approved
# Sustainability Certification Scheme. Check the scheme list and baseline against
# ICAO's current CORSIA documents before relying on them for real compliance work.
FCF_JET = CO2_PER_KG_FUEL
LS_BASELINE = 89.0
LS_MAX_ELIGIBLE = 80.1
RECOGNISED_SCHEMES = ("ISCC", "RSB")
FUEL_TYPES = {"SAF", "LCAF"}

_DESIGNATOR_RE = re.compile(r"^[A-Z]{3}$")
_CALLSIGN_RE = re.compile(r"^([A-Z]{3})\d[0-9A-Z]*$")
_DECISIONS = {"VERIFIED", "REJECTED", "REOPENED"}
# Which decisions are allowed from each current status.
_TRANSITIONS = {
    "PENDING": {"VERIFIED", "REJECTED"},
    "REOPENED": {"VERIFIED", "REJECTED"},
    "VERIFIED": {"REOPENED"},
    "REJECTED": {"REOPENED"},
}


class OversightError(BacswnValidationError):
    """An oversight-register request was refused; the message is safe to show to the user.

    HTTP 400 by default; a conflict with the register's current state (duplicate
    operator, disallowed status change) passes ``status=409``.
    """


class OversightNotFoundError(OversightError, BacswnNotFoundError):
    """A record the request refers to (operator, claim) does not exist (HTTP 404).

    Subclasses ``OversightError`` so existing ``except OversightError`` handling
    still catches it.
    """

    status = 404


def _now() -> datetime:
    """Current time in UTC (one place to patch in tests)."""
    return datetime.now(timezone.utc)


def _text(value, field: str, max_len: int, required: bool = False) -> str:
    """Stripped text field, checked for presence (if ``required``) and length.

    Raises:
        OversightError: missing when required, or longer than ``max_len``.
    """
    s = (value or "").strip() if isinstance(value, str) or value is None else str(value).strip()
    if required and not s:
        raise OversightError(f"{field} is required")
    if len(s) > max_len:
        raise OversightError(f"{field} must be at most {max_len} characters")
    return s


def _int(value, field: str, lo: int, hi: int) -> int:
    """Required whole number in ``lo``..``hi``; booleans and fractional values are refused.

    Raises:
        OversightError: missing, not a whole number, or out of range.
    """
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
    """ISO date (YYYY-MM-DD) that is not in the future.

    Raises:
        OversightError: not a valid date, or later than today (UTC).
    """
    try:
        d = date.fromisoformat(str(value))
    except ValueError:
        raise OversightError(f"{field} must be a date (YYYY-MM-DD)") from None
    if d > _now().date():
        raise OversightError(f"{field} cannot be in the future")
    return d.isoformat()


def period_for_year(year: int) -> str | None:
    """Id of the compliance period containing ``year`` (e.g. "2024-2026"), or None."""
    return next((p for p, v in PERIODS.items() if v["years"][0] <= year <= v["years"][1]), None)


def _period(name: str) -> dict:
    """Definition of a compliance period by id.

    Raises:
        OversightError: the id is not one of ``PERIODS``.
    """
    if name not in PERIODS:
        raise OversightError(f"Unknown compliance period {name!r}")
    return PERIODS[name]


def designator_for(callsign: str | None) -> str | None:
    """ICAO airline designator from an ICAO-format callsign (BHS201 → BHS)."""
    m = _CALLSIGN_RE.match((callsign or "").strip().upper())
    return m.group(1) if m else None


# ── writes ──────────────────────────────────────────────────────────────────

async def create_operator(data: dict, user: str) -> dict:
    """Register an aircraft operator attributed to the Bahamas.

    Raises:
        OversightError: invalid designator or name, or (409) the designator is already registered.
    """
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
    """The operator row on an open connection.

    Raises:
        OversightNotFoundError: no operator has that id.
    """
    cur = await db.execute("SELECT * FROM carbon_operators WHERE id = ?", [operator_id])
    row = await cur.fetchone()
    if not row:
        raise OversightNotFoundError("Operator not found")
    return dict(row)


async def get_operator(operator_id: int) -> dict:
    """The operator row by id.

    Raises:
        OversightNotFoundError: no operator has that id.
    """
    async with get_db() as db:
        return await _require_operator(db, operator_id)


async def add_emission_report(operator_id: int, data: dict, user: str) -> dict:
    """Record a verified annual emissions report (a later report for the same year supersedes it).

    Returns the new row id, its revision number for that year, and the offsetting
    requirement it implies (verified CO2 x growth factor, rounded to whole tonnes).

    Raises:
        OversightError: invalid fields; OversightNotFoundError if the operator does not exist.
    """
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
    """Record an operator's claim to have cancelled emissions units; it starts PENDING review.

    A numeric serial range, if given, must hold exactly ``quantity`` units.

    Raises:
        OversightError: invalid fields; OversightNotFoundError if the operator does not exist.
    """
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


async def _review(claims_table: str, reviews_table: str, claim_id: int, data: dict, user: str) -> dict:
    """Append a review decision to a unit or fuel claim, enforcing the allowed status transitions.

    The existence check, current-status check and insert run in one immediate
    transaction so two reviewers cannot both move a claim from the same status.

    Raises:
        OversightError: invalid decision or missing reason; (409) the transition is
            not allowed from the claim's current status.
        OversightNotFoundError: no claim has that id.
    """
    decision = _text(data.get("decision"), "Decision", 10, required=True).upper()
    if decision not in _DECISIONS:
        raise OversightError("Decision must be VERIFIED, REJECTED or REOPENED")
    reason = _text(data.get("reason"), "Reason", 1000)
    # The AI review brief the reviewer worked from, if any (kept with the decision).
    ai_brief = _text(data.get("ai_brief"), "AI brief", 4000)
    if decision != "VERIFIED" and len(reason) < 3:
        raise OversightError("A reason is required to reject or reopen a claim")
    async with get_db() as db:
        await db.execute("BEGIN IMMEDIATE")  # status check + insert must not interleave
        try:
            cur = await db.execute(f"SELECT id FROM {claims_table} WHERE id = ?", [claim_id])
            if not await cur.fetchone():
                raise OversightNotFoundError("Claim not found")
            status = await _claim_status(db, claim_id, reviews_table)
            if decision not in _TRANSITIONS[status]:
                raise OversightError(f"A {status.lower()} claim cannot be marked {decision.lower()}", status=409)
            await db.execute(
                f"INSERT INTO {reviews_table} (claim_id, decision, reason, created_by, ai_brief) VALUES (?, ?, ?, ?, ?)",
                [claim_id, decision, reason, user, ai_brief])
            await db.commit()
        except BaseException:
            await db.rollback()
            raise
    return {"id": claim_id, "status": decision}


async def review_claim(claim_id: int, data: dict, user: str) -> dict:
    """Record a decision (VERIFIED / REJECTED / REOPENED) on a unit-cancellation claim. See ``_review``."""
    return await _review("carbon_unit_claims", "carbon_claim_reviews", claim_id, data, user)


async def review_fuel_claim(claim_id: int, data: dict, user: str) -> dict:
    """Record a decision (VERIFIED / REJECTED / REOPENED) on an eligible-fuel claim. See ``_review``."""
    return await _review("carbon_fuel_claims", "carbon_fuel_reviews", claim_id, data, user)


def _float(value, field: str, lo: float, hi: float, hi_inclusive: bool = True) -> float:
    """Required finite number from ``lo`` up to ``hi`` (inclusive unless ``hi_inclusive`` is False).

    Raises:
        OversightError: missing, not a number, or out of range.
    """
    if isinstance(value, bool) or value is None or value == "":
        raise OversightError(f"{field} is required")
    try:
        x = float(value)
    except (TypeError, ValueError):
        raise OversightError(f"{field} must be a number") from None
    if not math.isfinite(x) or x < lo or (x > hi if hi_inclusive else x >= hi):
        raise OversightError(f"{field} must be from {lo:g} to {'' if hi_inclusive else 'below '}{hi:g}")
    return x


def emissions_reduction_t(mass_t: float, ls_value: float) -> float:
    """CORSIA emissions reduction (t CO2) from a mass of eligible fuel."""
    return FCF_JET * mass_t * (1 - ls_value / LS_BASELINE)


def _scheme_recognised(scheme: str) -> bool:
    """Does a certification-scheme name mention one of the ICAO-approved schemes on file?"""
    return any(s in scheme.upper() for s in RECOGNISED_SCHEMES)


async def add_fuel_claim(operator_id: int, data: dict, user: str) -> dict:
    """Record an operator's claim for CORSIA eligible fuel (SAF or LCAF); it starts PENDING review.

    Returns the new row id and the emissions reduction the claim would earn if verified.

    Raises:
        OversightError: invalid fields; OversightNotFoundError if the operator does not exist.
    """
    year = _int(data.get("year"), "Year", 2021, _now().year)
    if not period_for_year(year):
        raise OversightError("Year is outside the CORSIA compliance periods")
    fuel_type = _text(data.get("fuel_type"), "Fuel type", 4, required=True).upper()
    if fuel_type not in FUEL_TYPES:
        raise OversightError("Fuel type must be SAF or LCAF")
    mass = _float(data.get("mass_t"), "Fuel mass (tonnes)", 0.001, 10_000_000)
    ls = _float(data.get("ls_value"), "Life-cycle emissions value (gCO₂e/MJ)", -100, LS_BASELINE, hi_inclusive=False)
    basis = _text(data.get("ls_basis"), "Life-cycle value basis", 7, required=True).upper()
    if basis not in ("DEFAULT", "ACTUAL"):
        raise OversightError("Life-cycle value basis must be DEFAULT or ACTUAL")
    row = [operator_id, year, fuel_type,
           _text(data.get("pathway"), "Conversion pathway", 80),
           _text(data.get("feedstock"), "Feedstock", 120),
           _text(data.get("batch_id"), "Batch ID", 120, required=True),
           round(mass, 3), round(ls, 2), basis,
           _text(data.get("scheme"), "Certification scheme", 80, required=True),
           _text(data.get("certificate_ref"), "Certificate / proof of sustainability", 120),
           _text(data.get("producer"), "Producer", 120),
           1 if data.get("not_claimed_elsewhere", True) else 0,
           _text(data.get("notes"), "Notes", 1000), user]
    async with get_db() as db:
        await _require_operator(db, operator_id)
        cur = await db.execute(
            "INSERT INTO carbon_fuel_claims (operator_id, year, fuel_type, pathway, feedstock, batch_id, mass_t,"
            " ls_value, ls_basis, scheme, certificate_ref, producer, not_claimed_elsewhere, notes, created_by)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", row)
        await db.commit()
        return {"id": cur.lastrowid, "status": "PENDING",
                "emissions_reduction_t": round(emissions_reduction_t(mass, ls), 1)}


async def _claim_status(db, claim_id: int, reviews_table: str = "carbon_claim_reviews") -> str:
    """Current status of a claim: its latest review decision, or PENDING if never reviewed."""
    cur = await db.execute(
        f"SELECT decision FROM {reviews_table} WHERE claim_id = ? ORDER BY id DESC LIMIT 1", [claim_id])
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
            category = fuel_burn_category(f.get("category", "medium"))
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

_FUEL_SELECT = (
    "SELECT f.*, o.icao_designator, COALESCE((SELECT decision FROM carbon_fuel_reviews v WHERE v.claim_id = f.id"
    " ORDER BY v.id DESC LIMIT 1), 'PENDING') AS status FROM carbon_fuel_claims f"
    " JOIN carbon_operators o ON o.id = f.operator_id")


async def _load_fuel(db) -> list[dict]:
    """Every fuel claim with its operator's designator and current status, in id order."""
    return [dict(r) for r in await (await db.execute(_FUEL_SELECT + " ORDER BY f.id")).fetchall()]


async def fuel_certificate_context(operator_id: int) -> tuple[dict, dict[str, str]]:
    """What the fuel-certificate reader needs: the operator and the batch ids already claimed.

    Returns:
        (operator row, {lower-cased batch id: "claim F<id> by <designator>, <status>"})
        for every fuel claim not rejected, so a certificate for a batch already
        claimed can be flagged.

    Raises:
        OversightNotFoundError: no operator has that id.
    """
    async with get_db() as db:
        op = await _require_operator(db, operator_id)
        fuel = await _load_fuel(db)
    batches = {f["batch_id"].strip().lower(): f"claim F{f['id']} by {f['icao_designator']}, {f['status'].lower()}"
               for f in fuel if f["status"] != "REJECTED"}
    return op, batches


async def _load(db, period: str) -> tuple[list[dict], list[dict], list[dict]]:
    """Operators, the period's emissions reports (with revision numbers) and every unit claim with its status.

    Claims from all periods are returned because double claims are checked across periods.
    """
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
    """Do two unit claims cover any of the same units in the same registry?

    Numeric serial ranges are compared when both claims have them; otherwise the
    claims overlap only if they name the same non-empty serial block.
    """
    if a["registry"].strip().lower() != b["registry"].strip().lower():
        return False
    if a["serial_start"] is not None and b["serial_start"] is not None:
        return (a["serial_block"].strip().lower() == b["serial_block"].strip().lower()
                and a["serial_start"] <= b["serial_end"] and b["serial_start"] <= a["serial_end"])
    # Without numeric ranges, fall back to an identical non-empty serial block.
    return bool(a["serial_block"].strip()) and a["serial_block"].strip().lower() == b["serial_block"].strip().lower()


async def register(period: str) -> dict:
    """Per-operator position for a compliance period, plus findings.

    For each operator: yearly reports and offsetting requirement, verified and
    pending eligible-fuel reductions, verified/pending/rejected units, shortfall
    and a status (NO_REPORTS, COVERED, AWAITING_REVIEW, SHORTFALL). Findings are
    sorted high to low severity. Unit-claim findings carry ``claim_id``;
    fuel-claim findings carry ``fuel_claim_id``.

    Raises:
        OversightError: unknown compliance period.
    """
    p = _period(period)
    y0, y1 = p["years"]
    this_year = _now().year
    async with get_db() as db:
        ops, reports, all_claims = await _load(db, period)
        all_fuel = await _load_fuel(db)
        # The year before the period, so a jump into its first year is visible too.
        prev_reports = [dict(r) for r in await (await db.execute(
            "SELECT * FROM carbon_emission_reports WHERE year = ? ORDER BY id", [y0 - 1])).fetchall()]

    latest: dict[tuple[int, int], dict] = {}
    for r in reports:
        latest[(r["operator_id"], r["year"])] = r
    claims = [c for c in all_claims if c["compliance_period"] == period]
    # Units claimed twice can span periods, so compare against every live claim.
    live = [c for c in all_claims if c["status"] != "REJECTED"]
    fuel = [f for f in all_fuel if y0 <= f["year"] <= y1]
    live_fuel = [f for f in all_fuel if f["status"] != "REJECTED"]

    observed = {y: await observed_emissions(y) for y in range(y0, min(y1, this_year) + 1)}
    # Claims against the Bahamas National Emissions Registry are checked against its latest statement.
    ner_checks = await ner_registry.check_claims([c for c in claims if c["status"] != "REJECTED"])
    findings: list[dict] = []

    def finding(severity, kind, op, message, claim_id=None):
        """Add a finding; ``claim_id`` is a unit-claim id, or minus a fuel-claim id."""
        findings.append({"severity": severity, "kind": kind, "operator": op["icao_designator"],
                         "operator_id": op["id"], "claim_id": claim_id, "message": message})

    rows = []
    for op in ops:
        years = []
        requirement = 0
        my_fuel = [f for f in fuel if f["operator_id"] == op["id"]]
        for y in range(y0, y1 + 1):
            r = latest.get((op["id"], y))
            obs = observed.get(y, {}).get(op["icao_designator"], {})
            req = round(r["verified_co2_t"] * r["growth_factor"]) if r else None
            requirement += req or 0
            year_fuel = [f for f in my_fuel if f["year"] == y and f["status"] != "REJECTED"]
            cef_mass = sum(f["mass_t"] for f in year_fuel)
            years.append({"year": y, "report": r and {k: r[k] for k in (
                "id", "verified_co2_t", "growth_factor", "verifier", "reference", "revision", "created_by", "created_at")},
                "offsetting_requirement_t": req,
                "cef_mass_t": round(cef_mass, 3) if year_fuel else None,
                "cef_reduction_t": round(sum(emissions_reduction_t(f["mass_t"], f["ls_value"]) for f in year_fuel
                                             if f["status"] == "VERIFIED" and f["ls_value"] <= LS_MAX_ELIGIBLE), 1)
                if year_fuel else None,
                "observed_live_co2_t": obs.get("live_co2_t"), "observed_simulated_co2_t": obs.get("simulated_co2_t")})
            # An airline cannot have burned more eligible fuel than fuel in total.
            if r and cef_mass > r["verified_co2_t"] / FCF_JET:
                finding("high", "FUEL_EXCEEDS_USE", op,
                        f"{y}: eligible-fuel claims total {cef_mass:,.0f} t, more than the "
                        f"{r['verified_co2_t'] / FCF_JET:,.0f} t of fuel implied by its verified CO₂ report")
            if not r and y < this_year:
                finding("medium", "MISSING_REPORT", op, f"No verified emissions report for {y}")
            if r and obs.get("live_co2_t") and obs["live_co2_t"] > r["verified_co2_t"] * OBSERVED_TOLERANCE:
                finding("high", "BELOW_OBSERVED", op,
                        f"{y} report ({r['verified_co2_t']:,} t CO₂) is lower than the {obs['live_co2_t']:,.0f} t "
                        "BACSWN observed inside the Bahamas FIR alone")

        mine = [c for c in claims if c["operator_id"] == op["id"]]
        units = {s: sum(c["quantity"] for c in mine if c["status"] == s) for s in ("VERIFIED", "PENDING", "REOPENED", "REJECTED")}
        pending = units["PENDING"] + units["REOPENED"]

        def reduction(statuses):
            """Emissions reduction (t CO2) from this operator's eligible fuel claims in ``statuses``."""
            return sum(emissions_reduction_t(f["mass_t"], f["ls_value"]) for f in my_fuel
                       if f["status"] in statuses and f["ls_value"] <= LS_MAX_ELIGIBLE)
        cef_verified = round(reduction({"VERIFIED"}))
        cef_pending = round(reduction({"PENDING", "REOPENED"}))
        # Verified eligible-fuel reductions come off the requirement (never below zero).
        final_requirement = max(0, requirement - cef_verified)
        shortfall = max(0, final_requirement - units["VERIFIED"])
        reported_years = sum(1 for y in years if y["report"])
        period_closed = y1 < this_year
        if reported_years == 0:
            status = "NO_REPORTS"
        elif shortfall == 0:
            status = "COVERED"
        elif shortfall <= pending + cef_pending:
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
            for i in ner_checks.get(c["id"], {}).get("issues", []):
                finding(ner_registry.severity(i["kind"]), i["kind"], op, f"Claim #{c['id']}: {i['message']}", c["id"])

        for f in my_fuel:
            if f["status"] == "REJECTED":
                continue
            label = f"Fuel claim F{f['id']} (batch {f['batch_id']})"
            if f["ls_value"] > LS_MAX_ELIGIBLE:
                finding("high", "FUEL_BELOW_THRESHOLD", op,
                        f"{label}: life-cycle value {f['ls_value']:g} gCO₂e/MJ is above {LS_MAX_ELIGIBLE:g}, so it is "
                        "less than a 10 % reduction and not an eligible fuel; it earns no reduction", -f["id"])
            if not _scheme_recognised(f["scheme"]):
                finding("medium", "FUEL_SCHEME_UNRECOGNISED", op,
                        f"{label}: certification scheme '{f['scheme']}' is not an ICAO-approved scheme on file "
                        f"({', '.join(RECOGNISED_SCHEMES)})", -f["id"])
            if not f["not_claimed_elsewhere"]:
                finding("high", "FUEL_CLAIMED_ELSEWHERE", op,
                        f"{label}: operator has not declared the batch unclaimed under other schemes", -f["id"])
            for other in live_fuel:
                if other["id"] < f["id"] and other["batch_id"].strip().lower() == f["batch_id"].strip().lower():
                    who = "the same operator" if other["operator_id"] == op["id"] else other["icao_designator"]
                    finding("high", "FUEL_DOUBLE_CLAIM", op,
                            f"{label} was already claimed in F{other['id']} by {who}", -f["id"])

        rows.append({"id": op["id"], "icao_designator": op["icao_designator"], "name": op["name"],
                     "years": years, "reported_years": reported_years,
                     "offsetting_requirement_t": requirement, "cef_reduction_t": cef_verified,
                     "pending_cef_reduction_t": cef_pending, "final_requirement_t": final_requirement,
                     "verified_units": units["VERIFIED"],
                     "pending_units": pending, "rejected_units": units["REJECTED"],
                     "shortfall_units": shortfall, "status": status})

    _unusual_figures(ops, latest, prev_reports, fuel, observed, (y0, y1), finding)

    order = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: (order[f["severity"]], f["operator"], abs(f["claim_id"] or 0)))
    # Unit-claim findings carry the claim id; fuel-claim findings a negative id (see fuel_claim_id).
    for f in findings:
        cid = f["claim_id"]
        f["fuel_claim_id"] = -cid if cid and cid < 0 else None
        f["claim_id"] = cid if cid and cid > 0 else None
    totals = {k: sum(r[k] for r in rows) for k in
              ("offsetting_requirement_t", "cef_reduction_t", "pending_cef_reduction_t", "final_requirement_t",
               "verified_units", "pending_units", "shortfall_units")}
    return {"period": period, **{k: p[k] for k in ("label", "years", "vintages")},
            "period_closed": y1 < this_year, "operators": rows, "totals": totals,
            "findings": findings, "claims": [_claim_view(c, ner_checks) for c in claims],
            "fuel_claims": [_fuel_view(f) for f in fuel],
            "fuel_constants": {"fcf": FCF_JET, "ls_baseline": LS_BASELINE, "ls_max_eligible": LS_MAX_ELIGIBLE,
                               "recognised_schemes": list(RECOGNISED_SCHEMES)}}


# ── unusual figures (statistical signals; low severity, for a reviewer to look at) ──

UNUSUAL_CHANGE = 0.35         # year-on-year change in verified CO2 worth a look
SPLIT_MIN_CLAIMS = 3          # fuel claims from one producer in a year, of near-identical mass
SPLIT_SPREAD = 0.10           # max/min mass within 10 %
RATIO_FRACTION = 0.5          # report/observed ratio under half the median of other operators


def _unusual_figures(ops, latest, prev_reports, fuel, observed, years, finding) -> None:
    """Add low-severity statistical findings for a reviewer to look at (not breaches in themselves).

    Flags large year-on-year changes in verified CO2, growth factors that differ
    between operators in a year, possible fuel-batch splitting, and reports far
    lower relative to BACSWN's FIR observations than other operators' reports.

    Args:
        ops: operator rows; latest: {(operator_id, year): latest report} for the period;
        prev_reports: reports for the year before the period; fuel: the period's fuel claims;
        observed: {year: observed_emissions(year)}; years: (first, last) year of the period;
        finding: the ``register`` callback that records a finding.
    """
    y0, y1 = years
    by_id = {o["id"]: o for o in ops}
    reported = dict(latest)
    for r in prev_reports:                          # latest revision wins (rows are in id order)
        reported[(r["operator_id"], r["year"])] = r
    # 1. Large year-on-year changes in verified emissions.
    for (op_id, y), r in sorted(reported.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        prev = reported.get((op_id, y - 1))
        if y < y0 or not prev or not prev["verified_co2_t"] or op_id not in by_id:
            continue
        change = (r["verified_co2_t"] - prev["verified_co2_t"]) / prev["verified_co2_t"]
        if abs(change) >= UNUSUAL_CHANGE:
            finding("low", "UNUSUAL_CHANGE", by_id[op_id],
                    f"{y}: verified CO₂ {'rose' if change > 0 else 'fell'} {abs(change):.0%} on {y - 1} "
                    f"({prev['verified_co2_t']:,} → {r['verified_co2_t']:,} t)")
    # 2. Growth factors that differ between operators for the same year (ICAO publishes one per year).
    for y in range(y0, y1 + 1):
        year_reports = [(op_id, r) for (op_id, yr), r in latest.items() if yr == y and op_id in by_id]
        factors = [r["growth_factor"] for _, r in year_reports]
        if len(set(factors)) < 2:
            continue
        common = max(sorted(set(factors)), key=factors.count)
        for op_id, r in year_reports:
            if r["growth_factor"] != common:
                finding("low", "UNUSUAL_GROWTH_FACTOR", by_id[op_id],
                        f"{y}: growth factor {r['growth_factor']:g} differs from the {common:g} used for the other "
                        "operators; ICAO publishes one sector growth factor per year")
    # 3. Several near-identical fuel claims from one producer in a year (possible batch splitting).
    groups: dict[tuple, list] = {}
    for f in fuel:
        if f["status"] != "REJECTED" and f["producer"].strip():
            groups.setdefault((f["operator_id"], f["year"], f["producer"].strip().lower()), []).append(f)
    for (op_id, y, _), fs in groups.items():
        masses = [f["mass_t"] for f in fs]
        if len(fs) >= SPLIT_MIN_CLAIMS and min(masses) > 0 and max(masses) / min(masses) <= 1 + SPLIT_SPREAD \
                and op_id in by_id:
            ids = ", ".join(f"F{f['id']}" for f in fs)
            finding("low", "UNUSUAL_FUEL_SPLIT", by_id[op_id],
                    f"{y}: {len(fs)} fuel claims from {fs[0]['producer']} of almost the same mass "
                    f"({min(masses):,g}–{max(masses):,g} t: {ids}); check they are separate deliveries", -fs[0]["id"])
    # 4. A report far lower, relative to what BACSWN observed, than other operators' reports are.
    for y in range(y0, y1 + 1):
        ratios = {}
        for (op_id, yr), r in latest.items():
            obs = observed.get(y, {}).get(by_id.get(op_id, {}).get("icao_designator"), {}).get("live_co2_t")
            if yr == y and obs and op_id in by_id:
                ratios[op_id] = r["verified_co2_t"] / obs
        if len(ratios) < 3:
            continue
        for op_id, ratio in ratios.items():
            others = sorted(v for k, v in ratios.items() if k != op_id)
            median = others[len(others) // 2] if len(others) % 2 else (others[len(others) // 2 - 1] + others[len(others) // 2]) / 2
            if ratio < median * RATIO_FRACTION:
                finding("low", "UNUSUAL_OBSERVED_RATIO", by_id[op_id],
                        f"{y}: the verified report is {ratio:.1f}× what BACSWN observed in the FIR, against a median "
                        f"of {median:.1f}× for other operators")


def _claim_view(c: dict, ner_checks: dict[int, dict] | None = None) -> dict:
    """The public fields of a unit claim, with its NER check result attached (if any)."""
    keys = ("id", "operator_id", "icao_designator", "compliance_period", "registry", "serial_block", "serial_start",
            "serial_end", "quantity", "vintage", "project_id", "project_name", "declared_eligible", "cancelled_on",
            "registry_reference", "notes", "status", "created_by", "created_at")
    v = {k: c[k] for k in keys}
    v["declared_eligible"] = bool(v["declared_eligible"])
    v["ner_check"] = (ner_checks or {}).get(c["id"])
    return v


def _fuel_view(f: dict) -> dict:
    """The public fields of a fuel claim, with eligibility and its emissions reduction computed."""
    keys = ("id", "operator_id", "icao_designator", "year", "fuel_type", "pathway", "feedstock", "batch_id", "mass_t",
            "ls_value", "ls_basis", "scheme", "certificate_ref", "producer", "not_claimed_elsewhere", "notes",
            "status", "created_by", "created_at")
    v = {k: f[k] for k in keys}
    v["not_claimed_elsewhere"] = bool(v["not_claimed_elsewhere"])
    v["eligible"] = f["ls_value"] <= LS_MAX_ELIGIBLE
    v["emissions_reduction_t"] = round(emissions_reduction_t(f["mass_t"], f["ls_value"]), 1)
    return v


def _review_history(reviews: list[dict]) -> dict[int, list[dict]]:
    """Group review rows by claim id, keeping the public fields and whether an AI brief was used."""
    by_claim: dict[int, list] = {}
    for v in reviews:
        by_claim.setdefault(v["claim_id"], []).append(
            {**{k: v[k] for k in ("decision", "reason", "created_by", "created_at")}, "ai_assisted": bool(v["ai_brief"])})
    return by_claim


async def operator_detail(operator_id: int) -> dict:
    """One operator's full record: every report revision, unit and fuel claim, and their review history.

    Raises:
        OversightNotFoundError: no operator has that id.
    """
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
        fuel = [dict(r) for r in await (await db.execute(
            _FUEL_SELECT + " WHERE f.operator_id = ? ORDER BY f.id", [operator_id])).fetchall()]
        fuel_reviews = [dict(r) for r in await (await db.execute(
            "SELECT v.* FROM carbon_fuel_reviews v JOIN carbon_fuel_claims f ON f.id = v.claim_id"
            " WHERE f.operator_id = ? ORDER BY v.id", [operator_id])).fetchall()]
    seen: dict[int, int] = {}
    for r in reports:
        seen[r["year"]] = seen.get(r["year"], 0) + 1
        r["revision"] = seen[r["year"]]
    ner_checks = await ner_registry.check_claims([c for c in claims if c["status"] != "REJECTED"])
    latest_ids = {max(r["id"] for r in reports if r["year"] == y) for y in seen}
    for r in reports:
        r["superseded"] = r["id"] not in latest_ids
    by_claim = _review_history(reviews)
    by_fuel = _review_history(fuel_reviews)
    return {"operator": op, "reports": reports,
            "claims": [{**_claim_view(c, ner_checks), "reviews": by_claim.get(c["id"], [])} for c in claims],
            "fuel_claims": [{**_fuel_view(f), "reviews": by_fuel.get(f["id"], [])} for f in fuel]}


def csv_safe(v) -> str:
    """Neutralise spreadsheet formula injection in exported text (prefix a quote to =, +, -, @, tab, CR)."""
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


def _flagged(findings: list[dict], key: str) -> dict[int, list[str]]:
    """Finding kinds per claim, keyed by ``key`` ("claim_id" or "fuel_claim_id")."""
    flagged: dict[int, list[str]] = {}
    for f in findings:
        if f[key]:
            flagged.setdefault(f[key], []).append(f["kind"])
    return flagged


async def export_csv(period: str) -> str:
    """The period's unit-cancellation claims as CSV, with status, NER check and finding kinds.

    Raises:
        OversightError: unknown compliance period.
    """
    reg = await register(period)
    flagged = _flagged(reg["findings"], "claim_id")
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["claim_id", "operator", "compliance_period", "registry", "serial_block", "serial_start", "serial_end",
                "quantity", "vintage", "project_id", "project_name", "declared_eligible", "cancelled_on",
                "registry_reference", "status", "ner_check", "findings", "recorded_by", "recorded_at"])
    for c in reg["claims"]:
        w.writerow([csv_safe(x) for x in (
            c["id"], c["icao_designator"], c["compliance_period"], c["registry"], c["serial_block"], c["serial_start"],
            c["serial_end"], c["quantity"], c["vintage"], c["project_id"], c["project_name"],
            "yes" if c["declared_eligible"] else "no", c["cancelled_on"], c["registry_reference"], c["status"],
            (c["ner_check"] or {}).get("result", ""),
            " ".join(flagged.get(c["id"], [])), c["created_by"], c["created_at"])])
    return buf.getvalue()


async def compliance_overview() -> dict:
    """Headline CORSIA position for the current compliance period, from the oversight register.

    Why: dashboards used to show a hard-coded "compliant"; this reports what the register
    actually says. How: the worst operator status wins — any SHORTFALL makes the period
    "shortfall", else any operator awaiting review or without reports makes it
    "under_review", else "compliant". With no operators registered it is "no_operators".

    Returns:
        ``{"period", "status", "operators", "by_status"}``; ``status`` is "unknown" when
        there is no current period.
    """
    current = next((p["id"] for p in periods() if p["current"]), None)
    if not current:
        return {"period": None, "status": "unknown", "operators": 0, "by_status": {}}
    reg = await register(current)
    by_status: dict[str, int] = {}
    for op in reg["operators"]:
        by_status[op["status"]] = by_status.get(op["status"], 0) + 1
    if not by_status:
        status = "no_operators"
    elif by_status.get("SHORTFALL"):
        status = "shortfall"
    elif set(by_status) - {"COVERED"}:
        status = "under_review"
    else:
        status = "compliant"
    return {"period": current, "status": status, "operators": len(reg["operators"]), "by_status": by_status}


def periods() -> list[dict]:
    """The compliance periods, with their vintage windows and which one is current."""
    this_year = _now().year
    return [{"id": k, "label": v["label"], "years": v["years"], "vintages": v["vintages"],
             "current": v["years"][0] <= this_year <= v["years"][1]} for k, v in PERIODS.items()]


async def export_fuel_csv(period: str) -> str:
    """The period's eligible-fuel claims as CSV, with reduction, eligibility, status and finding kinds.

    Raises:
        OversightError: unknown compliance period.
    """
    reg = await register(period)
    flagged = _flagged(reg["findings"], "fuel_claim_id")
    buf = io.StringIO()
    w = csv.writer(buf)
    cols = ("id", "icao_designator", "year", "fuel_type", "pathway", "feedstock", "batch_id", "mass_t", "ls_value",
            "ls_basis", "emissions_reduction_t", "eligible", "scheme", "certificate_ref", "producer",
            "not_claimed_elsewhere", "status")
    w.writerow(["fuel_claim_id" if c == "id" else "operator" if c == "icao_designator" else c for c in cols]
               + ["findings", "recorded_by", "recorded_at"])
    for f in reg["fuel_claims"]:
        w.writerow([csv_safe("yes" if f[c] is True else "no" if f[c] is False else f[c]) for c in cols]
                   + [" ".join(flagged.get(f["id"], [])), csv_safe(f["created_by"]), f["created_at"]])
    return buf.getvalue()
