"""AI assistance for the CORSIA oversight register (Anthropic client mocked) and the unusual-figure signals."""

import base64
import json
from types import SimpleNamespace

import pytest

from services import ai_assist
from services import carbon_oversight as co
from services import ner_registry as ner
from services import oversight_ai as oai

FIRST = "2024-2026"
PDF = {"filename": "doc.pdf", "media_type": "application/pdf", "data": base64.b64encode(b"%PDF-1.4 x").decode()}


class FakeMessages:
    def __init__(self):
        self.text, self.calls = "", []

    async def create(self, **kw):
        self.calls.append(kw)
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=self.text)])


@pytest.fixture
def fake(monkeypatch):
    monkeypatch.setenv("AI_BACKEND", "api")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    ai_assist._calls.clear()
    msgs = FakeMessages()
    monkeypatch.setattr(ai_assist, "_get_client", lambda: SimpleNamespace(beta=SimpleNamespace(messages=msgs)))
    return msgs


async def _op(designator="BHS", name="Bahamasair"):
    r = await co.create_operator({"icao_designator": designator, "name": name}, "reg")
    return {"id": r["id"], "icao_designator": designator, "name": name}


def _claim(**kw):
    base = {"compliance_period": FIRST, "registry": "Verra (VCS)", "serial_block": "VCS-981", "serial_start": 1,
            "serial_end": 1000, "quantity": 1000, "vintage": 2022, "cancelled_on": "2025-03-01",
            "registry_reference": "CXL-1"}
    return {**base, **kw}


# ── uploads ─────────────────────────────────────────────────────────────────

def test_upload_kinds():
    att, text = oai._load_upload("a.pdf", "application/pdf", PDF["data"])
    assert att[1] == "application/pdf" and text is None
    att, text = oai._load_upload("x.csv", "text/csv", base64.b64encode(b"a,b\n1,2").decode())
    assert att is None and text == "a,b\n1,2"
    for name, mt, data, msg in (("x.xlsx", "application/vnd.ms-excel", "eA==", "Save the spreadsheet as CSV"),
                                ("x.bin", "application/octet-stream", "eA==", "Upload a PDF"),
                                ("x.pdf", "application/pdf", "!!", "could not be read"),
                                ("x.pdf", "application/pdf", "", "empty")):
        with pytest.raises(ai_assist.AIUnavailable, match=msg):
            oai._load_upload(name, mt, data)


async def test_text_documents_go_inline_as_data(fake):
    fake.text = json.dumps({"document_kind": "x", "as_of": "2026-11-20", "reference": "R", "rows_in_document": 1,
                            "units": [], "unclear": []})
    up = {"filename": "e.csv", "media_type": "text/csv", "data": base64.b64encode(b"serial,status\nA,ISSUED").decode()}
    await oai.read_registry_extract("reg", up)
    content = fake.calls[0]["messages"][0]["content"]
    assert len(content) == 1 and "<document>" in content[0]["text"] and "not instructions" in content[0]["text"]


# ── 1a. emissions reports ───────────────────────────────────────────────────

def _report(**kw):
    base = {"document_kind": "Verification statement", "operator_name": "Bahamasair Holdings Ltd",
            "operator_designator": "BHS", "year": 2025, "verified_co2_value": 52.5, "verified_co2_unit": "kt",
            "verifier": "Island Audit", "reference": "VS-25", "verification_opinion": "Reasonable assurance",
            "issue_date": "2026-03-01", "evidence": [{"field": "year", "quote": "Reporting year 2025"}], "unclear": []}
    return json.dumps({**base, **kw})


async def test_read_emissions_report(fake):
    op = await _op()
    await co.add_emission_report(op["id"], {"year": 2025, "verified_co2_t": 50_000, "growth_factor": 0.06}, "reg")
    fake.text = _report()
    r = await oai.read_emissions_report("reg", PDF, op)
    assert r["fields"] == {"year": 2025, "verified_co2_t": 52_500, "verifier": "Island Audit", "reference": "VS-25"}
    assert r["warnings"] == []
    notes = " ".join(r["notes"])
    assert "Converted 52.5 kt" in notes and "growth factor" in notes and "supersedes it (revision 2)" in notes
    fake.text = _report(verified_co2_unit="other", operator_name="Other Air", operator_designator="OTH",
                        verification_opinion="Qualified opinion", year=2017)
    r = await oai.read_emissions_report("reg", PDF, op)
    w = " ".join(r["warnings"])
    for expect in ("not recognised", "Other Air", "designator OTH", "Qualified", "outside the CORSIA"):
        assert expect in w


