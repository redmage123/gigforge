"""CORSIA oversight register: validation, review workflow, findings, cross-check, API."""

import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from services import carbon_oversight as co
from services.database import get_db

FIRST = "2024-2026"


async def _op(designator="BHS", name="Bahamasair"):
    return (await co.create_operator({"icao_designator": designator, "name": name}, "reg"))["id"]


def _claim(**kw):
    base = {"compliance_period": FIRST, "registry": "Verra", "serial_block": "VCS-981", "serial_start": 1,
            "serial_end": 1000, "quantity": 1000, "vintage": 2022, "cancelled_on": "2025-03-01",
            "project_id": "VCS981", "project_name": "Andros mangroves"}
    return {**base, **kw}


async def test_operator_validation_and_uniqueness():
    await _op()
    with pytest.raises(co.OversightError, match="already registered") as e:
        await _op()
    assert e.value.status == 409
    for bad in ("BH", "B1S", "BHSX"):
        with pytest.raises(co.OversightError, match="three letters"):
            await co.create_operator({"icao_designator": bad, "name": "x"}, "reg")
    with pytest.raises(co.OversightError, match="name is required"):
        await co.create_operator({"icao_designator": "AAL"}, "reg")


async def test_report_revisions_supersede_and_set_requirement():
    op = await _op()
    r1 = await co.add_emission_report(op, {"year": 2024, "verified_co2_t": 50_000, "growth_factor": 0.1}, "reg")
    r2 = await co.add_emission_report(op, {"year": 2024, "verified_co2_t": 60_000, "growth_factor": 0.1}, "reg")
    assert (r1["revision"], r2["revision"], r2["offsetting_requirement_t"]) == (1, 2, 6000)
    reg = await co.register(FIRST)
    row = reg["operators"][0]
    assert row["offsetting_requirement_t"] == 6000          # latest revision only
    detail = await co.operator_detail(op)
    assert [r["superseded"] for r in detail["reports"]] == [True, False]
    for bad in ({"year": 2024, "verified_co2_t": -1, "growth_factor": 0.1},
                {"year": 2024, "verified_co2_t": 10, "growth_factor": 1.5},
                {"year": 2024, "verified_co2_t": 10},
                {"year": 2099, "verified_co2_t": 10, "growth_factor": 0.1}):
        with pytest.raises(co.OversightError):
            await co.add_emission_report(op, bad, "reg")


