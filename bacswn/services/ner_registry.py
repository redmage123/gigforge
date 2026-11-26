"""BACSWN — exchange with the Bahamas National Emissions Registry (NER).

The NER (established under the Climate Change and Carbon Market Initiatives Act,
2022) records carbon units originating in the Bahamas: their issuance, the
state's authorisation of them for uses such as CORSIA, the corresponding
adjustment, and their cancellation. It has not published a programmatic
interface, so the exchange is file-based in both directions:

  * inbound — a registry *statement*: an extract of Bahamian units as of a date
    (JSON or CSV, format below). Statements are append-only; the latest one by
    "as of" date is the one claims are checked against.
  * outbound — a *state report* for a compliance period: verified emissions,
    offsetting requirements and the cancellations the state has verified, as a
    JSON package for submission to the registry.

Every unit-cancellation claim that names the NER as its registry is checked
against the latest statement: are the units there, authorised for CORSIA with
a corresponding adjustment applied, and cancelled for CORSIA by the operator
making the claim, under the same cancellation reference?

Statement unit fields (JSON objects in "units", or CSV columns):
  serial_block, serial_start, serial_end      required; the units' serial range
  vintage                                     required
  status                                      ISSUED | TRANSFERRED | CANCELLED | RETIRED | SUSPENDED
  authorisation_ref                           letter of authorisation reference
  authorised_uses                             e.g. "CORSIA;NDC" (CSV) or ["CORSIA"] (JSON)
  corresponding_adjustment                    yes/no
  cancelled_for, cancelled_by, cancellation_ref, cancelled_on
  project_id, project_name

Why: CORSIA only counts units that the host country has authorised, adjusted
for and that were cancelled by the claiming operator; the registry is the
authority on that, so a claim the register cannot match against it should be
flagged rather than taken on the operator's word.

How: statements are parsed and validated row by row (``RegistryError`` names
the row), stored with their SHA-256 so the same file cannot be imported twice,
and ``check_claims`` compares claims with the units of the latest statement and
with the letters of authorisation on file, returning issues that
services/carbon_oversight.py turns into findings.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
from datetime import date, datetime, timezone

from services.database import get_db
from services.errors import BacswnValidationError

REGISTRY_NAME = "Bahamas National Emissions Registry"
STATUSES = {"ISSUED", "TRANSFERRED", "CANCELLED", "RETIRED", "SUSPENDED"}
COLUMNS = ("serial_block", "serial_start", "serial_end", "vintage", "status", "authorisation_ref", "authorised_uses",
           "corresponding_adjustment", "cancelled_for", "cancelled_by", "cancellation_ref", "cancelled_on",
           "project_id", "project_name")
MAX_CONTENT = 5_000_000
MAX_ROWS = 50_000
REPORT_FORMAT = "bacswn-ner-corsia-state-report/1"
_TRUE = {"yes", "y", "true", "1", "applied"}
_FALSE = {"no", "n", "false", "0", "", "not applied"}


class RegistryError(BacswnValidationError):
    """A registry statement or authorisation was refused; the message is safe to show to the user.

    HTTP 400 by default; a statement that was already imported passes ``status=409``.
    """


def is_ner(registry: str | None) -> bool:
    """Does a claim's registry name refer to the Bahamas NER?"""
    r = " ".join((registry or "").lower().split())
    return "national emission" in r or r in {"ner", "bahamas ner", "ner (bahamas)"}


def _where(row: int | None) -> str:
    """Message prefix naming the statement row ("Row 3: "), or "" when there is no row."""
    return f"Row {row}: " if row else ""


def _str(v, field: str, row: int, max_len: int = 120) -> str:
    """Stripped text field of at most ``max_len`` characters (``row`` 0 = not from a statement row).

    Raises:
        RegistryError: too long.
    """
    s = "" if v is None else str(v).strip()
    if len(s) > max_len:
        raise RegistryError(f"{_where(row)}{field} must be at most {max_len} characters")
    return s


