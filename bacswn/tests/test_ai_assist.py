"""Claude-powered assistance: certificate reading and story Q&A (Anthropic client mocked)."""

import base64
import json
from types import SimpleNamespace

import pytest

from services import ai_assist
from services import carbon_oversight as co
from services.mesh_network import MeshSimulation

PDF = base64.b64encode(b"%PDF-1.4 fake certificate").decode()


class FakeMessages:
    def __init__(self, text="", stop_reason="end_turn"):
        self.text, self.stop_reason, self.calls = text, stop_reason, []

    async def create(self, **kw):
        self.calls.append(kw)
        return SimpleNamespace(stop_reason=self.stop_reason,
                               content=[SimpleNamespace(type="thinking", thinking=""),
                                        SimpleNamespace(type="text", text=self.text)])


@pytest.fixture
def fake(monkeypatch):
    """API backend with a mocked Anthropic client."""
    monkeypatch.setenv("AI_BACKEND", "api")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    ai_assist._calls.clear()
    msgs = FakeMessages()
    monkeypatch.setattr(ai_assist, "_get_client", lambda: SimpleNamespace(beta=SimpleNamespace(messages=msgs)))
    return msgs


def _cert(**kw):
    base = {"document_kind": "Proof of Sustainability", "operator_name": "Bahamasair Holdings Ltd",
            "producer": "Example Renewables", "batch_id": "UCO-2025-0001", "certificate_ref": "PoS-77",
            "scheme": "ISCC CORSIA", "fuel_type": "SAF", "pathway": "HEFA", "feedstock": "Used cooking oil",
            "quantity_value": 1000, "quantity_unit": "t", "ls_value": 20.0, "ls_basis": "DEFAULT",
            "ghg_reduction_pct": None, "year_of_use": 2025, "issue_date": "2025-06-01",
            "evidence": [{"field": "batch_id", "quote": "Batch: UCO-2025-0001"}], "unclear": []}
    return json.dumps({**base, **kw})


OP = {"id": 1, "icao_designator": "BHS", "name": "Bahamasair"}


async def test_certificate_happy_path_and_request_shape(fake):
    fake.text = _cert()
    r = await ai_assist.read_fuel_certificate("reg", "pos.pdf", "application/pdf", PDF, OP, {}, co.periods())
    assert r["fields"] == {"year": 2025, "fuel_type": "SAF", "mass_t": 1000, "ls_value": 20.0, "ls_basis": "DEFAULT",
                           "batch_id": "UCO-2025-0001", "scheme": "ISCC CORSIA", "certificate_ref": "PoS-77",
                           "pathway": "HEFA", "feedstock": "Used cooking oil", "producer": "Example Renewables"}
    assert r["warnings"] == [] and "checked by reg" in r["provenance"]
    call = fake.calls[0]
    assert call["model"] == "claude-opus-5-5" and call["fallbacks"] == "default"
    assert call["betas"] == [ai_assist.FALLBACK_BETA]
    assert call["output_config"]["format"]["type"] == "json_schema" and call["output_config"]["effort"] == "medium"
    doc = call["messages"][0]["content"][0]
    assert doc["type"] == "document" and doc["source"]["media_type"] == "application/pdf"


async def test_certificate_conversions_and_warnings(fake):
    fake.text = _cert(quantity_value=1_250_000, quantity_unit="L", ls_value=None, ghg_reduction_pct=5,
                      scheme="Acme Green", operator_name="JetBlue Airways", year_of_use=2019, fuel_type=None,
                      unclear=["Second page partly illegible"])
    batches = {"uco-2025-0001": "claim F3 by JBU, pending"}
    r = await ai_assist.read_fuel_certificate("reg", "pos.png", "image/png", PDF, OP, batches, co.periods())
    f = r["fields"]
    assert f["mass_t"] == pytest.approx(1000.0)                     # 1,250,000 L × 0.8 kg/L
    assert f["ls_value"] == pytest.approx(84.55)                    # 89 × (1 − 5 %)
    text = " ".join(r["warnings"])
    for expect in ("fuel type", "above 80.1", "Acme Green", "already in the register (claim F3 by JBU",
                   "outside the CORSIA compliance periods", "JetBlue Airways"):
        assert expect in text
    assert any("0.8 kg/L" in n for n in r["notes"]) and any("5 % saving" in n for n in r["notes"])
    assert any("illegible" in n for n in r["notes"])
    assert fake.calls[0]["messages"][0]["content"][0]["type"] == "image"


async def test_certificate_input_validation(fake):
    for media, data, msg in (("text/plain", PDF, "PDF, PNG"), ("application/pdf", "!!", "could not be read"),
                             ("application/pdf", "", "empty"),
                             ("application/pdf", base64.b64encode(b"x" * (ai_assist.MAX_UPLOAD_BYTES + 1)).decode(), "10 MB")):
        with pytest.raises(ai_assist.AIUnavailable, match=msg):
            await ai_assist.read_fuel_certificate("reg", "f", media, data, OP, {}, co.periods())
    assert fake.calls == []


