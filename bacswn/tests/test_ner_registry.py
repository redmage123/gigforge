"""Bahamas National Emissions Registry exchange: statements, claim checks, state report, API."""

import json
import sqlite3

import pytest

from services import carbon_oversight as co
from services import ner_registry as ner
from services.database import get_db

FIRST = "2024-2026"
NER = "Bahamas National Emissions Registry"


def _unit(**kw):
    base = {"serial_block": "BS-NER-SG", "serial_start": 1, "serial_end": 1000, "vintage": 2025,
            "status": "CANCELLED", "authorisation_ref": "BS-LOA-1", "authorised_uses": ["CORSIA"],
            "corresponding_adjustment": True, "cancelled_for": "CORSIA", "cancelled_by": "BHS",
            "cancellation_ref": "NER-CXL-1", "cancelled_on": "2026-06-10", "project_name": "Seagrass"}
    return {**base, **kw}


def _statement(units, as_of="2026-11-20", reference="NER-2026-11"):
    return {"format": "json", "content": json.dumps({"as_of": as_of, "reference": reference, "units": units})}


async def _op(designator="BHS"):
    return (await co.create_operator({"icao_designator": designator, "name": designator + " air"}, "reg"))["id"]


async def _claim(op, **kw):
    base = {"compliance_period": FIRST, "registry": NER, "serial_block": "BS-NER-SG", "serial_start": 1,
            "serial_end": 1000, "quantity": 1000, "vintage": 2025, "cancelled_on": "2026-06-10",
            "registry_reference": "NER-CXL-1"}
    return (await co.add_unit_claim(op, {**base, **kw}, "reg"))["id"]


async def _check(claim_id):
    reg = await co.register(FIRST)
    claim = next(c for c in reg["claims"] if c["id"] == claim_id)
    kinds = {f["kind"] for f in reg["findings"] if f["claim_id"] == claim_id}
    return claim["ner_check"], kinds


def test_registry_name_matching():
    for name in (NER, "national emissions registry", "NER", "Bahamas NER", "National Emission Registry (Bahamas)"):
        assert ner.is_ner(name)
    for name in ("Verra (VCS)", "Gold Standard", "", None, "Nerva"):
        assert not ner.is_ner(name)


def test_parse_json_and_csv():
    meta, units = ner.parse_statement(_statement([_unit()])["content"], "json")
    assert meta == {"as_of": "2026-11-20", "reference": "NER-2026-11"}
    assert units[0]["authorised_uses"] == "CORSIA" and units[0]["corresponding_adjustment"] is True
    _, units = ner.parse_statement(ner.template_csv(), "csv")
    assert units[0]["serial_block"] == "BS-NER-EXAMPLE" and units[0]["status"] == "CANCELLED"
    csv_text = ("serial_block,serial_start,serial_end,vintage,status,authorised_uses,corresponding_adjustment\n"
                "B,1,10,2025,issued,corsia; ndc,no\n")
    _, units = ner.parse_statement(csv_text, "csv")
    assert units[0]["status"] == "ISSUED" and units[0]["authorised_uses"] == "CORSIA;NDC"
    assert units[0]["corresponding_adjustment"] is False


@pytest.mark.parametrize("content,fmt,msg", [
    ("", "json", "empty"),
    ("{not json", "json", "not valid JSON"),
    ('{"units": []}', "json", "no units"),
    ("[1, 2]", "json", "units"),
    ("serial_block,serial_start\nB,1\n", "csv", "missing columns"),
    ("x", "xml", "json or csv"),
])
def test_parse_rejects_malformed(content, fmt, msg):
    with pytest.raises(ner.RegistryError, match=msg):
        ner.parse_statement(content, fmt)


@pytest.mark.parametrize("bad,msg", [
    ({"serial_end": 0, "serial_start": 5}, "before serial_start"),
    ({"status": "LOST"}, "status must be"),
    ({"serial_start": "one"}, "whole number"),
    ({"corresponding_adjustment": "maybe"}, "yes or no"),
    ({"cancelled_on": ""}, "needs cancelled_on"),
    ({"cancelled_on": "2099-01-01"}, "future"),
    ({"serial_block": ""}, "serial_block is required"),
])
def test_parse_rejects_bad_units(bad, msg):
    with pytest.raises(ner.RegistryError, match=msg):
        ner.parse_statement(_statement([_unit(**bad)])["content"], "json")


