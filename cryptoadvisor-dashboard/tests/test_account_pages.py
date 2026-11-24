"""Account pages: personal audit log, API key updates, setup-wizard profile, complete data export."""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from tests.conftest import requires_pg  # noqa: E402


@pytest.fixture
def memory_db(tmp_path, monkeypatch):
    """A fresh SQLite database for AI memory facts."""
    import asyncio

    from services import database, user_memory

    monkeypatch.setattr(database, "DB_PATH", tmp_path / "memory.db")
    asyncio.run(user_memory.init_memory_tables())
    return user_memory


@pytest.fixture
def client(tmp_path, monkeypatch, memory_db):
    import api.wallet as wallet_api
    from api.account_data import router as account_router
    from api.api_keys import router as keys_router
    from api.audit import router as audit_router
    from middleware.auth import AuthMiddleware

    monkeypatch.setattr(wallet_api, "WALLETS_DIR", tmp_path / "wallets")
    app = FastAPI()
    app.add_middleware(AuthMiddleware)
    app.include_router(audit_router, prefix="/api/audit")
    app.include_router(account_router, prefix="/api/account")
    app.include_router(keys_router, prefix="/api/keys")
    app.include_router(wallet_api.router, prefix="/api/wallet")
    return TestClient(app)


def login(client, username="alice"):
    from services.auth import create_token

    client.cookies.set("access_token", create_token(username))
    return client


# ── Audit log ───────────────────────────────────────────────────────────────

# Without a database the page reads the older JSON log; with one, the audit trail (test below)
json_log_only = pytest.mark.skipif(bool(os.environ.get("TEST_DATABASE_URL")), reason="JSON-log fallback (no database)")


def _json_log(entries):
    from services import store
    store.put(store.SHARED, "audit_log", entries)


@json_log_only
def test_audit_log_only_own_entries_with_readable_details(client):
    _json_log([
        {"timestamp": "2026-11-01T10:00:00+00:00", "username": "alice", "action": "auth.login",
         "details": {"method": "password"}, "ip_address": "203.0.113.5"},
        {"timestamp": "2026-11-02T10:00:00+00:00", "username": "bob", "action": "auth.login",
         "details": {"method": "password"}, "ip_address": "198.51.100.7"},
    ])
    r = login(client).get("/api/audit/")
    assert r.status_code == 200
    body = r.json()
    assert [e["ip_address"] for e in body["entries"]] == ["203.0.113.5"]
    assert body["entries"][0]["details"] == {"method": "password"}
    assert body["next_cursor"] is None


@json_log_only
def test_audit_log_filters_and_pages(client):
    rows = [{"timestamp": f"2026-11-{d:02d}T12:00:00+00:00", "username": "alice",
             "action": "auth.login_failed" if d % 2 else "trade.add", "details": {"n": d}, "ip_address": ""}
            for d in range(1, 29)]
    _json_log(rows)
    c = login(client)

    failed = c.get("/api/audit/", params={"action": "auth.login", "limit": 100}).json()["entries"]
    assert len(failed) == 14 and all(e["action"] == "auth.login_failed" for e in failed)

    ranged = c.get("/api/audit/", params={"from": "2026-11-10", "to": "2026-11-12"}).json()["entries"]
    assert sorted(e["details"]["n"] for e in ranged) == [10, 11, 12]

    first = c.get("/api/audit/", params={"limit": 25}).json()
    assert len(first["entries"]) == 25 and first["next_cursor"]
    second = c.get("/api/audit/", params={"limit": 25, "cursor": first["next_cursor"]}).json()
    assert [e["details"]["n"] for e in second["entries"]] == [3, 2, 1]
    assert second["next_cursor"] is None


def test_audit_log_rejects_bad_dates_readably(client):
    c = login(client)
    r = c.get("/api/audit/", params={"from": "yesterday"})
    assert r.status_code == 400 and "date" in r.json()["error"]
    r = c.get("/api/audit/", params={"from": "2026-11-10", "to": "2026-11-01"})
    assert r.status_code == 400


@requires_pg
def test_audit_trail_prefix_filter_and_cursor(client):
    from services import audit_events

    for i in range(30):
        audit_events.record("alice", "auth.login" if i % 3 else "auth.login_failed", detail={"i": i})
    audit_events.record("bob", "auth.login", detail={"ip": "bob"})
    audit_events.record("alice", "trade.add", firm_id="f1", detail={"x": 1})
    c = login(client)

    trades = c.get("/api/audit/", params={"action": "trade"}).json()["entries"]
    assert [e["action"] for e in trades] == ["trade.add"]
    first = c.get("/api/audit/", params={"action": "auth.login"}).json()
    second = c.get("/api/audit/", params={"action": "auth.login", "cursor": first["next_cursor"]}).json()
    ids = [e["id"] for e in first["entries"] + second["entries"]]
    assert len(ids) == 30 == len(set(ids)) and second["next_cursor"] is None
    assert all(e["details"].get("ip") != "bob" for e in first["entries"] + second["entries"])  # only alice's
    assert first["entries"][0]["details"] == {"i": 29}
    # LIKE wildcards are literal: "auth_login" does not match "auth.login"
    assert c.get("/api/audit/", params={"action": "auth_login"}).json()["entries"] == []
    # The firm trail still filters by firm
    assert [e["action"] for e in audit_events.query(firm_id="f1")] == ["trade.add"]


