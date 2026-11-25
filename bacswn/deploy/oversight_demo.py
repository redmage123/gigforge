"""Seed or remove demo data in the CORSIA oversight register.

    python deploy/oversight_demo.py seed     # add the demo operators (no-op if present)
    python deploy/oversight_demo.py purge    # remove them again
    python deploy/oversight_demo.py status

On prod, run inside the container:
    docker exec -i bacswn-skywatch python - seed < deploy/oversight_demo.py

The operators are fictional and named "(demo)". Every row is recorded by the
user "demo-seed", which is how purge finds them. The register is append-only
(SQLite triggers); purge lifts the triggers only for its own delete and then
restores them. Rows recorded by real users are never touched, except reviews
someone added to a demo claim, which go with that claim.
"""

import asyncio
import json
import os
import sys

sys.path.insert(0, os.getcwd())

from services import carbon_oversight as co  # noqa: E402
from services import ner_registry as ner  # noqa: E402
from services.database import _SCHEMA_SQL, get_db, init_db  # noqa: E402

SEED_USER = "demo-seed"
GROWTH = 0.06      # illustrative; real values are published by ICAO each year

OPERATORS = [
    ("CWA", "Coral Wing Airways (demo)", "Fully covered: every claim verified."),
    ("LAL", "Lucaya Air Link (demo)", "Enough units claimed, still awaiting review."),
    ("EIH", "Exuma Island Hopper (demo)", "Shortfall, a duplicate claim, a rejected claim, an out-of-window vintage."),
    ("ASC", "Atlantic Sun Charter (demo)", "Missing report, ineligible units, closed pilot period short."),
]

# (designator, year, verified tCO2, verifier, reference)
REPORTS = [
    ("CWA", 2021, 96_400, "Caribbean Verification Ltd (demo)", "CWA-ER-2021"),
    ("CWA", 2022, 118_900, "Caribbean Verification Ltd (demo)", "CWA-ER-2022"),
    ("CWA", 2023, 131_200, "Caribbean Verification Ltd (demo)", "CWA-ER-2023"),
    ("CWA", 2024, 140_000, "Caribbean Verification Ltd (demo)", "CWA-ER-2024"),
    ("CWA", 2024, 142_350, "Caribbean Verification Ltd (demo)", "CWA-ER-2024-R1"),  # revision supersedes
    ("CWA", 2025, 149_800, "Caribbean Verification Ltd (demo)", "CWA-ER-2025"),
    ("LAL", 2024, 61_200, "Nassau Assurance Partners (demo)", "LAL-ER-2024"),
    ("LAL", 2025, 64_700, "Nassau Assurance Partners (demo)", "LAL-ER-2025"),
    ("EIH", 2024, 38_500, "Nassau Assurance Partners (demo)", "EIH-ER-2024"),
    ("EIH", 2025, 41_900, "Nassau Assurance Partners (demo)", "EIH-ER-2025"),
    ("ASC", 2022, 12_300, "Island Audit Group (demo)", "ASC-ER-2022"),
    ("ASC", 2024, 15_800, "Island Audit Group (demo)", "ASC-ER-2024"),
]