# ── 1b. cancellation certificates ──────────────────────────────────────────

def _cxl(**kw):
    base = {"document_kind": "Retirement certificate", "registry": "Verra (VCS)", "account_holder": "Bahamasair",
            "beneficiary": None, "serial_text": "VCS-981-1-1000", "serial_block": "VCS-981", "serial_start": 1,
            "serial_end": 1000, "quantity": 1000, "vintage": 2022, "project_id": "981", "project_name": "Mangroves",
            "cancelled_on": "2025-03-01", "cancellation_ref": "CXL-9", "purpose": "CORSIA First Phase",
            "evidence": [], "unclear": []}
    return json.dumps({**base, **kw})


async def test_read_cancellation(fake):
    op = await _op()
    other = await _op("OTH", "Other Air")
    await co.add_unit_claim(other["id"], _claim(serial_start=900, serial_end=1100, quantity=201), "reg")
    fake.text = _cxl()
    r = await oai.read_cancellation("reg", PDF, op, FIRST)
    assert r["fields"]["registry_reference"] == "CXL-9" and r["fields"]["quantity"] == 1000
    assert any("overlap claim" in w and "OTH" in w for w in r["warnings"])
    fake.text = _cxl(quantity=None, serial_start=1, serial_end=50, serial_block="VCS-7", purpose="Voluntary offsetting",
                     vintage=2015, beneficiary="Someone Else Ltd", cancelled_on="March 2025")
    r = await oai.read_cancellation("reg", PDF, op, FIRST)
    w = " ".join(r["warnings"])
    assert r["fields"]["quantity"] == 50 and r["fields"]["cancelled_on"] is None
    for expect in ("not CORSIA", "outside the first phase window", "Someone Else"):
        assert expect in w
    fake.text = _cxl(serial_end=999)
    assert any("holds 999 units" in w for w in (await oai.read_cancellation("reg", PDF, op, FIRST))["warnings"])
    with pytest.raises(co.OversightError):
        await oai.read_cancellation("reg", PDF, op, "1999")


async def test_read_cancellation_checks_the_national_registry(fake):
    op = await _op()
    await ner.import_statement({"format": "json", "content": json.dumps({"as_of": "2026-11-20", "units": [
        {"serial_block": "BS-NER-SG", "serial_start": 1, "serial_end": 1000, "vintage": 2025, "status": "ISSUED",
         "authorisation_ref": "L1", "authorised_uses": ["CORSIA"], "corresponding_adjustment": True}]})}, "admin")
    fake.text = _cxl(registry="Bahamas National Emissions Registry", serial_block="BS-NER-SG", vintage=2025,
                     cancelled_on="2026-06-01")
    r = await oai.read_cancellation("reg", PDF, op, FIRST)
    assert any("National Emissions Registry: Units BS-NER-SG 1–1000 are issued" in w for w in r["warnings"])


# ── 1c. letters of authorisation ───────────────────────────────────────────

def _loa(**kw):
    base = {"document_kind": "Letter of authorisation", "issuing_country": "The Bahamas",
            "issuing_body": "Office of the Prime Minister", "reference": "BS-LOA-1", "issue_date": "2026-05-01",
            "authorised_uses_text": ["use towards CORSIA"], "corsia_use": "authorised",
            "other_international_mitigation": "not_stated", "corresponding_adjustment": "committed",
            "project_id": "P1", "project_name": "Seagrass", "serial_blocks": ["BS-NER-SG"], "vintage_from": 2024,
            "vintage_to": 2025, "max_quantity": 800, "evidence": [], "unclear": []}
    return json.dumps({**base, **kw})