def test_parse_rejects_overlapping_rows():
    units = [_unit(), _unit(serial_start=900, serial_end=1100)]
    with pytest.raises(ner.RegistryError, match="more than one row"):
        ner.parse_statement(_statement(units)["content"], "json")
    # Same serials in different blocks are fine.
    ner.parse_statement(_statement([_unit(), _unit(serial_block="OTHER")])["content"], "json")


async def test_import_is_append_only_and_deduplicated():
    r = await ner.import_statement(_statement([_unit(), _unit(serial_start=1001, serial_end=1500, status="ISSUED",
                                                              cancelled_on="")]), "admin")
    assert (r["unit_rows"], r["units_total"], r["as_of"]) == (2, 1500, "2026-11-20")
    with pytest.raises(ner.RegistryError, match="already been imported") as e:
        await ner.import_statement(_statement([_unit(), _unit(serial_start=1001, serial_end=1500, status="ISSUED",
                                                                  cancelled_on="")]), "admin")
    assert e.value.status == 409
    with pytest.raises(ner.RegistryError, match="as of"):
        await ner.import_statement({"format": "json", "content": json.dumps({"units": [_unit()]})}, "admin")
    async with get_db() as db:
        for sql in ("UPDATE ner_units SET status = 'ISSUED'", "DELETE FROM ner_units",
                    "UPDATE ner_statements SET as_of = '2020-01-01'", "DELETE FROM ner_statements"):
            with pytest.raises(sqlite3.IntegrityError, match="append-only"):
                await db.execute(sql)
    s = await ner.status()
    assert s["statements"] == 1 and s["latest"]["reference"] == "NER-2026-11"
    assert s["latest_summary"]["by_status"] == {"CANCELLED": 1000, "ISSUED": 500}
    assert s["latest_summary"]["cancelled_for_corsia"] == 1000 and s["latest_summary"]["corsia_authorised"] == 1500


async def test_claim_matches_registry():
    cid = await _claim(await _op())
    await ner.import_statement(_statement([_unit()]), "admin")
    check, kinds = await _check(cid)
    assert check["result"] == "MATCHED" and check["issues"] == [] and kinds == set()


async def test_claim_without_statement_or_with_older_statement():
    cid = await _claim(await _op())
    check, kinds = await _check(cid)
    assert check["result"] == "NO_STATEMENT" and kinds == {"NER_NO_STATEMENT"}
    await ner.import_statement(_statement([_unit(status="ISSUED", cancelled_on="")], as_of="2026-05-01"), "admin")
    check, kinds = await _check(cid)
    assert check["result"] == "STALE" and kinds == {"NER_STATEMENT_OLDER"}


async def test_latest_statement_wins():
    cid = await _claim(await _op())
    await ner.import_statement(_statement([_unit()], as_of="2026-11-20"), "admin")
    # An older extract imported later does not replace the newer one.
    await ner.import_statement(_statement([_unit(status="ISSUED", cancelled_on="")], as_of="2026-07-01"), "admin")
    check, _ = await _check(cid)
    assert check["result"] == "MATCHED" and check["as_of"] == "2026-11-20"


@pytest.mark.parametrize("unit,expected", [
    ({"authorised_uses": ["NDC"]}, {"NER_NOT_AUTHORISED"}),
    ({"authorisation_ref": ""}, {"NER_NOT_AUTHORISED"}),
    ({"corresponding_adjustment": False}, {"NER_NO_ADJUSTMENT"}),
    ({"status": "ISSUED", "cancelled_on": ""}, {"NER_NOT_CANCELLED"}),
    ({"cancelled_for": "VOLUNTARY"}, {"NER_NOT_CANCELLED"}),
    ({"cancelled_by": "XYZ"}, {"NER_CANCELLED_BY_OTHER"}),
    ({"cancellation_ref": "NER-CXL-9"}, {"NER_REFERENCE_MISMATCH"}),
    ({"vintage": 2024}, {"NER_VINTAGE_MISMATCH"}),
    ({"serial_end": 600}, {"NER_NOT_FOUND"}),
    ({"serial_block": "ELSEWHERE"}, {"NER_NOT_FOUND"}),
])
async def test_claim_problems(unit, expected):
    cid = await _claim(await _op())
    await ner.import_statement(_statement([_unit(**unit)]), "admin")
    check, kinds = await _check(cid)
    assert check["result"] == "PROBLEMS" and kinds == expected
    reg = await co.register(FIRST)
    f = next(f for f in reg["findings"] if f["claim_id"] == cid)
    assert f["severity"] == ner.severity(f["kind"]) and f["message"].startswith(f"Claim #{cid}: ")