# (designator, period, registry, block, start, end, vintage, project, cancelled, ref, eligible, review)
# review: None = pending, ("VERIFIED", "") or ("REJECTED", reason)
CLAIMS = [
    ("CWA", "2021-2023", "Verra (VCS)", "VCS-1748-DEMO", 1, 20_790, 2019,
     "Andros blue-carbon mangroves (demo)", "2024-11-18", "VCS-CXL-50211", True, ("VERIFIED", "")),
    ("CWA", "2024-2026", "Verra (VCS)", "VCS-1748-DEMO", 20_791, 29_331, 2023,
     "Andros blue-carbon mangroves (demo)", "2025-04-22", "VCS-CXL-61877", True, ("VERIFIED", "")),
    ("CWA", "2024-2026", "Gold Standard", "GS-5521-DEMO", 1, 8_988, 2024,
     "Abaco solar microgrid (demo)", "2026-04-09", "GS-RET-11902", True, ("VERIFIED", "")),
    ("LAL", "2024-2026", "American Carbon Registry", "ACR-903-DEMO", 1, 7_600, 2022,
     "Eleuthera landfill gas capture (demo)", "2026-03-30", "ACR-CXL-7745", True, None),
    ("LAL", "2024-2026", "Verra (VCS)", "VCS-2290-DEMO", 1, 300, 2023,
     "Long Island seagrass (demo)", "2026-05-14", "VCS-CXL-63010", True, None),
    # Overlaps CWA's 2024–2026 Verra block: the same units claimed twice.
    ("EIH", "2024-2026", "Verra (VCS)", "VCS-1748-DEMO", 28_001, 29_500, 2023,
     "Andros blue-carbon mangroves (demo)", "2025-09-02", "VCS-CXL-61877", True, None),
    ("EIH", "2024-2026", "Gold Standard", "GS-4410-DEMO", 1, 1_200, 2019,
     "Cookstoves (demo)", "2025-06-11", "GS-RET-10333", True, None),
    ("EIH", "2024-2026", "Climate Action Reserve", "CAR-77-DEMO", 1, 900, 2022,
     "Forest carbon (demo)", "2025-07-01", "", True,
     ("REJECTED", "Registry shows these units still active, not cancelled")),
    ("ASC", "2021-2023", "Verra (VCS)", "VCS-3301-DEMO", 1, 400, 2018,
     "Grand Bahama wetland (demo)", "2024-12-05", "VCS-CXL-50990", True, ("VERIFIED", "")),
    ("ASC", "2024-2026", "Unlisted programme", "UNL-12-DEMO", 1, 950, 2023,
     "Unverified reforestation (demo)", "2026-02-17", "", False, None),
]


# A fictional National Emissions Registry statement. The real registry had issued
# no units as of November 2026; these exist only to show the claim checks.
NER_AS_OF = "2026-11-20"
NER_REF = "NER-DEMO-2026-11 (fictional units)"
NER_UNITS = [
    {"serial_block": "BS-NER-SG-DEMO", "serial_start": 1, "serial_end": 5_000, "vintage": 2025, "status": "CANCELLED",
     "authorisation_ref": "BS-LOA-DEMO-001", "authorised_uses": ["CORSIA"], "corresponding_adjustment": True,
     "cancelled_for": "CORSIA", "cancelled_by": "LAL", "cancellation_ref": "NER-CXL-0042", "cancelled_on": "2026-06-10",
     "project_id": "BS-PRJ-DEMO-01", "project_name": "Little Bahama Bank seagrass (demo)"},
    {"serial_block": "BS-NER-SG-DEMO", "serial_start": 5_001, "serial_end": 8_000, "vintage": 2025, "status": "ISSUED",
     "authorisation_ref": "BS-LOA-DEMO-001", "authorised_uses": ["CORSIA"], "corresponding_adjustment": True,
     "project_id": "BS-PRJ-DEMO-01", "project_name": "Little Bahama Bank seagrass (demo)"},
    {"serial_block": "BS-NER-MG-DEMO", "serial_start": 1, "serial_end": 500, "vintage": 2025, "status": "CANCELLED",
     "authorisation_ref": "BS-LOA-DEMO-002", "authorised_uses": ["NDC"], "corresponding_adjustment": False,
     "cancelled_for": "CORSIA", "cancelled_by": "EIH", "cancellation_ref": "NER-CXL-0057", "cancelled_on": "2026-07-15",
     "project_id": "BS-PRJ-DEMO-02", "project_name": "North Andros mangroves (demo)"},
]
# (designator, block, start, end, cancelled_on, ref, project): all left pending review.
NER_CLAIMS = [
    ("LAL", "BS-NER-SG-DEMO", 1, 5_000, "2026-06-10", "NER-CXL-0042", "Little Bahama Bank seagrass (demo)"),   # matches
    ("EIH", "BS-NER-SG-DEMO", 5_001, 5_300, "2026-07-01", "NER-CXL-0061", "Little Bahama Bank seagrass (demo)"),  # not cancelled
    ("EIH", "BS-NER-MG-DEMO", 1, 500, "2026-07-15", "NER-CXL-0057", "North Andros mangroves (demo)"),  # not authorised, no CA
]