async def test_read_authorisation_compares_with_registry(fake):
    fake.text = _loa()
    r = await oai.read_authorisation("reg", PDF)
    assert r["fields"]["authorised_uses"] == "CORSIA" and r["fields"]["corresponding_adjustment"] is True
    assert "No registry statement" in r["comparison"][0]
    await ner.import_statement({"format": "json", "content": json.dumps({"as_of": "2026-11-20", "units": [
        {"serial_block": "BS-NER-SG", "serial_start": 1, "serial_end": 1000, "vintage": 2023, "status": "ISSUED",
         "authorisation_ref": "BS-LOA-1", "authorised_uses": ["CORSIA"], "corresponding_adjustment": False}]})}, "admin")
    r = await oai.read_authorisation("reg", PDF)
    w = " ".join(r["warnings"])
    assert "more than the 800" in w and "vintages outside 2024–2025" in w
    assert any("1,000 units" in c for c in r["comparison"]) and any("does not yet show" in c for c in r["comparison"])
    fake.text = _loa(corsia_use="not_stated", corresponding_adjustment="not_stated", issuing_country="Elsewhere")
    w = " ".join((await oai.read_authorisation("reg", PDF))["warnings"])
    assert "does not clearly authorise" in w and "corresponding adjustment" in w and "not the Bahamas" in w


async def test_recorded_letters_feed_the_claim_checks():
    op = await _op()
    await ner.import_statement({"format": "json", "content": json.dumps({"as_of": "2026-11-20", "units": [
        {"serial_block": "BS-NER-SG", "serial_start": 1, "serial_end": 1000, "vintage": 2025, "status": "CANCELLED",
         "authorisation_ref": "BS-LOA-1", "authorised_uses": ["CORSIA"], "corresponding_adjustment": True,
         "cancelled_for": "CORSIA", "cancelled_by": "BHS", "cancelled_on": "2026-06-10"}]})}, "admin")
    cid = (await co.add_unit_claim(op["id"], _claim(registry=ner.REGISTRY_NAME, serial_block="BS-NER-SG", vintage=2025,
                                                    cancelled_on="2026-06-10", registry_reference=""), "reg"))["id"]

    async def kinds():
        reg = await co.register(FIRST)
        return {f["kind"] for f in reg["findings"] if f["claim_id"] == cid}, \
            next(c for c in reg["claims"] if c["id"] == cid)["ner_check"]["result"]

    assert await kinds() == (set(), "MATCHED")                      # no letters kept yet: no letter checks
    await ner.add_authorisation({"reference": "OTHER", "issue_date": "2026-01-01", "authorised_uses": "CORSIA"}, "reg")
    assert await kinds() == ({"NER_LOA_NOT_ON_FILE"}, "MATCHED")    # low severity only
    await ner.add_authorisation({"reference": "BS-LOA-1", "issue_date": "2026-01-01", "authorised_uses": ["NDC"],
                                 "vintage_from": 2020, "vintage_to": 2024, "max_quantity": 500}, "reg")
    k, result = await kinds()
    assert k == {"NER_LOA_MISMATCH", "NER_LOA_EXCEEDED"} and result == "PROBLEMS"
    lst = await ner.authorisations()
    assert {a["reference"] for a in lst} == {"OTHER", "BS-LOA-1"}
    assert next(a for a in lst if a["reference"] == "BS-LOA-1")["over_limit"] is True
    for bad, msg in (({"issue_date": "2026-01-01"}, "Reference is required"),
                     ({"reference": "X", "issue_date": "2099-01-01"}, "future"),
                     ({"reference": "X", "issue_date": "2026-01-01", "vintage_from": 2025, "vintage_to": 2024}, "before")):
        with pytest.raises(ner.RegistryError, match=msg):
            await ner.add_authorisation(bad, "reg")


# ── 1d. registry extracts ──────────────────────────────────────────────────