async def test_claim_spanning_several_registry_rows():
    cid = await _claim(await _op())
    await ner.import_statement(_statement([_unit(serial_end=400), _unit(serial_start=401, serial_end=1000)]), "admin")
    check, _ = await _check(cid)
    assert check["result"] == "MATCHED"


async def test_only_ner_claims_and_live_claims_are_checked():
    op = await _op()
    other = await _claim(op, registry="Verra (VCS)", serial_block="VCS-1")
    rejected = await _claim(op, serial_block="BS-NER-X")
    await co.review_claim(rejected, {"decision": "REJECTED", "reason": "wrong"}, "reg")
    reg = await co.register(FIRST)
    views = {c["id"]: c for c in reg["claims"]}
    assert views[other]["ner_check"] is None and views[rejected]["ner_check"] is None
    detail = await co.operator_detail(op)
    assert all(c["ner_check"] is None for c in detail["claims"])


async def test_operator_detail_and_csv_carry_the_check():
    op = await _op()
    cid = await _claim(op)
    await ner.import_statement(_statement([_unit(corresponding_adjustment=False)]), "admin")
    detail = await co.operator_detail(op)
    assert detail["claims"][0]["ner_check"]["result"] == "PROBLEMS"
    csv_text = await co.export_csv(FIRST)
    header, row = csv_text.splitlines()[:2]
    assert "ner_check" in header and "PROBLEMS" in row and "NER_NO_ADJUSTMENT" in row
    assert cid


async def test_state_report():
    op = await _op()
    await co.add_emission_report(op, {"year": 2024, "verified_co2_t": 20_000, "growth_factor": 0.05,
                                      "reference": "BHS-ER-2024"}, "reg")
    cid = await _claim(op)
    await co.review_claim(cid, {"decision": "VERIFIED"}, "reg")
    await _claim(op, serial_block="BS-NER-OTHER", serial_start=1, serial_end=10, quantity=10)  # pending: not reported
    await ner.import_statement(_statement([_unit()]), "admin")
    reg = await co.register(FIRST)
    checks = {c["id"]: c["ner_check"] for c in reg["claims"] if c["ner_check"]}
    rep = ner.state_report(reg, checks, "admin")
    assert rep["format"] == ner.REPORT_FORMAT and rep["compliance_period"] == FIRST
    o = rep["operators"][0]
    assert o["icao_designator"] == "BHS" and o["offsetting_requirement_t"] == 1000 and o["verified_units"] == 1000
    y24 = next(y for y in o["years"] if y["year"] == 2024)
    assert y24["verified_co2_t"] == 20_000 and y24["report_reference"] == "BHS-ER-2024"
    assert [c["claim_id"] for c in rep["verified_cancellations"]] == [cid]
    assert rep["verified_cancellations"][0]["ner_check"] == "MATCHED"
    assert rep["open_findings"]["high"] >= 1   # the pending claim's units are not in the statement


async def test_api(client, auth_token, admin_headers):
    client.cookies.clear()  # run each request as the user its header names
    user = {"Authorization": f"Bearer {auth_token}"}
    body = _statement([_unit()])
    r = await client.post("/api/carbon-oversight/ner/statements", json=body, headers=user)
    assert r.status_code == 403
    r = await client.post("/api/carbon-oversight/ner/statements", json=body, headers=admin_headers)
    assert r.status_code == 200 and r.json()["unit_rows"] == 1
    r = await client.post("/api/carbon-oversight/ner/statements", json=body, headers=admin_headers)
    assert r.status_code == 409
    r = await client.post("/api/carbon-oversight/ner/statements", json={"format": "csv", "content": "a,b\n1,2\n"},
                          headers=admin_headers)
    assert r.status_code == 400 and "missing columns" in r.json()["error"]
    s = (await client.get("/api/carbon-oversight/ner/status", headers=user)).json()
    assert s["connection"] == "file" and s["latest"]["as_of"] == "2026-11-20"
    lst = (await client.get("/api/carbon-oversight/ner/statements", headers=user)).json()["statements"]
    assert len(lst) == 1 and lst[0]["imported_by"] == "testadmin"
    r = await client.get("/api/carbon-oversight/ner/template.csv", headers=user)
    assert r.status_code == 200 and r.text.startswith("serial_block,")
    r = await client.get(f"/api/carbon-oversight/ner/state-report?period={FIRST}", headers=user)
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    assert r.json()["format"] == ner.REPORT_FORMAT
    r = await client.get("/api/carbon-oversight/ner/state-report?period=1999", headers=user)
    assert r.status_code == 400
    client.cookies.clear()
    assert (await client.get("/api/carbon-oversight/ner/status")).status_code == 401