async def seed_ner(ids: dict) -> None:
    async with get_db() as db:
        if await (await db.execute("SELECT 1 FROM ner_statements WHERE imported_by = ?", [SEED_USER])).fetchone():
            print("Demo registry statement already present; nothing added.")
            return
    await ner.import_statement({"format": "json", "content": json.dumps(
        {"as_of": NER_AS_OF, "reference": NER_REF, "units": NER_UNITS})}, SEED_USER)
    for d, block, start, end, cancelled, ref, project in NER_CLAIMS:
        await co.add_unit_claim(ids[d], {
            "compliance_period": "2024-2026", "registry": ner.REGISTRY_NAME, "serial_block": block,
            "serial_start": start, "serial_end": end, "quantity": end - start + 1, "vintage": 2025,
            "project_name": project, "cancelled_on": cancelled, "registry_reference": ref,
            "declared_eligible": True, "notes": "Demo data"}, SEED_USER)
    print(f"Seeded a demo registry statement ({len(NER_UNITS)} rows) and {len(NER_CLAIMS)} registry claims.")


# Unusual-figure signals and a recorded letter of authorisation (all fictional).
# ASC 2025: verified CO2 nearly doubles on 2024 and uses a different growth factor.
EXTRA_REPORT = ("ASC", 2025, 31_000, 0.05, "Island Audit Group (demo)", "ASC-ER-2025")
# EIH: three near-identical SAF claims from one producer in 2025 (possible split batch), left pending.
EXTRA_FUEL = [("EIH", 2025, mass, f"EIH-SAF-2025-0{i}") for i, mass in enumerate((41.5, 42.0, 43.1), start=1)]
DEMO_LOA = {"reference": "BS-LOA-DEMO-001", "issue_date": "2026-03-02",
            "issuing_body": "Office of the Prime Minister, Climate Change and Environment (demo)",
            "authorised_uses": "CORSIA", "corresponding_adjustment": True, "vintage_from": 2024, "vintage_to": 2026,
            "max_quantity": 10_000, "serial_blocks": "BS-NER-SG-DEMO", "project_id": "BS-PRJ-DEMO-01",
            "project_name": "Little Bahama Bank seagrass (demo)", "notes": "Demo data: fictional letter"}


async def seed_extras(ids: dict) -> None:
    async with get_db() as db:
        done = await (await db.execute("SELECT 1 FROM ner_authorisations WHERE created_by = ?", [SEED_USER])).fetchone()
    if done:
        print("Demo signals and letter already present; nothing added.")
        return
    d, year, co2, gf, verifier, ref = EXTRA_REPORT
    await co.add_emission_report(ids[d], {"year": year, "verified_co2_t": co2, "growth_factor": gf, "verifier": verifier,
                                          "reference": ref, "notes": "Demo data; growth factor differs on purpose"}, SEED_USER)
    for d, year, mass, batch in EXTRA_FUEL:
        await co.add_fuel_claim(ids[d], {"year": year, "fuel_type": "SAF", "mass_t": mass, "ls_value": 20.0,
                                         "ls_basis": "DEFAULT", "batch_id": batch, "scheme": "ISCC CORSIA",
                                         "pathway": "HEFA", "feedstock": "Used cooking oil",
                                         "producer": "Caribbean Renewable Fuels (demo)", "notes": "Demo data"}, SEED_USER)
    await ner.add_authorisation(DEMO_LOA, SEED_USER)
    print("Seeded demo signals (ASC 2025 report, 3 EIH fuel claims) and a demo letter of authorisation.")


async def _demo_ops(db):
    rows = await (await db.execute(
        "SELECT id, icao_designator FROM carbon_operators WHERE created_by = ?", [SEED_USER])).fetchall()
    return {r[1]: r[0] for r in rows}


async def seed():
    await init_db()
    async with get_db() as db:
        existing = await _demo_ops(db)
        taken = [d for d, _, _ in OPERATORS if d not in existing and await (await db.execute(
            "SELECT 1 FROM carbon_operators WHERE icao_designator = ?", [d])).fetchone()]
    if existing:
        print(f"Demo operators already present ({', '.join(sorted(existing))}).")
        if all(d in existing for d, *_ in NER_CLAIMS):
            await seed_ner(existing)
            await seed_extras(existing)
        return
    if taken:
        sys.exit(f"Designators already used by real operators: {', '.join(taken)}. Not seeding.")
    ids = {}
    for d, name, notes in OPERATORS:
        ids[d] = (await co.create_operator({"icao_designator": d, "name": name, "notes": notes}, SEED_USER))["id"]
    for d, year, co2, verifier, ref in REPORTS:
        await co.add_emission_report(ids[d], {"year": year, "verified_co2_t": co2, "growth_factor": GROWTH,
                                              "verifier": verifier, "reference": ref,
                                              "notes": "Demo data; illustrative growth factor"}, SEED_USER)
    for d, period, registry, block, start, end, vintage, project, cancelled, ref, eligible, review in CLAIMS:
        claim = await co.add_unit_claim(ids[d], {
            "compliance_period": period, "registry": registry, "serial_block": block,
            "serial_start": start, "serial_end": end, "quantity": end - start + 1, "vintage": vintage,
            "project_name": project, "cancelled_on": cancelled, "registry_reference": ref,
            "declared_eligible": eligible, "notes": "Demo data"}, SEED_USER)
        if review:
            await co.review_claim(claim["id"], {"decision": review[0], "reason": review[1]}, SEED_USER)
    print(f"Seeded {len(OPERATORS)} demo operators, {len(REPORTS)} reports, {len(CLAIMS)} claims.")
    await seed_ner(ids)
    await seed_extras(ids)
    await status()