def _int(v, field: str, row: int, lo: int = 0, hi: int = 10**15) -> int:
    """Required whole number in ``lo``..``hi`` from a statement row.

    Raises:
        RegistryError: missing, not a whole number, or out of range.
    """
    try:
        n = int(str(v).strip())
    except (TypeError, ValueError):
        raise RegistryError(f"Row {row}: {field} must be a whole number") from None
    if not lo <= n <= hi:
        raise RegistryError(f"Row {row}: {field} must be from {lo:,} to {hi:,}")
    return n


def _bool(v, field: str, row: int) -> bool:
    """Yes/no field, accepting booleans and the spellings in ``_TRUE`` / ``_FALSE`` (blank is no).

    Raises:
        RegistryError: any other value.
    """
    if isinstance(v, bool):
        return v
    s = "" if v is None else str(v).strip().lower()
    if s in _TRUE:
        return True
    if s in _FALSE:
        return False
    raise RegistryError(f"{_where(row)}{field} must be yes or no")


def _date(v, field: str, row: int | None = None, required: bool = False) -> str:
    """ISO date (first 10 characters, YYYY-MM-DD) not in the future; "" when blank and not required.

    Raises:
        RegistryError: missing when required, not a date, or in the future.
    """
    s = "" if v is None else str(v).strip()
    where = _where(row)
    if not s:
        if required:
            raise RegistryError(f"{where}{field} is required")
        return ""
    try:
        d = date.fromisoformat(s[:10])
    except ValueError:
        raise RegistryError(f"{where}{field} must be a date (YYYY-MM-DD)") from None
    if d > datetime.now(timezone.utc).date():
        raise RegistryError(f"{where}{field} cannot be in the future")
    return d.isoformat()


def _uses(v) -> str:
    """Normalise authorised uses (a list, or text split on ; or ,) to sorted upper-case codes joined by ";"."""
    items = v if isinstance(v, list) else str(v or "").replace(",", ";").split(";")
    return ";".join(sorted({str(i).strip().upper() for i in items if str(i).strip()}))


def _unit(raw: dict, row: int) -> dict:
    """Validate one statement row into a unit dict with the ``COLUMNS`` fields.

    Raises:
        RegistryError: naming the row, for any invalid or inconsistent field.
    """
    if not isinstance(raw, dict):
        raise RegistryError(f"Row {row}: each unit must be an object")
    u = {
        "serial_block": _str(raw.get("serial_block"), "serial_block", row, 200),
        "serial_start": _int(raw.get("serial_start"), "serial_start", row),
        "serial_end": _int(raw.get("serial_end"), "serial_end", row),
        "vintage": _int(raw.get("vintage"), "vintage", row, 2000, 2100),
        "status": _str(raw.get("status"), "status", row, 20).upper(),
        "authorisation_ref": _str(raw.get("authorisation_ref"), "authorisation_ref", row),
        "authorised_uses": _uses(raw.get("authorised_uses")),
        "corresponding_adjustment": _bool(raw.get("corresponding_adjustment"), "corresponding_adjustment", row),
        "cancelled_for": _str(raw.get("cancelled_for"), "cancelled_for", row, 40).upper(),
        "cancelled_by": _str(raw.get("cancelled_by"), "cancelled_by", row, 80).upper(),
        "cancellation_ref": _str(raw.get("cancellation_ref"), "cancellation_ref", row),
        "cancelled_on": _date(raw.get("cancelled_on"), "cancelled_on", row),
        "project_id": _str(raw.get("project_id"), "project_id", row, 80),
        "project_name": _str(raw.get("project_name"), "project_name", row, 200),
    }
    if not u["serial_block"]:
        raise RegistryError(f"Row {row}: serial_block is required")
    if u["serial_end"] < u["serial_start"]:
        raise RegistryError(f"Row {row}: serial_end must not be before serial_start")
    if u["status"] not in STATUSES:
        raise RegistryError(f"Row {row}: status must be one of {', '.join(sorted(STATUSES))}")
    if u["status"] == "CANCELLED" and not u["cancelled_on"]:
        raise RegistryError(f"Row {row}: a cancelled unit needs cancelled_on")
    return u


