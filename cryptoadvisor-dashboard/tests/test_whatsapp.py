"""WhatsApp: linking by code, opt-out, the 24-hour window, the signed webhook and chat. Meta's API is stubbed."""

import asyncio
import hashlib
import hmac
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from services import store, whatsapp  # noqa: E402

PHONE = "353861234567"
SECRET = "app-secret-for-tests"


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    for k, v in {"WHATSAPP_TOKEN": "t", "WHATSAPP_PHONE_NUMBER_ID": "123", "WHATSAPP_DISPLAY_NUMBER": "+353 1 555 0100",
                 "WHATSAPP_APP_SECRET": SECRET, "WHATSAPP_VERIFY_TOKEN": "verify-me"}.items():
        monkeypatch.setenv(k, v)
    monkeypatch.delenv("WHATSAPP_ALERT_TEMPLATE", raising=False)
    sent = []

    async def fake_post(payload):
        sent.append(payload)
        return True, ""

    monkeypatch.setattr(whatsapp, "_post", fake_post)
    whatsapp._seen.clear()
    whatsapp._chat_times.clear()
    for k in ("alice", "bob"):
        store.delete(whatsapp.NAMESPACE, k)
    store.put(store.SHARED, whatsapp.LINKS, {})
    store.put(store.SHARED, whatsapp.CODES, {})
    return sent


def msg(text, frm=PHONE, mid=None):
    return {"id": mid or f"wamid.{time.time_ns()}", "from": frm, "text": text}


def run(coro):
    return asyncio.run(coro)


def link(username="alice", phone=PHONE):
    code = whatsapp.start_link(username)["code"]
    return run(whatsapp.handle(msg(f"LINK {code}", phone)))


def test_link_with_code_from_the_users_own_whatsapp():
    started = whatsapp.start_link("alice")
    assert started["url"] == f"https://wa.me/35315550100?text=LINK%20{started['code']}"
    assert "isn't linked" in run(whatsapp.handle(msg("hello")))
    reply = run(whatsapp.handle(msg(f"link {started['code']}")))
    assert "now linked" in reply
    st = whatsapp.public_state("alice")
    assert st["linked"] and st["phone"].endswith("4567") and "1234" not in st["phone"] and st["window_open"]
    # The code works once
    assert "expired" in run(whatsapp.handle(msg(f"LINK {started['code']}", "449999999999")))


def test_wrong_or_expired_code(monkeypatch):
    assert "expired" in run(whatsapp.handle(msg("LINK 000000")))
    code = whatsapp.start_link("alice")["code"]
    real = time.time
    monkeypatch.setattr(whatsapp.time, "time", lambda: real() + whatsapp.CODE_TTL + 1)
    assert "expired" in run(whatsapp.handle(msg(f"LINK {code}")))


def test_a_number_belongs_to_one_account():
    link("alice")
    link("bob")
    assert whatsapp.username_for(PHONE) == "bob"
    assert not whatsapp.public_state("alice")["linked"]


def test_stop_start_and_unlink(configured):
    link()
    assert "Paused" in run(whatsapp.handle(msg("STOP")))
    ok, why = run(whatsapp.send_to_user("alice", "BTC alert", "alerts"))
    assert not ok and "paused" in why
    run(whatsapp.handle(msg("start")))
    assert run(whatsapp.send_to_user("alice", "BTC alert", "alerts"))[0]
    run(whatsapp.handle(msg("UNLINK")))
    assert whatsapp.username_for(PHONE) is None and not whatsapp.public_state("alice")["linked"]


def test_preferences_decide_what_is_sent(configured):
    link()
    whatsapp.set_prefs("alice", {"alerts": False, "briefing_hour": 99})
    assert whatsapp.get_state("alice")["prefs"]["briefing_hour"] == 23
    ok, why = run(whatsapp.send_to_user("alice", "x", "alerts"))
    assert not ok and "turned off" in why
    assert run(whatsapp.send_to_user("alice", "x", "in_play"))[0]


