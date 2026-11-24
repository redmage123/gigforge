"""Two-factor authentication: enrollment, the sign-in code step (password and SSO), lockouts, code reuse,
recovery codes, disable, the firm "require two-factor" policy and its enrollment gate.

Runs on the file/in-memory backends by default; firm-policy and audit tests need TEST_DATABASE_URL.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pyotp  # noqa: E402
import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from jose import jwt  # noqa: E402

from services import auth, mfa, store  # noqa: E402
from tests.conftest import requires_pg  # noqa: E402

PW = "correct-horse-battery"
T0 = 1_800_000_000.0  # a fixed clock, aligned to a 30 s step


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    """Controllable time for TOTP steps and failure windows."""
    now = {"t": T0}
    monkeypatch.setattr(mfa, "_now", lambda: now["t"])
    mfa.clear_cache()
    auth._login_attempts.clear()
    yield now
    mfa.clear_cache()
    auth._login_attempts.clear()


def _app():
    from api.account_data import router as account_router
    from api.firms import router as firms_router
    from api.sso import router as sso_router
    from api.totp import router as totp_router
    from middleware.auth import AuthMiddleware
    from routers.auth import router as auth_router

    app = FastAPI()
    app.add_middleware(AuthMiddleware)
    app.include_router(auth_router, prefix="/api/auth")
    app.include_router(totp_router, prefix="/api/2fa")
    app.include_router(sso_router, prefix="/api/sso")
    app.include_router(firms_router, prefix="/api/firms")
    app.include_router(account_router, prefix="/api/account")

    @app.get("/api/ping")
    async def ping():
        return {"ok": True}
    return app


@pytest.fixture
def app():
    return _app()


def client(app):
    return TestClient(app, follow_redirects=False)


def signup(app, username="alice"):
    c = client(app)
    r = c.post("/api/auth/register", json={"first_name": "A", "last_name": "B", "username": username,
                                           "password": PW, "confirm_password": PW})
    assert r.status_code == 201, r.text
    return c


def code_at(secret, t, offset=0):
    return pyotp.TOTP(secret).generate_otp(int(t // 30) + offset)


def enroll(c, clock):
    """Turn MFA on through the API; returns (secret, recovery codes). Advances the clock one step."""
    s = c.post("/api/2fa/setup").json()
    r = c.post("/api/2fa/confirm", json={"code": code_at(s["secret"], clock["t"])})
    assert r.status_code == 200, r.text
    clock["t"] += 30
    return s["secret"], r.json()["recovery_codes"]


def password_step(app, username="alice"):
    c = client(app)
    r = c.post("/api/auth/login", json={"username": username, "password": PW})
    assert r.status_code == 200, r.text
    return c, r.json()


# ── Enrollment ─────────────────────────────────────────────────────────────

def test_enrollment_stores_encrypted_secret_and_hashed_recovery_codes(app, clock):
    c = signup(app)
    assert c.get("/api/2fa/status").json()["enabled"] is False
    s = c.post("/api/2fa/setup").json()
    assert s["otpauth_uri"].startswith("otpauth://totp/AssetAdvisor:alice?") and f"secret={s['secret']}" in s["otpauth_uri"]
    assert c.get("/api/2fa/status").json()["setup_pending"] is True
    bad = c.post("/api/2fa/confirm", json={"code": "000000" if code_at(s["secret"], clock["t"]) != "000000" else "111111"})
    assert bad.status_code == 400 and bad.json()["code"] == "invalid_code"
    r = c.post("/api/2fa/confirm", json={"code": code_at(s["secret"], clock["t"])})
    assert r.status_code == 200
    codes = r.json()["recovery_codes"]
    assert len(codes) == 10 and len(set(codes)) == 10
    st = c.get("/api/2fa/status").json()
    assert st["enabled"] and st["recovery_codes_left"] == 10
    # At rest: no plaintext secret or recovery code anywhere in the record
    rec = store.get(mfa.NS, "alice")
    raw = json.dumps(rec)
    assert s["secret"] not in raw and not any(x.replace("-", "") in raw or x in raw for x in codes)
    from services.crypto_utils import decrypt
    assert decrypt(rec["secret_enc"]) == s["secret"]
    # Setup can't start again while on
    assert c.post("/api/2fa/setup").status_code == 409


# ── Password sign-in ───────────────────────────────────────────────────────

def test_password_sign_in_needs_the_code_and_challenge_is_single_use(app, clock):
    c = signup(app)
    secret, _ = enroll(c, clock)
    d, body = password_step(app)
    assert body["mfa_required"] is True and "token" not in body
    assert "access_token" not in d.cookies and d.get("/api/ping").status_code == 401
    r = d.post("/api/auth/login/mfa", json={"challenge": body["challenge"], "code": code_at(secret, clock["t"])})
    assert r.status_code == 200, r.text
    assert r.json()["username"] == "alice" and d.get("/api/ping").status_code == 200
    # The same challenge can't be completed twice, even with a fresh code
    clock["t"] += 30
    again = client(app).post("/api/auth/login/mfa", json={"challenge": body["challenge"], "code": code_at(secret, clock["t"])})
    assert again.status_code == 401 and again.json()["code"] == "expired"


def test_challenge_from_cookie_and_forged_or_expired_tokens(app, clock):
    c = signup(app)
    secret, _ = enroll(c, clock)
    d, _ = password_step(app)
    assert d.cookies.get(mfa.CHALLENGE_COOKIE)
    assert d.post("/api/auth/login/mfa", json={"code": code_at(secret, clock["t"])}).status_code == 200
    forged = jwt.encode({"typ": "mfa", "sub": "alice", "jti": "x", "exp": 9999999999}, "not-the-key", algorithm="HS256")
    r = client(app).post("/api/auth/login/mfa", json={"challenge": forged, "code": "123456"})
    assert r.status_code == 401 and r.json()["code"] == "expired"
    # A session token is not a challenge token
    r = client(app).post("/api/auth/login/mfa", json={"challenge": auth.create_token("alice"), "code": "123456"})
    assert r.json()["code"] == "expired"
    # Server-side expiry (5 minutes)
    _, body = password_step(app)
    clock["t"] += mfa.CHALLENGE_SECONDS + 1
    r = client(app).post("/api/auth/login/mfa", json={"challenge": body["challenge"], "code": code_at(secret, clock["t"])})
    assert r.json()["code"] == "expired"


def _wrong(secret, t):
    good = {code_at(secret, t, o) for o in (-1, 0, 1)}
    return next(f"{n:06d}" for n in range(1000000) if f"{n:06d}" not in good)


def test_wrong_codes_lock_the_challenge_then_the_user(app, clock):
    c = signup(app)
    secret, _ = enroll(c, clock)
    _, body = password_step(app)
    wrong = _wrong(secret, clock["t"])
    for i in range(mfa.MAX_CHALLENGE_ATTEMPTS):
        r = client(app).post("/api/auth/login/mfa", json={"challenge": body["challenge"], "code": wrong})
        assert r.status_code == 401
    assert r.json()["code"] == "expired"  # the fifth wrong code ends the challenge
    r = client(app).post("/api/auth/login/mfa", json={"challenge": body["challenge"], "code": code_at(secret, clock["t"])})
    assert r.json()["code"] == "expired"
    # Per-user limit across challenges: 10 wrong codes in 15 minutes locks the code step
    _, body2 = password_step(app)
    for _ in range(mfa.MAX_USER_FAILURES - mfa.MAX_CHALLENGE_ATTEMPTS):
        client(app).post("/api/auth/login/mfa", json={"challenge": body2["challenge"], "code": wrong})
    _, body3 = password_step(app)
    r = client(app).post("/api/auth/login/mfa", json={"challenge": body3["challenge"], "code": code_at(secret, clock["t"])})
    assert r.status_code == 429 and r.json()["code"] == "locked"
    clock["t"] += mfa.FAILURE_WINDOW + 30
    _, body4 = password_step(app)
    r = client(app).post("/api/auth/login/mfa", json={"challenge": body4["challenge"], "code": code_at(secret, clock["t"])})
    assert r.status_code == 200


def test_a_code_is_accepted_only_once_and_never_an_older_one(app, clock):
    c = signup(app)
    secret, _ = enroll(c, clock)
    code = code_at(secret, clock["t"])
    _, b1 = password_step(app)
    assert client(app).post("/api/auth/login/mfa", json={"challenge": b1["challenge"], "code": code}).status_code == 200
    _, b2 = password_step(app)
    r = client(app).post("/api/auth/login/mfa", json={"challenge": b2["challenge"], "code": code})
    assert r.status_code == 401 and r.json()["code"] == "reused_code"
    # The previous step's code is inside the drift window but older than the one used: refused
    r = client(app).post("/api/auth/login/mfa", json={"challenge": b2["challenge"], "code": code_at(secret, clock["t"], -1)})
    assert r.json()["code"] == "reused_code"
    # Drift: the next step's code (phone clock 30 s ahead) works; two steps ahead doesn't
    r = client(app).post("/api/auth/login/mfa", json={"challenge": b2["challenge"], "code": code_at(secret, clock["t"], 2)})
    assert r.json()["code"] == "invalid_code"
    r = client(app).post("/api/auth/login/mfa", json={"challenge": b2["challenge"], "code": code_at(secret, clock["t"], 1)})
    assert r.status_code == 200


def test_recovery_codes_work_once(app, clock):
    c = signup(app)
    _, codes = enroll(c, clock)
    _, b1 = password_step(app)
    r = client(app).post("/api/auth/login/mfa", json={"challenge": b1["challenge"], "code": codes[3].upper()})
    assert r.status_code == 200, r.text
    _, b2 = password_step(app)
    r = client(app).post("/api/auth/login/mfa", json={"challenge": b2["challenge"], "code": codes[3]})
    assert r.status_code == 401 and r.json()["code"] == "invalid_code"
    assert c.get("/api/2fa/status").json()["recovery_codes_left"] == 9
    r = client(app).post("/api/auth/login/mfa", json={"challenge": b2["challenge"], "code": codes[4].replace("-", " ")})
    assert r.status_code == 200


def test_regenerate_recovery_codes_replaces_the_old_ones(app, clock):
    c = signup(app)
    secret, old = enroll(c, clock)
    r = c.post("/api/2fa/recovery-codes", json={"code": code_at(secret, clock["t"])})
    assert r.status_code == 200
    new = r.json()["recovery_codes"]
    assert len(new) == 10 and not set(new) & set(old)
    _, b = password_step(app)
    assert client(app).post("/api/auth/login/mfa", json={"challenge": b["challenge"], "code": old[0]}).status_code == 401
    assert client(app).post("/api/auth/login/mfa", json={"challenge": b["challenge"], "code": new[0]}).status_code == 200


def test_disable_needs_password_and_code(app, clock):
    c = signup(app)
    secret, _ = enroll(c, clock)
    r = c.post("/api/2fa/disable", json={"password": "wrong-password!", "code": code_at(secret, clock["t"])})
    assert r.status_code == 400 and r.json()["code"] == "bad_password"
    r = c.post("/api/2fa/disable", json={"password": PW, "code": _wrong(secret, clock["t"])})
    assert r.status_code == 401
    assert mfa.is_enabled("alice")
    r = c.post("/api/2fa/disable", json={"password": PW, "code": code_at(secret, clock["t"])})
    assert r.status_code == 200 and not mfa.is_enabled("alice")
    assert store.get(mfa.NS, "alice") is None
    _, body = password_step(app)
    assert "token" in body and "mfa_required" not in body


def test_sso_only_account_disables_with_code_alone(app, clock):
    c = signup(app)
    secret, _ = enroll(c, clock)
    store.update(store.SHARED, "users", lambda us: [{**u, "sso_only": True} for u in us], [])
    r = c.post("/api/2fa/disable", json={"code": code_at(secret, clock["t"])})
    assert r.status_code == 200 and not mfa.is_enabled("alice")


def test_users_without_mfa_are_unaffected(app, clock):
    signup(app)
    d, body = password_step(app)
    assert body["token"] and body["mfa_enrollment_required"] is False and "mfa_required" not in body
    assert d.get("/api/ping").status_code == 200
    me = d.get("/api/auth/me").json()
    assert me["mfa_enrollment_required"] is False
    st = d.get("/api/2fa/status").json()
    assert st["enabled"] is False and st["required_by"] == [] and st["enrollment_required"] is False


def test_account_deletion_removes_mfa_and_export_has_no_secrets(app, clock):
    c = signup(app)
    secret, codes = enroll(c, clock)
    text = c.get("/api/account/export").text
    assert secret not in text and "secret_enc" not in text and "recovery_codes" not in text
    assert c.post("/api/auth/delete-account", json={"password": PW, "confirm": "DELETE"}).status_code == 200
    assert store.get(mfa.NS, "alice") is None


def test_support_reset(app, clock):
    c = signup(app)
    enroll(c, clock)
    out = mfa.reset("alice", actor="support:test")
    assert out["was_enabled"] and out["sessions_ended"] >= 1
    assert not mfa.is_enabled("alice") and c.get("/api/ping").status_code == 401
    _, body = password_step(app)
    assert "token" in body


# ── SSO ────────────────────────────────────────────────────────────────────

def _fake_oidc(monkeypatch, username):
    from services import sso

    async def fake(provider, code, state):
        return {"username": username, "next": "/portfolio", "provider": provider}
    monkeypatch.setattr(sso, "oidc_callback", fake)


def test_oidc_sign_in_asks_for_the_code_when_mfa_is_on(app, clock, monkeypatch):
    signup(app)
    _fake_oidc(monkeypatch, "alice")
    d = client(app)
    r = d.get("/api/sso/oidc/google/callback?code=c&state=s")
    assert r.status_code == 303 and r.headers["location"] == "/portfolio"  # no MFA: straight in
    assert d.get("/api/ping").status_code == 200

    c = signup(app, "bob")
    secret, _ = enroll(c, clock)
    _fake_oidc(monkeypatch, "bob")
    e = client(app)
    r = e.get("/api/sso/oidc/google/callback?code=c&state=s")
    assert r.status_code == 303 and r.headers["location"].startswith("/login?mfa=1&next=%2Fportfolio")
    assert "access_token" not in e.cookies and e.get("/api/ping").status_code == 401
    r = e.post("/api/auth/login/mfa", json={"code": code_at(secret, clock["t"])})  # challenge from the cookie
    assert r.status_code == 200 and r.json()["next"] == "/portfolio" and r.json()["username"] == "bob"
    assert e.get("/api/ping").status_code == 200
    from services import sessions
    assert {s["method"] for s in sessions.list_active("bob")} >= {"google"}


# ── Firm policy (Postgres) ─────────────────────────────────────────────────

def _firm(app, admin="alice", **policy):
    from services import firms

    f = firms.create(admin, "Acme")
    if policy:
        firms.update_policy(admin, f["id"], policy)
    return f


@requires_pg
def test_firm_required_enrollment_gate(app, clock):
    from services import firms

    a = signup(app, "alice")
    signup(app, "bob")
    signup(app, "erin")  # not in the firm
    f = _firm(app, sso_domains=[])
    firms.accept_invite("bob", firms.invite("alice", f["id"], "pm")["token"])
    r = a.put(f"/api/firms/{f['id']}", json={"mfa_required": True})
    assert r.status_code == 200 and r.json()["mfa_required"] is True and r.json()["idp_mfa"] is False
    mfa.clear_cache()

    b, body = password_step(app, "bob")
    assert body["mfa_enrollment_required"] is True
    r = b.get("/api/ping")
    assert r.status_code == 403 and r.json()["mfa_enrollment_required"] is True
    assert b.get("/api/auth/me").json()["mfa_enrollment_required"] is True
    st = b.get("/api/2fa/status").json()
    assert st["required_by"] == ["Acme"] and st["enrollment_required"] is True
    secret, _ = enroll(b, clock)
    assert b.get("/api/ping").status_code == 200  # same session, now enrolled
    # Can't turn it off while the firm requires it
    r = b.post("/api/2fa/disable", json={"password": PW, "code": code_at(secret, clock["t"])})
    assert r.status_code == 403 and r.json()["code"] == "required"
    # The admin's existing session is gated as well (policy applies to every member)
    assert a.get("/api/ping").status_code == 403
    # Individuals are unaffected
    e, body = password_step(app, "erin")
    assert body["mfa_enrollment_required"] is False and e.get("/api/ping").status_code == 200


def _fake_saml(monkeypatch, username, firm_id):
    from services import sso

    def fake(slug, resp, relay):
        return {"username": username, "next": "/", "provider": f"saml:{firm_id}", "firm_id": firm_id}
    monkeypatch.setattr(sso, "saml_acs", fake)


@requires_pg
def test_saml_sign_in_and_identity_provider_mfa_policy(app, clock, monkeypatch):
    from services import firms

    signup(app, "alice")
    b = signup(app, "bob")
    f = _firm(app, mfa_required=True)
    firms.accept_invite("bob", firms.invite("alice", f["id"], "analyst")["token"])
    mfa.clear_cache()
    _fake_saml(monkeypatch, "bob", f["id"])

    # No MFA, IdP not trusted: signed in but limited to enrollment
    d = client(app)
    r = d.post(f"/api/sso/saml/{f['slug']}/acs", data={"SAMLResponse": "x", "RelayState": "y"})
    assert r.status_code == 303 and r.headers["location"] == "/"
    assert d.get("/api/ping").status_code == 403

    # The firm says its IdP enforces MFA: that firm's SAML sessions meet the requirement
    firms.update_policy("alice", f["id"], {"idp_mfa": True})
    mfa.clear_cache()
    d = client(app)
    d.post(f"/api/sso/saml/{f['slug']}/acs", data={"SAMLResponse": "x", "RelayState": "y"})
    assert d.get("/api/ping").status_code == 200
    # ... but a password sign-in still has to enroll
    p, body = password_step(app, "bob")
    assert body["mfa_enrollment_required"] is True and p.get("/api/ping").status_code == 403

    # With MFA on: no code step for the trusted IdP; a code step once the firm stops trusting it
    secret, _ = enroll(b, clock)
    d = client(app)
    r = d.post(f"/api/sso/saml/{f['slug']}/acs", data={"SAMLResponse": "x", "RelayState": "y"})
    assert r.headers["location"] == "/" and d.get("/api/ping").status_code == 200
    firms.update_policy("alice", f["id"], {"idp_mfa": False})
    d = client(app)
    r = d.post(f"/api/sso/saml/{f['slug']}/acs", data={"SAMLResponse": "x", "RelayState": "y"})
    assert r.headers["location"].startswith("/login?mfa=1") and d.get("/api/ping").status_code == 401
    r = d.post("/api/auth/login/mfa", json={"code": code_at(secret, clock["t"])})
    assert r.status_code == 200 and d.get("/api/ping").status_code == 200


@requires_pg
def test_audit_events(app, clock):
    from services import audit_events

    c = signup(app)
    secret, codes = enroll(c, clock)
    _, b = password_step(app)
    client(app).post("/api/auth/login/mfa", json={"challenge": b["challenge"], "code": _wrong(secret, clock["t"])})
    client(app).post("/api/auth/login/mfa", json={"challenge": b["challenge"], "code": codes[0]})
    c.post("/api/2fa/recovery-codes", json={"code": code_at(secret, clock["t"])})
    clock["t"] += 30
    c.post("/api/2fa/disable", json={"password": PW, "code": code_at(secret, clock["t"])})
    actions = [e["action"] for e in audit_events.query(actor="alice", limit=100)]
    for a in ("mfa.enabled", "mfa.challenge_failed", "mfa.recovery_used", "mfa.recovery_regenerated", "mfa.disabled"):
        assert a in actions, (a, actions)
    login = next(e for e in audit_events.query(actor="alice", action="auth.login", limit=10))
    assert login["detail"]["mfa"] == "recovery"


def test_gated_members_can_still_leave_with_their_data():
    from services import mfa as m

    for path in ("/api/auth/delete-account", "/api/account/export", "/api/auth/logout", "/api/2fa/setup"):
        assert m.path_allowed_during_enrollment(path), path
    for path in ("/api/portfolios/", "/api/trades/", "/api/firms/x"):
        assert not m.path_allowed_during_enrollment(path), path