_TRIGGERS = [f"{t}_immutable_{op}" for t in ("carbon_reports", "carbon_claims", "carbon_reviews",
                                              "ner_statements", "ner_units", "ner_authorisations",
                                              "carbon_fuel_claims", "carbon_fuel_reviews") for op in "ud"]


async def purge():
    async with get_db() as db:
        ops = await _demo_ops(db)
        has_ner = await (await db.execute("SELECT 1 FROM ner_statements WHERE imported_by = ? UNION "
                                          "SELECT 1 FROM ner_authorisations WHERE created_by = ?",
                                          [SEED_USER, SEED_USER])).fetchone()
        if not ops and not has_ner:
            print("No demo data to remove.")
            return
        ids = list(ops.values()) or [-1]
        marks = ",".join("?" * len(ids))
        try:
            await db.execute("BEGIN IMMEDIATE")
            for t in _TRIGGERS:
                await db.execute(f"DROP TRIGGER IF EXISTS {t}")
            await db.execute("DELETE FROM ner_units WHERE statement_id IN "
                             "(SELECT id FROM ner_statements WHERE imported_by = ?)", [SEED_USER])
            await db.execute("DELETE FROM ner_statements WHERE imported_by = ?", [SEED_USER])
            await db.execute("DELETE FROM ner_authorisations WHERE created_by = ?", [SEED_USER])
            await db.execute(f"DELETE FROM carbon_fuel_reviews WHERE claim_id IN "
                             f"(SELECT id FROM carbon_fuel_claims WHERE operator_id IN ({marks}))", ids)
            await db.execute(f"DELETE FROM carbon_fuel_claims WHERE operator_id IN ({marks})", ids)
            await db.execute(f"DELETE FROM carbon_claim_reviews WHERE claim_id IN "
                             f"(SELECT id FROM carbon_unit_claims WHERE operator_id IN ({marks}))", ids)
            await db.execute(f"DELETE FROM carbon_unit_claims WHERE operator_id IN ({marks})", ids)
            await db.execute(f"DELETE FROM carbon_emission_reports WHERE operator_id IN ({marks})", ids)
            await db.execute(f"DELETE FROM carbon_operators WHERE id IN ({marks})", ids)
            await db.commit()
        except BaseException:
            await db.rollback()
            raise
        finally:
            await db.executescript(_SCHEMA_SQL)   # restores the append-only triggers
        left = await (await db.execute(
            f"SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name IN ({','.join('?' * len(_TRIGGERS))})",
            _TRIGGERS)).fetchone()
    print(f"Removed demo operators {', '.join(sorted(ops)) or '(none)'} and the demo registry statement. Append-only triggers in place: {left[0]}/{len(_TRIGGERS)}.")


async def status():
    for period in ("2021-2023", "2024-2026"):
        reg = await co.register(period)
        print(f"\n{period}: requirement {reg['totals']['offsetting_requirement_t']:,} | verified "
              f"{reg['totals']['verified_units']:,} | pending {reg['totals']['pending_units']:,} | "
              f"shortfall {reg['totals']['shortfall_units']:,}")
        for o in reg["operators"]:
            print(f"  {o['icao_designator']} {o['status']:<16} req {o['offsetting_requirement_t']:>6,} "
                  f"verified {o['verified_units']:>6,} pending {o['pending_units']:>6,}")
        for f in reg["findings"]:
            print(f"  [{f['severity']}] {f['operator']} {f['kind']}: {f['message']}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    asyncio.run({"seed": seed, "purge": purge, "status": status}[cmd]())