def test_outside_the_24_hour_window_only_a_template_may_be_sent(configured, monkeypatch):
    link()
    s = whatsapp.get_state("alice")
    s["last_inbound_at"] = time.time() - whatsapp.WINDOW - 60
    store.put(whatsapp.NAMESPACE, "alice", s)
    ok, why = run(whatsapp.send_to_user("alice", "BTC 30-minute candle closed at 61,000", "alerts"))
    assert not ok and "template" in why
    monkeypatch.setenv("WHATSAPP_ALERT_TEMPLATE", "price_alert")
    configured.clear()
    assert run(whatsapp.send_to_user("alice", "Line one\nLine   two", "alerts"))[0]
    t = configured[0]["template"]
    assert t["name"] == "price_alert" and t["components"][0]["parameters"][0]["text"] == "Line one Line two"


def test_chat_goes_to_the_assistant_and_actions_need_the_app(monkeypatch):
    link()
    from api import assistant

    async def fake_respond(username, text, channel="app"):
        assert username == "alice" and channel == "whatsapp"
        return {"content": f"Echo: {text}", "actions": [{"status": "proposed", "summary": "Set an alert on BTC"}]}, None

    monkeypatch.setattr(assistant, "respond", fake_respond)
    reply = run(whatsapp.handle(msg("How is BTC doing?")))
    assert reply.startswith("Echo: How is BTC doing?") and "confirm it in the app" in reply
    whatsapp.set_prefs("alice", {"chat": False})
    assert "turned off" in run(whatsapp.handle(msg("hi")))


def test_duplicate_deliveries_are_answered_once():
    link()
    assert run(whatsapp.handle(msg("HELP", mid="wamid.same"))) is not None
    assert run(whatsapp.handle(msg("HELP", mid="wamid.same"))) is None


def test_inbound_parsing_ignores_statuses_and_media():
    payload = {"entry": [{"changes": [{"value": {
        "messages": [{"id": "1", "from": "+353 86 123 4567", "type": "text", "text": {"body": " hi "}},
                     {"id": "2", "from": PHONE, "type": "image", "image": {}}],
        "statuses": [{"id": "x", "status": "delivered"}]}}]}]}
    assert whatsapp.inbound_messages(payload) == [{"id": "1", "from": PHONE, "text": "hi"}]


def _app():
    from api.whatsapp import router
    from middleware.auth import AuthMiddleware
    from middleware.csrf import CSRFMiddleware

    app = FastAPI()
    app.add_middleware(CSRFMiddleware)
    app.add_middleware(AuthMiddleware)
    app.include_router(router, prefix="/api/whatsapp")
    return TestClient(app)


def test_webhook_needs_metas_signature(configured):
    c = _app()
    body = json.dumps({"entry": [{"changes": [{"value": {"messages": [
        {"id": "w1", "from": PHONE, "type": "text", "text": {"body": "HELP"}}]}}]}]}).encode()
    # Public (no session, no CSRF token) but refused without a valid signature
    assert c.post("/api/whatsapp/webhook", content=body).status_code == 403
    assert c.post("/api/whatsapp/webhook", content=body, headers={"x-hub-signature-256": "sha256=" + "0" * 64}).status_code == 403
    sig = "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
    assert c.post("/api/whatsapp/webhook", content=body, headers={"x-hub-signature-256": sig}).status_code == 200
    # Meta's one-time verification
    ok = c.get("/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42")
    assert ok.status_code == 200 and ok.text == "42"
    assert c.get("/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42").status_code == 403
    # Everything else under /api/whatsapp still needs a session
    assert c.get("/api/whatsapp/").status_code == 401


def test_unconfigured_server_says_so(monkeypatch):
    monkeypatch.delenv("WHATSAPP_TOKEN")
    assert not whatsapp.available()
    assert not whatsapp.public_state("alice")["available"]
    ok, why = run(whatsapp.send_to_user("alice", "x", "alerts"))
    assert not ok and "not configured" in why


def test_account_deletion_removes_the_link():
    link()
    from services import account

    run(account.delete_account("alice"))
    assert whatsapp.username_for(PHONE) is None