async def test_claim_validation():
    op = await _op()
    with pytest.raises(co.OversightError, match="holds 1,000 units but quantity is 999"):
        await co.add_unit_claim(op, _claim(quantity=999), "reg")
    with pytest.raises(co.OversightError, match="end must not be before"):
        await co.add_unit_claim(op, _claim(serial_start=50, serial_end=10, quantity=1), "reg")
    with pytest.raises(co.OversightError, match="Unknown compliance period"):
        await co.add_unit_claim(op, _claim(compliance_period="2020-2022"), "reg")
    future = (datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat()
    with pytest.raises(co.OversightError, match="future"):
        await co.add_unit_claim(op, _claim(cancelled_on=future), "reg")
    with pytest.raises(co.OversightError, match="Operator not found"):
        await co.add_unit_claim(999, _claim(), "reg")
    # No numeric range: quantity stands alone.
    ok = await co.add_unit_claim(op, _claim(serial_start=None, serial_end=None, quantity=7), "reg")
    assert ok["status"] == "PENDING"


async def test_review_workflow_transitions():
    op = await _op()
    cid = (await co.add_unit_claim(op, _claim(), "reg"))["id"]
    with pytest.raises(co.OversightError, match="reason is required"):
        await co.review_claim(cid, {"decision": "REJECTED"}, "rev")
    with pytest.raises(co.OversightError, match="pending claim cannot be marked reopened"):
        await co.review_claim(cid, {"decision": "REOPENED", "reason": "why"}, "rev")
    assert (await co.review_claim(cid, {"decision": "VERIFIED"}, "rev"))["status"] == "VERIFIED"
    with pytest.raises(co.OversightError, match="verified claim cannot be marked verified"):
        await co.review_claim(cid, {"decision": "verified"}, "rev")
    await co.review_claim(cid, {"decision": "REOPENED", "reason": "registry shows a different holder"}, "rev")
    await co.review_claim(cid, {"decision": "REJECTED", "reason": "units not cancelled"}, "rev")
    detail = await co.operator_detail(op)
    assert [r["decision"] for r in detail["claims"][0]["reviews"]] == ["VERIFIED", "REOPENED", "REJECTED"]
    with pytest.raises(co.OversightError, match="Claim not found"):
        await co.review_claim(999, {"decision": "VERIFIED"}, "rev")


async def test_evidence_is_append_only():
    op = await _op()
    await co.add_emission_report(op, {"year": 2024, "verified_co2_t": 1, "growth_factor": 0.1}, "reg")
    cid = (await co.add_unit_claim(op, _claim(), "reg"))["id"]
    await co.review_claim(cid, {"decision": "VERIFIED"}, "rev")
    async with get_db() as db:
        for sql in ("UPDATE carbon_unit_claims SET quantity = 1", "DELETE FROM carbon_unit_claims",
                    "UPDATE carbon_emission_reports SET verified_co2_t = 0", "DELETE FROM carbon_emission_reports",
                    "UPDATE carbon_claim_reviews SET decision = 'REJECTED'", "DELETE FROM carbon_claim_reviews"):
            with pytest.raises(sqlite3.IntegrityError, match="append-only"):
                await db.execute(sql)


async def test_coverage_status_and_shortfall():
    op = await _op()
    await co.add_emission_report(op, {"year": 2024, "verified_co2_t": 20_000, "growth_factor": 0.1}, "reg")  # 2,000
    c1 = (await co.add_unit_claim(op, _claim(), "reg"))["id"]                                                # 1,000
    c2 = (await co.add_unit_claim(op, _claim(serial_start=1001, serial_end=2000), "reg"))["id"]              # 1,000
    row = (await co.register(FIRST))["operators"][0]
    assert (row["status"], row["pending_units"], row["shortfall_units"]) == ("AWAITING_REVIEW", 2000, 2000)
    await co.review_claim(c1, {"decision": "VERIFIED"}, "rev")
    await co.review_claim(c2, {"decision": "REJECTED", "reason": "not cancelled"}, "rev")
    row = (await co.register(FIRST))["operators"][0]
    assert (row["status"], row["verified_units"], row["rejected_units"], row["shortfall_units"]) == \
        ("SHORTFALL", 1000, 1000, 1000)


async def test_findings_double_claim_ineligible_vintage():
    bhs, aal = await _op(), await _op("AAL", "American Airlines")
    await co.add_unit_claim(bhs, _claim(), "reg")
    # Overlapping serials, other operator, same registry/block (case-insensitive).
    await co.add_unit_claim(aal, _claim(registry="verra", serial_block="vcs-981", serial_start=900,
                                        serial_end=1099, quantity=200), "reg")
    # Adjacent range: not a double claim.
    await co.add_unit_claim(aal, _claim(serial_start=1100, serial_end=1199, quantity=100), "reg")
    await co.add_unit_claim(aal, _claim(serial_block="GS-1", serial_start=1, serial_end=10, quantity=10,
                                        declared_eligible=False, vintage=2019), "reg")
    reg = await co.register(FIRST)
    kinds = {(f["kind"], f["operator"], f["claim_id"]) for f in reg["findings"]}
    assert ("DOUBLE_CLAIM", "AAL", 2) in kinds
    assert not any(k == "DOUBLE_CLAIM" and c == 3 for k, _, c in kinds)
    assert ("INELIGIBLE_UNIT", "AAL", 4) in kinds
    assert ("VINTAGE_OUTSIDE_WINDOW", "AAL", 4) in kinds
    assert reg["findings"][0]["severity"] == "high"          # sorted most severe first
    # A rejected duplicate stops being a finding.
    await co.review_claim(2, {"decision": "REJECTED", "reason": "duplicate"}, "rev")
    kinds = {(f["kind"], f["claim_id"]) for f in (await co.register(FIRST))["findings"]}
    assert ("DOUBLE_CLAIM", 2) not in kinds


async def test_missing_report_and_closed_period_shortfall():
    op = await _op()
    pilot = await co.register("2021-2023")
    kinds = [(f["kind"], f["message"]) for f in pilot["findings"]]
    assert ("MISSING_REPORT", "No verified emissions report for 2021") in kinds
    await co.add_emission_report(op, {"year": 2022, "verified_co2_t": 10_000, "growth_factor": 0.2}, "reg")
    pilot = await co.register("2021-2023")
    assert pilot["period_closed"] is True
    assert any(f["kind"] == "SHORTFALL" and "2,000 units outstanding" in f["message"] for f in pilot["findings"])


async def test_observations_segments_and_cross_check():
    op = await _op()
    t0 = datetime(2025, 6, 1, 12, 0, tzinfo=timezone.utc)
    jet = {"icao24": "ABC123", "callsign": "BHS201 ", "category": 4}
    for m in range(0, 30):                       # 30 one-minute sightings → one 30-min segment
        await co.record_observations([jet, {"icao24": "n1", "callsign": "N123AB"},     # GA: no designator
                                      {"icao24": "s1", "callsign": "BHS9", "simulated": True, "category": 4}],
                                     now=t0 + timedelta(minutes=m))
    await co.record_observations([jet], now=t0 + timedelta(hours=3))                 # after a gap: new segment
    obs = (await co.observed_emissions(2025))["BHS"]
    assert (obs["live_segments"], obs["simulated_segments"]) == (2, 1)
    large = co.FUEL_BURN_RATES["large"] * co.CO2_PER_KG_FUEL / 1000                    # t CO2 per hour
    assert obs["live_co2_t"] == pytest.approx(large * (30 + 1) / 60, abs=0.1)

    # Report lower than what BACSWN saw in the FIR → high finding; simulated data never counts.
    await co.add_emission_report(op, {"year": 2025, "verified_co2_t": 1, "growth_factor": 0.1}, "reg")
    reg = await co.register(FIRST)
    assert any(f["kind"] == "BELOW_OBSERVED" for f in reg["findings"])
    y = next(y for y in reg["operators"][0]["years"] if y["year"] == 2025)
    assert y["observed_live_co2_t"] == obs["live_co2_t"] and y["observed_simulated_co2_t"] > 0


def test_designator_parsing():
    assert co.designator_for("BHS201") == "BHS"
    assert co.designator_for("aal1492") == "AAL"
    assert co.designator_for("N123AB") is None
    assert co.designator_for("") is None


async def test_csv_export_neutralises_formulas():
    op = await _op()
    await co.add_unit_claim(op, _claim(project_name="=HYPERLINK(\"http://x\")"), "reg")
    text = await co.export_csv(FIRST)
    assert "'=HYPERLINK" in text and text.startswith("claim_id,operator")


# ── API ─────────────────────────────────────────────────────────────────────

async def test_api_reads_open_writes_admin_only(client, auth_token, admin_headers):
    # The middleware prefers the session cookie over the header; drop the one the
    # logins left behind so each request runs as the user its header names.
    client.cookies.clear()
    user = {"Authorization": f"Bearer {auth_token}"}
    assert (await client.get("/api/carbon-oversight/periods", headers=user)).status_code == 200
    r = await client.post("/api/carbon-oversight/operators", json={"icao_designator": "BHS", "name": "x"}, headers=user)
    assert r.status_code == 403
    r = await client.post("/api/carbon-oversight/operators", json={"icao_designator": "BHS", "name": "Bahamasair"},
                          headers=admin_headers)
    assert r.status_code == 200
    op = r.json()["id"]
    r = await client.post(f"/api/carbon-oversight/operators/{op}/claims", json=_claim(), headers=admin_headers)
    assert r.status_code == 200
    cid = r.json()["id"]
    assert (await client.post(f"/api/carbon-oversight/claims/{cid}/review", json={"decision": "VERIFIED"},
                              headers=user)).status_code == 403
    r = await client.post(f"/api/carbon-oversight/claims/{cid}/review", json={"decision": "VERIFIED"},
                          headers=admin_headers)
    assert r.json()["status"] == "VERIFIED"
    reg = (await client.get(f"/api/carbon-oversight/register?period={FIRST}", headers=user)).json()
    assert reg["claims"][0]["status"] == "VERIFIED" and reg["claims"][0]["created_by"] == "testadmin"
    csv_resp = await client.get(f"/api/carbon-oversight/register.csv?period={FIRST}", headers=user)
    assert csv_resp.headers["content-type"].startswith("text/csv") and "VERIFIED" in csv_resp.text
    assert (await client.get(f"/api/carbon-oversight/operators/{op}", headers=user)).status_code == 200


async def test_api_errors(client, admin_headers):
    client.cookies.clear()
    assert (await client.get("/api/carbon-oversight/register?period=1999", headers=admin_headers)).status_code == 400
    assert (await client.get("/api/carbon-oversight/register.csv?period=1999", headers=admin_headers)).status_code == 400
    assert (await client.get("/api/carbon-oversight/operators/42", headers=admin_headers)).status_code == 404
    r = await client.post("/api/carbon-oversight/operators", content=b"not json",
                          headers={**admin_headers, "content-type": "application/json"})
    assert r.status_code == 400 and "required" in r.json()["error"]
    assert (await client.get("/api/carbon-oversight/periods")).status_code == 401
