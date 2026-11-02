"""Carbon Desk trading advisor: rule-based engine, `claude -p` layer (with a fake CLI), API."""

import json
import os
import stat
import sys

import pytest
from httpx import AsyncClient

from services import advisor_llm
from services.carbon_exchange import CONTRACT_SIZE, SimulatedVenue
from services.trading_advisor import RISK_PER_TRADE, STOP_ATR, ideas


@pytest.fixture
def market():
    v = SimulatedVenue(seed=3)
    for _ in range(300):
        v.step()
    return v


def _front(v, product="GEO"):
    return next(s for s, i in v.instruments.items() if i.product == product)


OBL = {"contracts_to_hedge": 34, "coverage_pct": 37.0, "required_offsets": 54000}


def test_ideas_are_complete_risk_sized_tickets(market):
    r = ideas(market, market.account("u"), OBL)
    tactical = [i for i in r["ideas"] if i["kind"] == "tactical"]
    assert tactical, "a seeded 300-step market should produce at least one signal"
    for i in tactical:
        sign = 1 if i["side"] == "BUY" else -1
        assert (i["order"]["price"] - i["stop"]) * sign > 0 and (i["target"] - i["order"]["price"]) * sign > 0
        assert i["risk_usd"] <= 1_000_000 * RISK_PER_TRADE * 1.05      # ~1% of equity to the stop
        assert 1 <= i["qty"] <= 500 and i["reasons"] and i["risks"]
        assert 0.05 <= i["confidence"] <= 0.95
    assert "not financial advice" in r["disclaimer"]


def test_hedge_idea_has_no_stop_and_comes_first(market):
    r = ideas(market, market.account("u"), OBL)
    hedge = r["ideas"][0]
    assert hedge["kind"] == "hedge" and hedge["symbol"] == _front(market) and hedge["qty"] == 34
    assert hedge["stop"] is None and hedge["target"] is None and hedge["side"] == "BUY"
    assert not [i for i in ideas(market, market.account("u"), {**OBL, "contracts_to_hedge": 0})["ideas"] if i["kind"] == "hedge"]


def test_signals_always_cover_front_months_and_holdings(market):
    held = sorted(s for s, i in market.instruments.items() if i.product == "CGO")[-1]
    market.submit("u", held, "BUY", 1, "MKT", "IOC")
    syms = {s["symbol"] for s in ideas(market, market.account("u"))["signals"]}
    assert {_front(market, p) for p in ("GEO", "NGO", "CGO")} <= syms and held in syms


def test_position_review_flags_losers(market):
    sym = _front(market)
    market.submit("u", sym, "BUY", 10, "MKT", "IOC")
    inst = market.instruments[sym]
    inst.candles[-1]["c"] = round(inst.candles[-1]["c"] * 0.8, 2)      # mark the position deep under water
    rv = next(x for x in ideas(market, market.account("u"))["review"] if x["symbol"] == sym)
    assert rv["action"] == "cut" and rv["pnl_atr"] <= -STOP_ATR
    assert not any(i["symbol"] == sym and i["kind"] == "tactical" for i in ideas(market, market.account("u"))["ideas"])


def test_validate_proposals(market):
    sym = _front(market)
    mark = market.instruments[sym].mark()
    good = {"symbol": sym.lower(), "side": "BUY", "qty": 5, "order_type": "LMT", "limit_price": round(mark, 2),
            "stop_loss": round(mark * 0.95, 2), "take_profit": None, "rationale": "r", "main_risk": "m", "confidence": 1.4}
    ok, dropped = advisor_llm.validate_proposals([
        good,
        {**good, "symbol": "XXXZ9"},
        {**good, "qty": 9999},
        {**good, "limit_price": mark * 2},
        {**good, "limit_price": None},
    ], market)
    assert len(ok) == 1 and ok[0]["symbol"] == sym and ok[0]["confidence"] == 1.0
    assert len(dropped) == 4 and any("band" in d for d in dropped) and any("without a price" in d for d in dropped)


# ── `claude -p` layer with a fake CLI ───────────────────────────────────────