@pytest.mark.parametrize("stop,status", [("refusal", 422), ("max_tokens", 502)])
async def test_stop_reasons(fake, stop, status):
    fake.stop_reason = stop
    with pytest.raises(ai_assist.AIUnavailable) as e:
        await ai_assist.ask_about_story("u", "why?", {"stations": []})
    assert e.value.status == status


async def test_not_configured_and_rate_limit(fake, monkeypatch):
    fake.text = "ok"
    for _ in range(ai_assist.RATE_LIMIT[0]):
        await ai_assist.ask_about_story("busy", "q", {})
    with pytest.raises(ai_assist.AIUnavailable, match="Too many") as e:
        await ai_assist.ask_about_story("busy", "q", {})
    assert e.value.status == 429
    await ai_assist.ask_about_story("someone-else", "q", {})    # per user
    monkeypatch.delenv("ANTHROPIC_API_KEY")
    with pytest.raises(ai_assist.AIUnavailable, match="not configured") as e:
        await ai_assist.ask_about_story("u", "q", {})
    assert e.value.status == 503
    assert ai_assist.status() == {"configured": False, "backend": "api", "model": "claude-opus-5-5"}


def test_story_context_is_the_story_state_without_ground_truth():
    m = MeshSimulation(seed=2)
    for b in ("start", "vista"):
        m.story_beat("squall", b)
    ctx = ai_assist.story_context(m, "squall", None)
    assert [s["station"] for s in ctx["stations"]] == ["MYAT", "MYAM"]
    at = ctx["stations"][0]
    assert {x["id"]: x["call"] for x in at["models"]}["VISTA"] == "SQUALL"
    assert "truth" not in json.dumps(ctx)
    assert any(r["precog"] == "VISTA" for r in ctx["minority_reports"])
    assert ctx["story_step"]["beat"] == "vista"
    whole = ai_assist.story_context(m, None, "MYEG")
    assert whole["stations"][0]["station"] == "MYEG"


async def test_story_question_prompt(fake):
    fake.text = "VISTA saw the squall coming."
    r = await ai_assist.ask_about_story("u", "Why does VISTA disagree?", {"sim_time": "t", "stations": [{"station": "MYAT"}]},
                                        "VISTA sees it first", "The squall is about 10 minutes away.")
    assert r["answer"] == "VISTA saw the squall coming."
    call = fake.calls[0]
    prompt = call["messages"][0]["content"][0]["text"]
    assert "Why does VISTA disagree?" in prompt and '"station": "MYAT"' in prompt and "VISTA sees it first" in prompt
    assert call["output_config"] == {"effort": "low"} and "simulation" in call["system"]
    for bad in ("", "x" * 501):
        with pytest.raises(ai_assist.AIUnavailable):
            await ai_assist.ask_about_story("u", bad, {})


async def test_api(client, auth_token, admin_headers, fake, monkeypatch):
    client.cookies.clear()
    user = {"Authorization": f"Bearer {auth_token}"}
    assert (await client.get("/api/ai/assist-status", headers=user)).json()["configured"] is True
    fake.text = "Because the neighbours' radar saw it too."
    r = await client.post("/api/mesh/ask", json={"question": "Why was it confirmed?", "story": "squall"}, headers=user)
    assert r.status_code == 200 and r.json()["answer"].startswith("Because")
    op = (await co.create_operator({"icao_designator": "BHS", "name": "Bahamasair"}, "reg"))["id"]
    body = {"filename": "pos.pdf", "media_type": "application/pdf", "data": PDF}
    assert (await client.post(f"/api/carbon-oversight/operators/{op}/fuel-certificate", json=body, headers=user)).status_code == 403
    await co.add_fuel_claim(op, {"year": 2025, "fuel_type": "SAF", "batch_id": "UCO-2025-0001", "mass_t": 5,
                                 "ls_value": 20, "ls_basis": "DEFAULT", "scheme": "ISCC CORSIA"}, "reg")
    fake.text = _cert()
    r = await client.post(f"/api/carbon-oversight/operators/{op}/fuel-certificate", json=body, headers=admin_headers)
    assert r.status_code == 200 and "already in the register (claim F1 by BHS, pending)" in " ".join(r.json()["warnings"])
    assert (await client.post("/api/carbon-oversight/operators/999/fuel-certificate", json=body,
                              headers=admin_headers)).status_code == 404
    monkeypatch.delenv("ANTHROPIC_API_KEY")
    r = await client.post("/api/mesh/ask", json={"question": "q"}, headers=user)
    assert r.status_code == 503 and "not configured" in r.json()["error"]


# ── CLI backend (claude -p), with a stand-in `claude` script ────────────────