async def test_registry_extract_becomes_an_importable_statement(fake):
    unit = {"serial_block": "BS-NER-SG", "serial_start": 1, "serial_end": 100, "vintage": 2025, "status": "CANCELLED",
            "authorisation_ref": "L1", "authorised_uses": ["CORSIA"], "corresponding_adjustment": True,
            "cancelled_for": "CORSIA", "cancelled_by": "BHS", "cancellation_ref": "C1", "cancelled_on": "2026-06-01",
            "project_id": None, "project_name": None}
    fake.text = json.dumps({"document_kind": "Registry extract", "as_of": "2026-11-20", "reference": "NER-11",
                            "rows_in_document": 3, "units": [unit], "unclear": ["page 2 faint"]})
    r = await oai.read_registry_extract("reg", PDF)
    assert r["errors"] == [] and any("3 rows but 1" in w for w in r["warnings"])
    imported = await ner.import_statement({"format": "json", "content": r["content"], "source_note": r["source_note"]}, "reg")
    assert imported["units_total"] == 100
    assert (await ner.statements())[0]["source_note"].startswith("Converted by AI")
    fake.text = json.dumps({"document_kind": "x", "as_of": None, "reference": None, "rows_in_document": 1,
                            "units": [{**unit, "status": "CANCELLED", "cancelled_on": None}], "unclear": []})
    r = await oai.read_registry_extract("reg", PDF)
    assert "needs cancelled_on" in r["errors"][0] and any("No statement date" in w for w in r["warnings"])


# ── 2. review briefs ────────────────────────────────────────────────────────

def _brief(**kw):
    base = {"summary": "Claim for 1,000 units.", "operator_says": "Cancelled 1,000 units.", "records_show": ["x"],
            "findings_assessment": [], "missing_evidence": [], "suggested_decision": "VERIFIED",
            "reason_draft": "Registry statement matches."}
    return json.dumps({**base, **kw})


async def test_review_brief_and_ai_assisted_review(fake):
    op = await _op()
    other = await _op("OTH", "Other Air")
    first = (await co.add_unit_claim(other["id"], _claim(), "reg"))["id"]
    cid = (await co.add_unit_claim(op["id"], _claim(), "reg"))["id"]      # overlaps: DOUBLE_CLAIM (high)
    fake.text = _brief()
    b = await oai.review_brief("reg", "unit", cid)
    assert b["decision_to_preselect"] == "VERIFIED" and "high-severity" in b["cautions"][0]
    record = json.loads(fake.calls[0]["messages"][0]["content"][0]["text"].split("Record (JSON):\n", 1)[1])
    assert record["claim"]["id"] == cid and record["findings_on_this_claim"][0]["kind"] == "DOUBLE_CLAIM"
    await co.review_claim(cid, {"decision": "REJECTED", "reason": "Double claim", "ai_brief": b["brief_text"]}, "reg")
    fake.text = _brief(suggested_decision="REJECTED")
    b2 = await oai.review_brief("reg", "unit", cid)
    assert b2["decision_to_preselect"] is None                       # a rejected claim can only be reopened
    detail = await co.operator_detail(op["id"])
    assert detail["claims"][0]["reviews"][0]["ai_assisted"] is True
    await co.review_claim(first, {"decision": "VERIFIED"}, "reg")
    assert (await co.operator_detail(other["id"]))["claims"][0]["reviews"][0]["ai_assisted"] is False
    with pytest.raises(ai_assist.AIUnavailable, match="not found"):
        await oai.review_brief("reg", "unit", 999)
    with pytest.raises(ai_assist.AIUnavailable, match="Unknown claim type"):
        await oai.review_brief("reg", "other", cid)


async def test_review_brief_for_fuel(fake):
    op = await _op()
    f = await co.add_fuel_claim(op["id"], {"year": 2025, "fuel_type": "SAF", "mass_t": 10, "ls_value": 20,
                                           "ls_basis": "DEFAULT", "batch_id": "B1", "scheme": "ISCC CORSIA"}, "reg")
    fake.text = _brief(suggested_decision="REQUEST_INFORMATION")
    b = await oai.review_brief("reg", "fuel", f["id"])
    assert b["decision_to_preselect"] is None and "Suggested: REQUEST_INFORMATION" in b["brief_text"]


# ── 3. rules check ──────────────────────────────────────────────────────────