# ── API keys ────────────────────────────────────────────────────────────────

def test_api_key_update_keeps_the_other_field(client):
    from services.api_keys import get_plaintext_key

    c = login(client)
    assert c.post("/api/keys/keys", json={"integration_id": "infura",
                                          "fields": {"project_id": "proj-1", "api_secret": "secret-1"}}).status_code == 200
    assert c.post("/api/keys/keys", json={"integration_id": "infura",
                                          "fields": {"project_id": "", "api_secret": "secret-2"}}).status_code == 200
    assert get_plaintext_key("alice", "infura", "project_id") == "proj-1"
    assert get_plaintext_key("alice", "infura", "api_secret") == "secret-2"


def test_api_keys_no_telegram_and_unknown_fields_rejected(client):
    c = login(client)
    ids = {i["id"] for i in c.get("/api/keys/integrations").json()["integrations"]}
    assert "telegram" not in ids and "stripe" in ids
    r = c.post("/api/keys/keys", json={"integration_id": "stripe", "fields": {"bogus": "x"}})
    assert r.status_code == 400 and "bogus" in r.json()["error"]


# ── Setup wizard profile ────────────────────────────────────────────────────

def test_wizard_profile_saved_for_assistant(client, memory_db):
    import asyncio

    from services.investment_profile import get_profile

    c = login(client)
    body = {"experience": "Beginner", "interests": ["defi", "tax"], "risk_tolerance": "Aggressive"}
    r = c.put("/api/account/profile", json=body)
    assert r.status_code == 200 and r.json()["memory_saved"] is True
    assert c.get("/api/account/profile").json()["interests"] == ["defi", "tax"]
    assert get_profile("alice")["risk_tolerance"] == "aggressive"

    # Saving again replaces the wizard's facts instead of piling up duplicates
    c.put("/api/account/profile", json={**body, "risk_tolerance": "Conservative"})
    facts = asyncio.run(memory_db.get_facts("alice"))
    assert sorted(f["fact"] for f in facts) == [
        "Investing experience level: beginner", "Most interested in: DeFi and yield, tax planning",
        "Risk tolerance: conservative"]
    context = asyncio.run(memory_db.build_memory_context("alice", "what should I buy?"))
    assert "Risk tolerance: conservative" in context and "experience level: beginner" in context


def test_wizard_profile_rejects_unknown_values(client):
    c = login(client)
    assert c.put("/api/account/profile", json={"risk_tolerance": "YOLO"}).status_code == 400
    assert c.put("/api/account/profile", json={"interests": ["golf"]}).status_code == 400


# ── Data export ─────────────────────────────────────────────────────────────

def test_export_is_complete_and_has_no_secrets(client, memory_db):
    import asyncio

    from services import auth, cash, exchanges, portfolios, store
    from services.api_keys import save_user_key

    auth.save_users([{"username": "alice", "password_hash": "$2b$hash", "totp_secret": "TOTPSECRET",
                      "role": "user", "created_at": "2026-01-01"}])
    pf = portfolios.create("alice", "Retirement")
    store.put("cash", "alice", [{"id": "c1", "portfolio_id": pf["id"], "type": "deposit", "amount": 1000}])
    save_user_key("alice", "stripe", {"publishable_key": "pk_live_abc", "secret_key": "sk_live_SECRETVALUE"})
    exchanges.add_exchange("alice", "binance", "BINANCEKEY", "BINANCESECRET")
    asyncio.run(memory_db.add_fact("alice", "Prefers index funds", "preferences"))
    store.put("trades", "bob", [{"id": "t-bob"}])

    c = login(client)
    c.post("/api/wallet/saved", json={"label": "Wallet", "address": "0x" + "a" * 40, "chain": "ethereum"})
    r = c.get("/api/account/export")
    assert r.status_code == 200
    data = r.json()
    text = json.dumps(data)

    assert "Retirement" in [p["name"] for p in data["records"]["portfolios"]]
    assert data["records"]["cash"][0]["amount"] == 1000
    assert data["saved_wallets"][0]["address"] == "0x" + "a" * 40
    assert data["ai_memory"][0]["fact"] == "Prefers index funds"
    assert isinstance(data["statements"], list) and isinstance(data["broker_connections"], list)
    assert data["records"]["api_keys_configured"] == {"stripe": ["publishable_key", "secret_key"]}
    assert data["records"]["exchanges_configured"][0]["name"] == "binance"
    assert data["account"]["role"] == "user"
    assert "incomplete_sections" not in data
    for secret in ("$2b$hash", "TOTPSECRET", "SECRETVALUE", "pk_live_abc", "BINANCEKEY", "BINANCESECRET", "t-bob"):
        assert secret not in text
    assert "password_hash" not in text and "totp_secret" not in text