def parse_statement(content: str, fmt: str) -> tuple[dict, list[dict]]:
    """Parse a registry statement into (meta, units). Raises RegistryError."""
    if not isinstance(content, str) or not content.strip():
        raise RegistryError("The statement is empty")
    if len(content) > MAX_CONTENT:
        raise RegistryError(f"The statement is larger than {MAX_CONTENT // 1_000_000} MB")
    fmt = (fmt or "").lower()
    meta: dict = {}
    if fmt == "json":
        try:
            doc = json.loads(content)
        except ValueError:
            raise RegistryError("The statement is not valid JSON") from None
        if not isinstance(doc, dict) or not isinstance(doc.get("units"), list):
            raise RegistryError('A JSON statement must be an object with a "units" list')
        meta = {k: doc.get(k) for k in ("as_of", "reference")}
        raws = doc["units"]
    elif fmt == "csv":
        reader = csv.DictReader(io.StringIO(content.lstrip("﻿")))
        missing = {"serial_block", "serial_start", "serial_end", "vintage", "status"} - set(reader.fieldnames or [])
        if missing:
            raise RegistryError(f"CSV is missing columns: {', '.join(sorted(missing))}")
        raws = list(reader)
    else:
        raise RegistryError("Format must be json or csv")
    if not raws:
        raise RegistryError("The statement lists no units")
    if len(raws) > MAX_ROWS:
        raise RegistryError(f"The statement has more than {MAX_ROWS:,} rows")
    units = [_unit(r, i) for i, r in enumerate(raws, start=1)]
    # A registry never holds the same serial twice; overlapping rows mean a malformed extract.
    by_block: dict[str, list[dict]] = {}
    for u in units:
        by_block.setdefault(u["serial_block"].lower(), []).append(u)
    for rows in by_block.values():
        rows.sort(key=lambda u: u["serial_start"])
        for a, b in zip(rows, rows[1:]):
            if b["serial_start"] <= a["serial_end"]:
                raise RegistryError(f"Serials {b['serial_block']} {b['serial_start']}–{a['serial_end']} appear in more than one row")
    return meta, units


