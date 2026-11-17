"""Firm accounts, firm portfolio access, invitations, policy, and the tamper-evident audit trail (Postgres)."""

import asyncio
import sys
import time
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402

from tests.conftest import requires_pg  # noqa: E402

pytestmark = requires_pg

USERS = ["alice", "bob", "carol", "dave", "erin"]


@pytest.fixture(autouse=True)
def world():
    from services import store
    from services.market import registry
    from services.market.models import Instrument, Quote
    from services import market

    store.put(store.SHARED, "users", [{"username": u, "first_name": u.title(), "role": "user"} for u in USERS])
    registry.load_for_tests([Instrument("stock:AAPL", "stock", "AAPL", "Apple Inc.", {"yahoo": "AAPL"}, sessions="us_equity")])

    async def quotes(ids):
        return {i: Quote(i, 100.0, 0.0, None, time.time(), "test") for i in ids}

    with patch.object(market, "quotes", quotes):
        yield


def test_create_roles_and_last_admin():
    from services import firms
    f = firms.create("alice", "Acme Capital")
    assert f["slug"] == "acme-capital" and firms.membership("alice", f["id"]) == "admin"
    assert firms.create("bob", "Acme Capital")["slug"] == "acme-capital-2"
    with pytest.raises(firms.FirmError, match="at least one active admin"):
        firms.set_member("alice", f["id"], "alice", role="pm")
    with pytest.raises(firms.FirmError) as e:
        firms.members("bob", f["id"])
    assert e.value.status == 404  # non-members can't see the firm exists


def test_invitations():
    from services import firms
    f = firms.create("alice", "Acme")
    inv = firms.invite("alice", f["id"], "analyst", "bob@acme.com")
    assert firms.peek_invite(inv["token"])["firm_name"] == "Acme"
    firms.accept_invite("bob", inv["token"])
    assert firms.membership("bob", f["id"]) == "analyst"
    with pytest.raises(firms.FirmError):
        firms.accept_invite("carol", inv["token"])  # single use
    inv2 = firms.invite("alice", f["id"], "viewer")
    firms.revoke_invite("alice", f["id"], firms.invites("alice", f["id"])[0]["id"])
    with pytest.raises(firms.FirmError):
        firms.peek_invite(inv2["token"])
    with pytest.raises(firms.FirmError) as e:
        firms.invite("bob", f["id"], "admin")  # analysts can't invite
    assert e.value.status == 403


def test_firm_portfolio_access_by_role():
    from services import firms, portfolios, trades
    f = firms.create("alice", "Acme")
    for user, role in (("bob", "pm"), ("carol", "analyst"), ("dave", "compliance")):
        firms.accept_invite(user, firms.invite("alice", f["id"], role)["token"])
    p = firms.create_portfolio("bob", f["id"], name="Smith Family", kind="client", client_name="Ann Smith")
    s_pm = portfolios.resolve("bob", p["id"])
    assert s_pm.owner == f"firm-{f['id']}" and s_pm.can_write
    trades.add_trade(s_pm.owner, "stock:AAPL", "buy", 90, 10, "2026-01-02", portfolio_id=portfolios.write_target(s_pm))
    s_an = portfolios.resolve("carol", p["id"])
    assert not s_an.can_write and asyncio.run(trades.portfolio(s_an.owner, s_an.portfolio_ids))["positions"][0]["quantity"] == 10
    with pytest.raises(portfolios.AccessError):
        portfolios.write_target(s_an)
    with pytest.raises(portfolios.AccessError):
        portfolios.resolve("erin", p["id"])  # not a member
    combined = portfolios.resolve("dave", f"firm:{f['id']}")
    assert combined.combined and combined.portfolio_ids == (p["id"],)
    assert portfolios.manage_owner("bob", p["id"]) == s_pm.owner and portfolios.manage_owner("carol", p["id"]) is None
    with pytest.raises(firms.FirmError):
        firms.create_portfolio("carol", f["id"], name="Nope")
    # Suspension removes access immediately
    firms.set_member("alice", f["id"], "carol", status="suspended")
    with pytest.raises(portfolios.AccessError):
        portfolios.resolve("carol", p["id"])
    # Firm notifications go to admins and PMs
    assert sorted(firms.recipients(s_pm.owner)) == ["alice", "bob"]