async def test_rules_check_lists_changes_and_affected_claims(fake):
    op = await _op()
    await co.add_unit_claim(op["id"], _claim(vintage=2021), "reg")
    await co.add_unit_claim(op["id"], _claim(serial_block="GS-1", registry="Gold Standard", vintage=2023), "reg")
    await co.add_fuel_claim(op["id"], {"year": 2025, "fuel_type": "SAF", "mass_t": 10, "ls_value": 20,
                                       "ls_basis": "DEFAULT", "batch_id": "B1", "scheme": "RSB CORSIA"}, "reg")
    fake.text = json.dumps({
        "document_kind": "ICAO document", "title": "CORSIA Eligible Emissions Units", "edition_or_date": "Nov 2026",
        "programmes": [{"name": "Verified Carbon Standard (Verra)", "compliance_period": "2024-2026",
                        "vintage_from": 2022, "vintage_to": 2026, "conditions": None}],
        "approved_schemes": ["ISCC", "ClassNK"], "fossil_baseline_gco2e_mj": 89.0, "evidence": [], "unclear": []})
    r = await oai.check_rules("reg", PDF)
    rules = {c["rule"] for c in r["changes"]}
    assert {"Eligible vintages, 2024-2026", "Approved certification schemes", "Schemes on file not in the document"} <= rules
    effects = " | ".join(f"{a['claim']} {a['effect']}" for a in r["affected"])
    assert "#1 vintage 2021 would become outside the window" in effects
    assert "F1 scheme 'RSB CORSIA' would become unrecognised" in effects
    assert "registry 'Gold Standard'" in effects and r["applied"] is False
    assert co.PERIODS[FIRST]["vintages"] == (2021, 2026)              # nothing changed


# ── 4–6. questions, drafts, explanations ───────────────────────────────────

async def test_ask_register_uses_a_snapshot(fake):
    op = await _op()
    await co.add_unit_claim(op["id"], _claim(), "reg")
    fake.text = "BHS has claim #1 pending."
    r = await oai.ask_register("reg", "What is pending?")
    assert r["answer"] == "BHS has claim #1 pending."
    prompt = fake.calls[0]["messages"][0]["content"][0]["text"]
    snap = json.loads(prompt.split("Register snapshot (JSON):\n", 1)[1].split("\n\nQuestion:", 1)[0])
    assert snap["periods"][FIRST]["unit_claims"][0]["id"] == 1 and "2021-2023" not in snap["periods"]
    for q, msg in (("", "Type a question"), ("x" * 501, "under 500")):
        with pytest.raises(ai_assist.AIUnavailable, match=msg):
            await oai.ask_register("reg", q)


async def test_drafts(fake):
    op = await _op()
    await co.add_emission_report(op["id"], {"year": 2024, "verified_co2_t": 20_000, "growth_factor": 0.05}, "reg")
    fake.text = "Dear [Name], ..."
    d = await oai.draft_document("reg", "shortfall_notice", FIRST, op["id"])
    assert d["text"].startswith("DRAFT prepared with AI") and d["facts"]["operator"]["shortfall_units"] == 1000
    d = await oai.draft_document("reg", "state_report_cover", FIRST, None)
    assert d["facts"]["totals"]["final_requirement_t"] == 1000
    d = await oai.draft_document("reg", "information_request", FIRST, op["id"])
    assert "pending_claims" in d["facts"]
    other = await _op("OTH", "Other Air")
    for kind, oid, msg in (("shortfall_notice", other["id"], "no shortfall"), ("nope", None, "Unknown document"),
                           ("information_request", None, "Choose an operator")):
        with pytest.raises(ai_assist.AIUnavailable, match=msg):
            await oai.draft_document("reg", kind, FIRST, oid)
    with pytest.raises(ai_assist.AIUnavailable):
        await oai.draft_document("reg", "state_report_cover", "1999", None)


async def test_explain_only_real_findings(fake):
    op = await _op()
    reg = await co.register(FIRST)
    f = next(x for x in reg["findings"] if x["operator_id"] == op["id"])
    fake.text = "No report was recorded for that year."
    r = await oai.explain_finding("reg", FIRST, f)
    assert r["explanation"].startswith("No report")
    with pytest.raises(ai_assist.AIUnavailable, match="no longer in the register"):
        await oai.explain_finding("reg", FIRST, {**f, "message": "made up"})


