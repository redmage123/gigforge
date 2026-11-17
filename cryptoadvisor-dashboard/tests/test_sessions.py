"""Sign-in sessions: listed per user, revocable, enforced on every request.

Runs on the in-memory backend by default and on Postgres when TEST_DATABASE_URL is set.
"""

import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from jose import jwt  # noqa: E402

from services import auth, sessions  # noqa: E402

PW = "correct-horse-battery"


def _app():
    from api.user_sessions import router as sessions_router
    from middleware.auth import AuthMiddleware
    from routers.auth import router as auth_router

    app = FastAPI()
    app.add_middleware(AuthMiddleware)
    app.include_router(auth_router, prefix="/api/auth")
    app.include_router(sessions_router, prefix="/api/sessions")

    @app.get("/api/ping")
    async def ping():
        return {"ok": True}
    return app


@pytest.fixture
def app():
    return _app()


def device(app, ua="Mozilla/5.0 Firefox/130"):
    return TestClient(app, headers={"user-agent": ua})


def signup(app, username="alice"):
    c = device(app)
    r = c.post("/api/auth/register", json={"first_name": "A", "last_name": "B", "username": username,
                                           "password": PW, "confirm_password": PW})
    assert r.status_code == 201, r.text
    return c


def login(app, username="alice", ua="Mozilla/5.0 Chrome/130"):
    c = device(app, ua)
    r = c.post("/api/auth/login", json={"username": username, "password": PW})
    assert r.status_code == 200, r.text
    return c


def ok(c):
    return c.get("/api/ping").status_code == 200


def test_each_sign_in_is_listed_with_its_device(app):
    a = signup(app)
    b = login(app, ua="Mozilla/5.0 (iPhone) Safari/604")
    listed = a.get("/api/sessions/").json()["sessions"]
    assert len(listed) == 2
    mine = [s for s in listed if s["current"]]
    assert len(mine) == 1 and mine[0]["method"] == "register" and "Firefox" in mine[0]["user_agent"]
    other = next(s for s in listed if not s["current"])
    assert other["method"] == "password" and "iPhone" in other["user_agent"]
    assert ok(b)


def test_revoking_a_session_signs_that_device_out_at_once(app):
    a = signup(app)
    b = login(app)
    assert ok(b)
    other = next(s for s in a.get("/api/sessions/").json()["sessions"] if not s["current"])
    assert a.delete(f"/api/sessions/{other['id']}").status_code == 200
    r = b.get("/api/ping")
    assert r.status_code == 401 and "session has ended" in r.json()["error"]
    assert ok(a)
    assert len(a.get("/api/sessions/").json()["sessions"]) == 1


def test_revoke_others_keeps_this_device(app):
    a = signup(app)
    others = [login(app) for _ in range(3)]
    assert a.post("/api/sessions/revoke-others").json() == {"ended": 3}
    assert ok(a) and not any(ok(o) for o in others)


def test_you_cannot_end_someone_elses_session(app):
    alice = signup(app, "alice")
    bob = signup(app, "bob")
    bob_sid = bob.get("/api/sessions/").json()["sessions"][0]["id"]
    assert alice.delete(f"/api/sessions/{bob_sid}").status_code == 404
    assert ok(bob)
    # And the list never shows other people's sessions
    assert all(s["current"] for s in alice.get("/api/sessions/").json()["sessions"])


def test_current_session_is_ended_by_logging_out_not_revoke(app):
    a = signup(app)
    sid = a.get("/api/sessions/").json()["sessions"][0]["id"]
    assert a.delete(f"/api/sessions/{sid}").status_code == 400


def test_logout_kills_copies_of_the_token(app):
    a = signup(app)
    token = a.cookies.get("access_token")
    thief = TestClient(app)
    thief.cookies.set("access_token", token)
    assert ok(thief)
    assert a.post("/api/auth/logout").status_code == 200
    assert not ok(thief)


def test_password_change_signs_out_other_devices(app):
    a = signup(app)
    b = login(app)
    r = a.post("/api/auth/change-password", json={"current_password": PW, "new_password": "another-long-password",
                                                  "confirm_password": "another-long-password"})
    assert r.status_code == 200 and r.json()["other_sessions_ended"] == 1
    assert ok(a) and not ok(b)


def test_bearer_header_is_checked_the_same_way(app):
    a = signup(app)
    token = a.cookies.get("access_token")
    api_client = TestClient(app, headers={"authorization": f"Bearer {token}"})
    assert ok(api_client)
    sessions.revoke_all("alice")
    assert not ok(api_client)


def test_tokens_without_a_live_session_are_refused():
    # Signed correctly but issued before sessions existed (no sid)
    legacy = jwt.encode({"sub": "alice", "role": "user", "exp": auth.datetime.now(auth.timezone.utc) + timedelta(hours=1)},
                        auth.SECRET_KEY, algorithm=auth.JWT_ALGORITHM)
    assert auth.decode_token(legacy) and auth.verify_session_token(legacy) is None
    # A real session id, but claimed for another user
    sid = sessions.create("bob", hours=1)
    forged = jwt.encode({"sub": "alice", "sid": sid, "exp": auth.datetime.now(auth.timezone.utc) + timedelta(hours=1)},
                        auth.SECRET_KEY, algorithm=auth.JWT_ALGORITHM)
    assert auth.verify_session_token(forged) is None
    assert auth.verify_session_token("") is None and auth.verify_session_token("garbage") is None


def test_expired_sessions_are_refused_and_cleaned_up():
    import asyncio

    sid = sessions.create("alice", hours=-1)          # already past its expiry
    assert not sessions.is_active(sid, "alice")
    assert sessions.list_active("alice") == []
    old = sessions.create("alice", hours=-(sessions.KEEP_DAYS + 1) * 24)
    live = sessions.create("alice", hours=1)
    asyncio.run(sessions.cleanup())
    assert sessions.is_active(live, "alice")
    assert not _stored(old) and _stored(live)


def _stored(sid):
    from services import db, store

    if store.using_postgres():
        with db.conn() as c:
            return c.execute("SELECT 1 FROM sessions WHERE id = %s", (sid,)).fetchone() is not None
    return sid in sessions._memory


def test_revocation_beats_the_cache():
    sid = sessions.create("alice", hours=1)
    assert sessions.is_active(sid, "alice")       # now cached as active
    sessions.revoke("alice", sid)
    assert not sessions.is_active(sid, "alice")


def test_account_deletion_ends_and_forgets_sessions(app):
    a = signup(app)
    b = login(app)
    r = a.post("/api/auth/delete-account", json={"password": PW, "confirm": "DELETE"})
    assert r.status_code == 200, r.text
    assert not ok(b)
    assert sessions.list_active("alice") == []