FAKE_CLAUDE = r"""#!/usr/bin/env python3
import json, os, sys
argv = sys.argv[1:]
prompt = sys.stdin.read()
log = {"argv": argv, "files": sorted(os.listdir(".")), "prompt": prompt[:400]}
open(os.environ["FAKE_CLAUDE_LOG"], "a").write(json.dumps(log) + "\n")
mode = os.environ.get("FAKE_CLAUDE_MODE", "ok")
if mode == "logged_out":
    print(json.dumps({"type": "result", "is_error": True, "result": "Invalid API key · Please run /login"})); sys.exit(1)
if "--json-schema" in argv:
    print(json.dumps({"type": "result", "is_error": False, "result": "", "structured_output": json.loads(os.environ["FAKE_CERT"])}))
else:
    print(json.dumps({"type": "result", "is_error": False, "result": "Because two models outvoted VISTA."}))
"""


@pytest.fixture
def cli(monkeypatch, tmp_path):
    exe = tmp_path / "claude"
    exe.write_text(FAKE_CLAUDE)
    exe.chmod(0o755)
    log = tmp_path / "calls.jsonl"
    monkeypatch.setenv("AI_BACKEND", "cli")
    monkeypatch.setenv("AI_CLAUDE_BIN", str(exe))
    monkeypatch.setenv("FAKE_CLAUDE_LOG", str(log))
    monkeypatch.setenv("FAKE_CERT", _cert(quantity_value=812500, quantity_unit="L"))
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "test-token")
    ai_assist._calls.clear()
    return lambda: [json.loads(x) for x in log.read_text().splitlines()]


async def test_cli_story_question_runs_without_tools(cli):
    assert ai_assist.status() == {"configured": True, "backend": "claude -p", "model": "opus"}
    r = await ai_assist.ask_about_story("u", "Why CLEAR?", {"stations": [{"station": "MYAT"}]})
    assert r["answer"] == "Because two models outvoted VISTA." and r["model"] == "opus"
    call = cli()[0]
    a = call["argv"]
    assert a[0] == "-p" and a[a.index("--tools") + 1] == "" and "--json-schema" not in a
    for flag in ("--no-session-persistence", "--strict-mcp-config"):
        assert flag in a
    assert a[a.index("--max-budget-usd") + 1] == ai_assist.CLI_MAX_USD and a[a.index("--effort") + 1] == "low"
    assert "plain text only" in a[a.index("--system-prompt") + 1]
    assert call["files"] == [] and "Why CLEAR?" in call["prompt"]       # empty working directory


async def test_cli_certificate_gets_only_read_and_only_the_file(cli):
    r = await ai_assist.read_fuel_certificate("reg", "pos.pdf", "application/pdf", PDF, OP, {}, co.periods())
    assert r["fields"]["mass_t"] == pytest.approx(650.0) and r["fields"]["batch_id"] == "UCO-2025-0001"
    assert "(Claude)" in r["provenance"]
    call = cli()[0]
    a = call["argv"]
    # Read only, and no blanket permission: reads outside the working directory are refused.
    assert a[a.index("--tools") + 1] == "Read" and "--allowedTools" not in a
    assert json.loads(a[a.index("--json-schema") + 1]) == ai_assist.CERT_SCHEMA
    assert call["files"] == ["certificate.pdf"] and "./certificate.pdf" in call["prompt"]


async def test_cli_errors(cli, monkeypatch):
    monkeypatch.setenv("FAKE_CLAUDE_MODE", "logged_out")
    with pytest.raises(ai_assist.AIUnavailable, match="isn't logged in"):
        await ai_assist.ask_about_story("u", "q", {})
    # Installed but not logged in: not offered.
    monkeypatch.delenv("CLAUDE_CODE_OAUTH_TOKEN")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(ai_assist.os.path, "isfile", lambda _: False)
    assert ai_assist.configured() is False
    with pytest.raises(ai_assist.AIUnavailable, match="has no login"):
        await ai_assist.ask_about_story("u", "q", {})
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "test-token")
    monkeypatch.setenv("AI_CLAUDE_BIN", "")
    monkeypatch.setattr(ai_assist.shutil, "which", lambda _: None)
    assert ai_assist.configured() is False
    with pytest.raises(ai_assist.AIUnavailable, match="CLI isn't installed"):
        await ai_assist.ask_about_story("u", "q", {})


async def test_operator_check_matches_whole_words(fake):
    fake.text = _cert(operator_name="Bahamasair Holdings Limited")
    r = await ai_assist.read_fuel_certificate("reg", "p.pdf", "application/pdf", PDF,
                                              {"id": 2, "icao_designator": "TST", "name": "Test Air"}, {}, co.periods())
    assert any("not Test Air (TST)" in w for w in r["warnings"])
    r = await ai_assist.read_fuel_certificate("reg", "p.pdf", "application/pdf", PDF, OP, {}, co.periods())
    assert not any("Check it belongs" in w for w in r["warnings"])        # Bahamasair Holdings Ltd vs Bahamasair



async def test_global_hourly_limit(cli, monkeypatch):
    monkeypatch.setattr(ai_assist, "GLOBAL_LIMIT", (3, 3600.0))
    for i in range(3):
        await ai_assist.ask_about_story(f"user{i}", "q", {})       # different users, each under their own limit
    with pytest.raises(ai_assist.AIUnavailable, match="hourly limit") as e:
        await ai_assist.ask_about_story("user9", "q", {})
    assert e.value.status == 429