async def import_statement(data: dict, user: str) -> dict:
    """Validate and store a registry statement; it becomes the latest if its "as of" date is the newest.

    The request's ``as_of`` / ``reference`` override those in a JSON statement.

    Raises:
        RegistryError: invalid statement or fields, or (409) the same file was already imported.
    """
    fmt = str(data.get("format") or "").lower()
    content = data.get("content")
    meta, units = parse_statement(content, fmt)
    units_total = sum(u["serial_end"] - u["serial_start"] + 1 for u in units)
    as_of = _date(data.get("as_of") or meta.get("as_of"), "Statement date (as of)", required=True)
    reference = _str(data.get("reference") or meta.get("reference"), "Statement reference", 0)
    source_note = _str(data.get("source_note"), "Source note", 0, 500)
    digest = hashlib.sha256(content.encode()).hexdigest()
    async with get_db() as db:
        if await (await db.execute("SELECT id FROM ner_statements WHERE sha256 = ?", [digest])).fetchone():
            raise RegistryError("This statement has already been imported", status=409)
        cur = await db.execute(
            "INSERT INTO ner_statements (as_of, reference, source_format, sha256, unit_rows, units_total, imported_by,"
            " source_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [as_of, reference, fmt, digest, len(units), units_total, user, source_note])
        sid = cur.lastrowid
        await db.executemany(
            f"INSERT INTO ner_units (statement_id, {', '.join(COLUMNS)}) VALUES (?{', ?' * len(COLUMNS)})",
            [[sid] + [int(u[c]) if c == "corresponding_adjustment" else u[c] for c in COLUMNS] for u in units])
        await db.commit()
    return {"id": sid, "as_of": as_of, "reference": reference, "unit_rows": len(units),
            "units_total": units_total}


_STATEMENT_COLS = "id, as_of, reference, source_format, unit_rows, units_total, imported_by, source_note, created_at"


async def statements() -> list[dict]:
    """Every imported statement (metadata only), newest "as of" first."""
    async with get_db() as db:
        rows = await (await db.execute(
            f"SELECT {_STATEMENT_COLS} FROM ner_statements ORDER BY as_of DESC, id DESC")).fetchall()
    return [dict(r) for r in rows]


async def latest_statement(db) -> dict | None:
    """Metadata of the statement claims are checked against (latest "as of", then latest import), or None."""
    row = await (await db.execute(
        f"SELECT {_STATEMENT_COLS} FROM ner_statements ORDER BY as_of DESC, id DESC LIMIT 1")).fetchone()
    return dict(row) if row else None


async def status() -> dict:
    """Connection status for the registry page: statement count, the latest statement and a summary of its units."""
    async with get_db() as db:
        latest = await latest_statement(db)
        summary = None
        if latest:
            rows = await (await db.execute(
                "SELECT status, corresponding_adjustment, authorised_uses, serial_end - serial_start + 1 AS n"
                " FROM ner_units WHERE statement_id = ?", [latest["id"]])).fetchall()
            summary = {"by_status": {}, "corsia_authorised": 0, "adjusted": 0,
                       "cancelled_for_corsia": 0}
            for r in rows:
                summary["by_status"][r["status"]] = summary["by_status"].get(r["status"], 0) + r["n"]
                if "CORSIA" in r["authorised_uses"].split(";"):
                    summary["corsia_authorised"] += r["n"]
                if r["corresponding_adjustment"]:
                    summary["adjusted"] += r["n"]
            cur = await db.execute(
                "SELECT COALESCE(SUM(serial_end - serial_start + 1), 0) FROM ner_units WHERE statement_id = ?"
                " AND status = 'CANCELLED' AND cancelled_for = 'CORSIA'", [latest["id"]])
            summary["cancelled_for_corsia"] = (await cur.fetchone())[0]
        count = (await (await db.execute("SELECT COUNT(*) FROM ner_statements")).fetchone())[0]
    return {"registry": REGISTRY_NAME, "connection": "file",
            "connection_note": "The registry has not published a programmatic interface. Statements are imported "
                               "from registry extracts, and state reports are exported for submission.",
            "statements": count, "latest": latest, "latest_summary": summary, "columns": list(COLUMNS)}


def template_csv() -> str:
    """A CSV statement template: the header row and one example row."""
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(COLUMNS)
    w.writerow(["BS-NER-EXAMPLE", 1, 1000, 2025, "CANCELLED", "BS-LOA-0001", "CORSIA", "yes", "CORSIA", "BHS",
                "NER-CXL-0001", "2026-06-10", "BS-PRJ-0001", "Example seagrass project"])
    return buf.getvalue()


# ── letters of authorisation ───────────────────────────────────────────────

def _opt_int(v, field: str, lo: int, hi: int) -> int | None:
    """Optional whole number in ``lo``..``hi``; None when blank.

    Raises:
        RegistryError: not a whole number, or out of range.
    """
    if v is None or str(v).strip() == "":
        return None
    try:
        n = int(str(v).strip())
    except ValueError:
        raise RegistryError(f"{field} must be a whole number") from None
    if not lo <= n <= hi:
        raise RegistryError(f"{field} must be from {lo:,} to {hi:,}")
    return n


def _blocks(v) -> str:
    """Normalise serial blocks (a list, or text split on ; or ,) to a sorted, de-duplicated ";"-joined string.

    Raises:
        RegistryError: more than 100 blocks, or a block longer than 200 characters.
    """
    items = v if isinstance(v, list) else str(v or "").replace(",", ";").split(";")
    out = sorted({str(i).strip() for i in items if str(i).strip()})
    if any(len(b) > 200 for b in out) or len(out) > 100:
        raise RegistryError("Serial blocks: at most 100 blocks of up to 200 characters")
    return ";".join(out)


async def add_authorisation(data: dict, user: str) -> dict:
    """Record a letter of authorisation (append-only; a revision is a new row with the same reference).

    Raises:
        RegistryError: missing reference or issue date, or invalid fields.
    """
    reference = _str(data.get("reference"), "Reference", 0)
    if not reference:
        raise RegistryError("Reference is required")
    issue_date = _date(data.get("issue_date"), "Issue date", required=True)
    vf = _opt_int(data.get("vintage_from"), "Vintage from", 2000, 2100)
    vt = _opt_int(data.get("vintage_to"), "Vintage to", 2000, 2100)
    if vf and vt and vt < vf:
        raise RegistryError("Vintage to must not be before vintage from")
    row = [reference, issue_date, _str(data.get("issuing_body"), "Issuing body", 0, 200),
           _uses(data.get("authorised_uses")),
           1 if _bool(data.get("corresponding_adjustment", False), "Corresponding adjustment", 0) else 0,
           vf, vt, _opt_int(data.get("max_quantity"), "Maximum quantity", 1, 10**12),
           _blocks(data.get("serial_blocks")),
           _str(data.get("project_id"), "Project ID", 0, 80), _str(data.get("project_name"), "Project name", 0, 200),
           _str(data.get("notes"), "Notes", 0, 1000), user]
    async with get_db() as db:
        cur = await db.execute(
            "INSERT INTO ner_authorisations (reference, issue_date, issuing_body, authorised_uses,"
            " corresponding_adjustment, vintage_from, vintage_to, max_quantity, serial_blocks, project_id,"
            " project_name, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", row)
        await db.commit()
    return {"id": cur.lastrowid, "reference": reference}


async def _latest_authorisations(db) -> dict[str, dict]:
    """Latest recorded letter per reference (lower-cased key)."""
    rows = await (await db.execute("SELECT * FROM ner_authorisations ORDER BY id")).fetchall()
    return {r["reference"].strip().lower(): dict(r) for r in rows}


async def _units_per_authorisation(db, statement_id: int) -> dict[str, int]:
    """Units in a statement per cited authorisation reference (lower-cased, trimmed key)."""
    rows = await (await db.execute(
        "SELECT lower(trim(authorisation_ref)) AS ref, SUM(serial_end - serial_start + 1) AS n FROM ner_units"
        " WHERE statement_id = ? GROUP BY lower(trim(authorisation_ref))", [statement_id])).fetchall()
    return {r["ref"]: r["n"] for r in rows}


async def authorisations() -> list[dict]:
    """The latest revision of each letter on file, newest issue date first.

    Each carries the number of units the latest statement holds under it and
    whether that exceeds the letter's maximum quantity.
    """
    async with get_db() as db:
        latest = await _latest_authorisations(db)
        st = await latest_statement(db)
        counts = await _units_per_authorisation(db, st["id"]) if st else {}
    out = []
    for key, a in sorted(latest.items(), key=lambda kv: kv[1]["issue_date"], reverse=True):
        a["units_in_registry"] = counts.get(key, 0)
        a["over_limit"] = bool(a["max_quantity"] and a["units_in_registry"] > a["max_quantity"])
        out.append(a)
    return out


# ── claim checks ────────────────────────────────────────────────────────────

_SEVERITY = {"NER_NO_STATEMENT": "medium", "NER_STATEMENT_OLDER": "medium", "NER_NOT_FOUND": "high",
             "NER_NOT_AUTHORISED": "high", "NER_NO_ADJUSTMENT": "high", "NER_NOT_CANCELLED": "high",
             "NER_CANCELLED_BY_OTHER": "high", "NER_REFERENCE_MISMATCH": "medium", "NER_VINTAGE_MISMATCH": "medium",
             "NER_LOA_NOT_ON_FILE": "low", "NER_LOA_MISMATCH": "high", "NER_LOA_EXCEEDED": "high"}


def severity(kind: str) -> str:
    """Severity (high / medium / low) of an NER issue kind."""
    return _SEVERITY[kind]


async def check_claims(claims: list[dict]) -> dict[int, dict]:
    """Check each NER claim (dicts with the carbon_unit_claims columns plus icao_designator).

    Returns {claim_id: {"result", "as_of", "statement_id", "issues": [{"kind", "message"}]}}.
    result: MATCHED | PROBLEMS | STALE | NO_STATEMENT.
    """
    mine = [c for c in claims if is_ner(c["registry"])]
    if not mine:
        return {}
    async with get_db() as db:
        latest = await latest_statement(db)
        units: list[dict] = []
        ref_totals: dict[str, int] = {}
        if latest:
            blocks = sorted({c["serial_block"].strip().lower() for c in mine})
            marks = ",".join("?" * len(blocks))
            units = [dict(r) for r in await (await db.execute(
                f"SELECT * FROM ner_units WHERE statement_id = ? AND lower(trim(serial_block)) IN ({marks})",
                [latest["id"], *blocks])).fetchall()]
            ref_totals = await _units_per_authorisation(db, latest["id"])
        auths = await _latest_authorisations(db)
    out: dict[int, dict] = {}
    for c in mine:
        out[c["id"]] = _check(c, latest, units, auths, ref_totals)
    return out


def _check_authorisation(u: dict, s: str, auths: dict[str, dict], ref_totals: dict[str, int], issue) -> None:
    """Compare a registry row with the letter of authorisation it cites (only once letters are kept here)."""
    ref = u["authorisation_ref"].strip()
    if not auths or not ref:
        return
    a = auths.get(ref.lower())
    if not a:
        issue("NER_LOA_NOT_ON_FILE", f"Units {s} cite authorisation {ref}, which is not among the letters on file")
        return
    if "CORSIA" in u["authorised_uses"].split(";") and "CORSIA" not in a["authorised_uses"].split(";"):
        issue("NER_LOA_MISMATCH", f"The registry lists units {s} as authorised for CORSIA, but letter {ref} does not authorise CORSIA use")
    if (a["vintage_from"] and u["vintage"] < a["vintage_from"]) or (a["vintage_to"] and u["vintage"] > a["vintage_to"]):
        issue("NER_LOA_MISMATCH", f"Units {s} are vintage {u['vintage']}, outside the {a['vintage_from'] or '…'}–"
                                  f"{a['vintage_to'] or '…'} vintages letter {ref} covers")
    total = ref_totals.get(ref.lower(), 0)
    if a["max_quantity"] and total > a["max_quantity"]:
        issue("NER_LOA_EXCEEDED", f"The registry holds {total:,} units under letter {ref}, more than the "
                                  f"{a['max_quantity']:,} it authorises")


def _check(c: dict, latest: dict | None, units: list[dict], auths: dict[str, dict] | None = None,
           ref_totals: dict[str, int] | None = None) -> dict:
    """Check one NER claim against the latest statement's units (see ``check_claims`` for the result shape).

    Args:
        c: the claim; latest: latest statement metadata or None; units: statement rows in the
        claim's serial blocks; auths: letters on file by reference; ref_totals: units per letter.
    """
    res = {"result": "MATCHED", "as_of": latest and latest["as_of"], "statement_id": latest and latest["id"],
           "issues": []}

    def issue(kind, message):
        """Add an issue, keeping only the first message of each kind."""
        if not any(i["kind"] == kind for i in res["issues"]):
            res["issues"].append({"kind": kind, "message": message})

    if not latest:
        res["result"] = "NO_STATEMENT"
        issue("NER_NO_STATEMENT", "No National Emissions Registry statement has been imported, so the units cannot be checked")
        return res
    if latest["as_of"] < c["cancelled_on"]:
        res["result"] = "STALE"
        issue("NER_STATEMENT_OLDER", f"The latest registry statement ({latest['as_of']}) predates the claimed cancellation "
                                     f"({c['cancelled_on']}); import a newer statement to check it")
        return res
    block = c["serial_block"].strip().lower()
    rows = [u for u in units if u["serial_block"].strip().lower() == block]
    if c["serial_start"] is not None:
        rows = [u for u in rows if u["serial_start"] <= c["serial_end"] and c["serial_start"] <= u["serial_end"]]
        found = sum(min(u["serial_end"], c["serial_end"]) - max(u["serial_start"], c["serial_start"]) + 1 for u in rows)
    else:
        found = sum(u["serial_end"] - u["serial_start"] + 1 for u in rows)
    span = f"{c['serial_block']}" + (f" {c['serial_start']}–{c['serial_end']}" if c["serial_start"] is not None else "")
    if found < c["quantity"]:
        issue("NER_NOT_FOUND", f"Only {found:,} of the {c['quantity']:,} units ({span}) appear in the registry statement of {latest['as_of']}")
    me = (c.get("icao_designator") or "").upper()
    for u in rows:
        s = f"{u['serial_block']} {u['serial_start']}–{u['serial_end']}"
        if "CORSIA" not in u["authorised_uses"].split(";") or not u["authorisation_ref"]:
            issue("NER_NOT_AUTHORISED", f"Units {s} are not authorised for CORSIA use in the registry")
        if not u["corresponding_adjustment"]:
            issue("NER_NO_ADJUSTMENT", f"No corresponding adjustment is recorded for units {s}")
        if u["status"] != "CANCELLED":
            issue("NER_NOT_CANCELLED", f"Units {s} are {u['status'].lower()} in the registry, not cancelled")
        elif u["cancelled_for"] != "CORSIA":
            issue("NER_NOT_CANCELLED", f"Units {s} were cancelled for {u['cancelled_for'] or 'an unstated purpose'}, not CORSIA")
        elif u["cancelled_by"] and me and u["cancelled_by"] != me:
            issue("NER_CANCELLED_BY_OTHER", f"Units {s} were cancelled by {u['cancelled_by']}, not {me}")
        if u["status"] == "CANCELLED" and c["registry_reference"] and u["cancellation_ref"] \
                and u["cancellation_ref"].strip().lower() != c["registry_reference"].strip().lower():
            issue("NER_REFERENCE_MISMATCH", f"The registry's cancellation reference for {s} is {u['cancellation_ref']}, "
                                            f"not {c['registry_reference']}")
        if u["vintage"] != c["vintage"]:
            issue("NER_VINTAGE_MISMATCH", f"Units {s} are vintage {u['vintage']} in the registry; the claim says {c['vintage']}")
        _check_authorisation(u, s, auths or {}, ref_totals or {}, issue)
    if any(_SEVERITY[i["kind"]] != "low" for i in res["issues"]):
        res["result"] = "PROBLEMS"
    return res


# ── outbound: state report ─────────────────────────────────────────────────

def state_report(reg: dict, checks: dict[int, dict], prepared_by: str) -> dict:
    """Package a compliance period's register for submission to the NER."""
    ops = []
    for o in reg["operators"]:
        ops.append({
            "icao_designator": o["icao_designator"], "name": o["name"], "status": o["status"],
            "years": [{"year": y["year"],
                       "verified_co2_t": y["report"] and y["report"]["verified_co2_t"],
                       "growth_factor": y["report"] and y["report"]["growth_factor"],
                       "report_reference": y["report"] and y["report"]["reference"],
                       "verifier": y["report"] and y["report"]["verifier"],
                       "offsetting_requirement_t": y["offsetting_requirement_t"],
                       "eligible_fuel_reduction_t": y["cef_reduction_t"]} for y in o["years"]],
            "offsetting_requirement_t": o["offsetting_requirement_t"],
            "eligible_fuel_reduction_t": o["cef_reduction_t"],
            "final_requirement_t": o["final_requirement_t"],
            "verified_units": o["verified_units"], "shortfall_units": o["shortfall_units"]})
    cancellations = [{
        "claim_id": c["id"], "operator": c["icao_designator"], "registry": c["registry"],
        "serial_block": c["serial_block"], "serial_start": c["serial_start"], "serial_end": c["serial_end"],
        "quantity": c["quantity"], "vintage": c["vintage"], "project_id": c["project_id"],
        "cancelled_on": c["cancelled_on"], "cancellation_ref": c["registry_reference"],
        "ner_check": checks.get(c["id"], {}).get("result")} for c in reg["claims"] if c["status"] == "VERIFIED"]
    return {
        "format": REPORT_FORMAT, "registry": REGISTRY_NAME,
        "prepared_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "prepared_by": prepared_by,
        "state": "The Bahamas", "compliance_period": reg["period"], "period_label": reg["label"],
        "period_closed": reg["period_closed"],
        "totals": reg["totals"], "operators": ops, "verified_cancellations": cancellations,
        "open_findings": {s: sum(1 for f in reg["findings"] if f["severity"] == s) for s in ("high", "medium", "low")},
        "note": "Prepared from the state's CORSIA oversight register for submission to the National Emissions "
                "Registry. Figures are those verified by the state at the time of preparation.",
    }