# ── unusual figures (no AI) ────────────────────────────────────────────────

async def test_unusual_figures():
    a, b, c = await _op("AAA", "A air"), await _op("BBB", "B air"), await _op("CCC", "C air")
    await co.add_emission_report(a["id"], {"year": 2023, "verified_co2_t": 10_000, "growth_factor": 0.06}, "reg")
    await co.add_emission_report(a["id"], {"year": 2024, "verified_co2_t": 20_000, "growth_factor": 0.06}, "reg")
    await co.add_emission_report(b["id"], {"year": 2024, "verified_co2_t": 11_000, "growth_factor": 0.06}, "reg")
    await co.add_emission_report(c["id"], {"year": 2024, "verified_co2_t": 9_000, "growth_factor": 0.05}, "reg")
    for i in range(3):
        await co.add_fuel_claim(b["id"], {"year": 2025, "fuel_type": "SAF", "mass_t": 40 + i, "ls_value": 20,
                                          "ls_basis": "DEFAULT", "batch_id": f"S{i}", "scheme": "ISCC CORSIA",
                                          "producer": "Acme Fuels"}, "reg")
    reg = await co.register(FIRST)
    low = {(f["kind"], f["operator"]) for f in reg["findings"] if f["severity"] == "low"}
    assert ("UNUSUAL_CHANGE", "AAA") in low and ("UNUSUAL_GROWTH_FACTOR", "CCC") in low
    assert ("UNUSUAL_FUEL_SPLIT", "BBB") in low
    split = next(f for f in reg["findings"] if f["kind"] == "UNUSUAL_FUEL_SPLIT")
    assert split["fuel_claim_id"] == 1 and "F1, F2, F3" in split["message"]


# ── API ─────────────────────────────────────────────────────────────────────

async def test_ai_api_permissions_and_errors(client, auth_token, admin_headers, fake):
    client.cookies.clear()
    user = {"Authorization": f"Bearer {auth_token}"}
    for path in ("/api/carbon-oversight/ai/read/report", "/api/carbon-oversight/ai/review-brief",
                 "/api/carbon-oversight/ai/rules-check", "/api/carbon-oversight/ai/draft",
                 "/api/carbon-oversight/ner/authorisations"):
        assert (await client.post(path, json={}, headers=user)).status_code == 403
    r = await client.post("/api/carbon-oversight/ai/read/nope", json=PDF, headers=admin_headers)
    assert r.status_code == 404
    r = await client.post("/api/carbon-oversight/ai/read/report", json={**PDF, "operator_id": 99}, headers=admin_headers)
    assert r.status_code == 404
    r = await client.post("/api/carbon-oversight/ai/review-brief", json={}, headers=admin_headers)
    assert r.status_code == 400
    fake.text = "An answer."
    r = await client.post("/api/carbon-oversight/ai/ask", json={"question": "Who is short?"}, headers=user)
    assert r.status_code == 200 and r.json()["answer"] == "An answer."
    r = await client.post("/api/carbon-oversight/ai/explain", json={"period": FIRST, "finding": {"kind": "X"}}, headers=user)
    assert r.status_code == 404
    r = await client.post("/api/carbon-oversight/ner/authorisations",
                          json={"reference": "L1", "issue_date": "2026-01-01", "authorised_uses": "CORSIA"}, headers=admin_headers)
    assert r.status_code == 200
    lst = (await client.get("/api/carbon-oversight/ner/authorisations", headers=user)).json()["authorisations"]
    assert lst[0]["reference"] == "L1" and lst[0]["created_by"] == "testadmin"
    fake.text = json.dumps({"document_kind": "x", "as_of": "2026-11-20", "reference": None, "rows_in_document": 0,
                            "units": [], "unclear": []})
    r = await client.post("/api/carbon-oversight/ai/read/statement", json=PDF, headers=admin_headers)
    assert r.status_code == 200 and "no units" in r.json()["errors"][0]