def test_transfer_personal_portfolio_into_firm():
    from services import cash, firms, portfolios, trades
    f = firms.create("alice", "Acme")
    pid = portfolios.create("alice", "Client A", kind="client")["id"]
    trades.add_trade("alice", "stock:AAPL", "buy", 90, 5, "2026-01-02", portfolio_id=pid)
    cash.add_entry("alice", pid, "deposit", 1000, "2026-01-01")
    portfolios.grant("alice", pid, "erin", "viewer")
    firms.transfer_portfolio("alice", pid, f["id"])
    fk = firms.owner_key(f["id"])
    assert not portfolios.get_own("alice", pid) and portfolios.get_own(fk, pid)
    assert len(trades.get_trades(fk, [pid])) == 1 and len(cash.get_entries(fk, [pid])) == 1
    assert trades.get_trades("alice", [pid]) == []
    assert portfolios.resolve("erin", pid).owner == fk  # the client's view-only share still works


def test_policy_session_and_sso_required():
    from services import firms
    f = firms.create("alice", "Acme")
    firms.accept_invite("bob", firms.invite("alice", f["id"], "pm")["token"])
    firms.update_policy("alice", f["id"], {"sso_required": True, "session_hours": 8, "sso_domains": ["Acme.com", "@acme.co.uk"]})
    assert firms.get(f["id"])["sso_domains"] == ["acme.co.uk", "acme.com"]
    assert firms.session_hours("bob") == 8 and firms.session_hours("erin") == 24
    assert firms.password_blocked_by("bob") == "Acme"
    assert firms.password_blocked_by("alice") is None  # admins keep password access (break-glass)
    with pytest.raises(firms.FirmError):
        firms.update_policy("alice", f["id"], {"session_hours": 72})


def test_audit_trail_chain_and_tamper_resistance():
    import psycopg
    from services import audit_events, db, firms
    f = firms.create("alice", "Acme")
    firms.invite("alice", f["id"], "viewer")
    audit_events.record("bob", "auth.login", ip="203.0.113.5", detail={"method": "password"})
    ev = audit_events.query(firm_id=f["id"])
    assert [e["action"] for e in ev] == ["firm.invite_create", "firm.create"]
    assert audit_events.verify_chain() == {"ok": True, "events": 3, "first_problem": None}
    with db.conn() as c:
        with pytest.raises(psycopg.errors.RaiseException, match="cannot be deleted"):
            c.execute("DELETE FROM audit_events")
    with db.conn() as c:
        with pytest.raises(psycopg.errors.RaiseException, match="cannot be changed"):
            c.execute("UPDATE audit_events SET action = 'nothing'")
    with db.conn() as c:
        with pytest.raises(psycopg.errors.RaiseException):
            c.execute("TRUNCATE audit_events")
    # Anonymizing on account deletion is the one allowed change, and the chain still verifies
    assert audit_events.anonymize("bob") == 1
    assert audit_events.verify_chain()["ok"]
    # A tamperer who disables the trigger still breaks the hash chain
    with db.conn() as c:
        c.execute("ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_change")
        c.execute("UPDATE audit_events SET detail = '{\"name\": \"Evil\"}' WHERE action = 'firm.create'")
        c.execute("ALTER TABLE audit_events ENABLE TRIGGER audit_events_no_change")
        c.commit()
    bad = audit_events.verify_chain()
    assert not bad["ok"] and bad["first_problem"]["problem"] == "row content changed"


def test_account_deletion_cleans_firm_state():
    from services import account, audit_events, firms, sso
    f = firms.create("alice", "Acme")
    firms.accept_invite("bob", firms.invite("alice", f["id"], "pm")["token"])
    sso.link("bob", "google", "g-123", "bob@acme.com")
    assert firms.sole_admin_of("alice") == ["Acme"]
    asyncio.run(account.delete_account("bob"))
    assert firms.membership("bob", f["id"]) is None and sso.identities_of("bob") == []
    assert all(e["actor"] != "bob" for e in audit_events.query(limit=100))