FAKE = r'''#!{py}
import json, sys
args = sys.argv[1:]
prompt = sys.stdin.read()
assert "-p" in args and args[args.index("--tools") + 1] == "" and "--json-schema" in args
assert "--no-session-persistence" in args and "--max-budget-usd" in args and "--strict-mcp-config" in args
assert "<snapshot>" in prompt and "<question>" in prompt
mode = open({mode!r}).read().strip()
if mode == "login":
    print(json.dumps({{"is_error": True, "result": "Not logged in · Please run /login"}})); sys.exit(1)
if mode == "garbage":
    print("not json"); sys.exit(0)
sym = json.loads(prompt.split("<snapshot>")[1].split("</snapshot>")[0])["quotes"][0]["symbol"]
print(json.dumps({{"is_error": False, "total_cost_usd": 0.01, "modelUsage": {{"claude-opus-5-5": {{}}}},
  "structured_output": {{"answer": "Hedge first." + (" (remembered)" if "conversation_so_far" in prompt else ""),
  "proposals": [{{"symbol": sym, "side": "BUY", "qty": 3, "order_type": "MKT", "limit_price": None,
     "stop_loss": None, "take_profit": None, "rationale": "cover CORSIA", "main_risk": "price falls", "confidence": 0.7}},
     {{"symbol": "NOPE", "side": "BUY", "qty": 3, "order_type": "MKT", "limit_price": None,
     "stop_loss": None, "take_profit": None, "rationale": "x", "main_risk": "y", "confidence": 0.5}}],
  "follow_ups": ["What next?"]}}}}))
'''


@pytest.fixture
def fake_cli(tmp_path, monkeypatch):
    mode = tmp_path / "mode"
    mode.write_text("ok")
    exe = tmp_path / "claude"
    exe.write_text(FAKE.format(py=sys.executable, mode=str(mode)))
    exe.chmod(exe.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("ADVISOR_CLAUDE_BIN", str(exe))
    monkeypatch.setattr(advisor_llm, "_history", {})
    monkeypatch.setattr(advisor_llm, "_calls", {})
    return mode


async def test_ask_success_validates_and_remembers(fake_cli, market):
    snap = {"quotes": [{"symbol": _front(market)}]}
    r = await advisor_llm.ask("u", "What should I do?", snap, market)
    assert r["answer"] == "Hedge first." and r["model"] == "claude-opus-5-5"
    assert [p["symbol"] for p in r["proposals"]] == [_front(market)] and r["dropped"]
    r2 = await advisor_llm.ask("u", "And then?", snap, market)
    assert r2["answer"].endswith("(remembered)")
    advisor_llm.reset("u")
    assert not (await advisor_llm.ask("u", "Fresh?", snap, market))["answer"].endswith("(remembered)")


async def test_ask_failures_are_friendly(fake_cli, market, monkeypatch):
    snap = {"quotes": [{"symbol": _front(market)}]}
    fake_cli.write_text("login")
    with pytest.raises(advisor_llm.AdvisorUnavailable, match="isn't logged in"):
        await advisor_llm.ask("u", "q", snap, market)
    fake_cli.write_text("garbage")
    with pytest.raises(advisor_llm.AdvisorUnavailable, match="unreadable"):
        await advisor_llm.ask("u", "q", snap, market)
    with pytest.raises(advisor_llm.AdvisorUnavailable, match="Ask a question"):
        await advisor_llm.ask("u", "   ", snap, market)
    monkeypatch.setattr(advisor_llm, "PER_USER_PER_HOUR", 0)
    with pytest.raises(advisor_llm.AdvisorUnavailable, match="this hour"):
        await advisor_llm.ask("u", "q", snap, market)


async def test_ask_without_cli(monkeypatch, market):
    monkeypatch.setenv("ADVISOR_CLAUDE_BIN", "")
    monkeypatch.setattr(advisor_llm.shutil, "which", lambda _: None)
    assert advisor_llm.status()["available"] is False
    with pytest.raises(advisor_llm.AdvisorUnavailable, match="isn't installed"):
        await advisor_llm.ask("u", "q", {}, market)


# ── API ─────────────────────────────────────────────────────────────────────

async def _no_obligation(owner):
    return {"contracts_to_hedge": 0, "coverage_pct": 100.0, "required_offsets": 0}


async def test_advisor_api(client: AsyncClient, auth_token: str, fake_cli, monkeypatch):
    import api.trading as t
    monkeypatch.setattr(t, "_obligation", _no_obligation)
    h = {"Authorization": f"Bearer {auth_token}"}
    d = (await client.get("/api/trading/advisor/ideas", headers=h)).json()
    assert {"ideas", "review", "portfolio", "signals", "ai", "disclaimer"} <= set(d) and d["ai"]["available"]
    r = await client.post("/api/trading/advisor/chat", json={"message": "Advise me"}, headers=h)
    assert r.status_code == 200 and r.json()["answer"].startswith("Hedge first")
    assert (await client.post("/api/trading/advisor/reset", headers=h)).json() == {"ok": True}
    fake_cli.write_text("login")
    r = await client.post("/api/trading/advisor/chat", json={"message": "Advise me"}, headers=h)
    assert r.status_code == 503 and "logged in" in r.json()["error"]
