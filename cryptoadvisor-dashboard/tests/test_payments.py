"""Paid plans: WhatsApp only with Pro, Stripe checkout and its signed webhook, support grants. Stripe is stubbed."""

import asyncio
import hashlib
import hmac
import json
import sys
import time
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from services import payments, store, whatsapp  # noqa: E402

WHSEC = "whsec_test_secret"
PHONE = "353861234567"


def run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("PAYMENTS_ENABLED", "true")
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_x")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", WHSEC)
    monkeypatch.delenv("STRIPE_PRICE_PRO", raising=False)
    for k, v in {"WHATSAPP_TOKEN": "t", "WHATSAPP_PHONE_NUMBER_ID": "123", "WHATSAPP_DISPLAY_NUMBER": "35315550100",
                 "WHATSAPP_APP_SECRET": "s", "WHATSAPP_VERIFY_TOKEN": "v"}.items():
        monkeypatch.setenv(k, v)
    for u in ("payer", "freebie"):
        store.delete("subscription", u)
        store.delete("payments", u)
        store.delete(whatsapp.NAMESPACE, u)
    store.put(store.SHARED, payments.CUSTOMERS, {})
    store.put(store.SHARED, whatsapp.LINKS, {})
    store.put(store.SHARED, whatsapp.CODES, {})
    whatsapp._seen.clear()
    whatsapp._chat_times.clear()
    calls = []

    async def fake_stripe(method, path, data=None):
        calls.append((method, path, data))
        if path == "/checkout/sessions":
            return {"id": "cs_1", "url": "https://checkout.stripe.test/cs_1"}
        if path.startswith("/subscriptions/"):
            return sub_obj()
        if path == "/billing_portal/sessions":
            return {"url": "https://billing.stripe.test/p_1"}
        return {}

    monkeypatch.setattr(payments, "_stripe", fake_stripe)
    sent = []

    async def fake_post(payload):
        sent.append(payload)
        return True, ""

    monkeypatch.setattr(whatsapp, "_post", fake_post)
    with patch("services.auth.load_users", lambda: [{"username": u} for u in ("payer", "freebie")]):
        yield {"calls": calls, "sent": sent}


def sub_obj(status="active", end=None, sid="sub_1", **kw):
    return {"id": sid, "object": "subscription", "customer": "cus_1", "status": status, "start_date": 1700000000,
            "items": {"data": [{"current_period_end": end or int(time.time()) + 30 * 86400}]},
            "metadata": {"username": "payer", "plan_id": "pro"}, **kw}


def event(kind, obj, created=None):
    return {"id": f"evt_{time.time_ns()}", "type": kind, "created": created or int(time.time()), "data": {"object": obj}}


def signed(payload: bytes, secret=WHSEC, ts=None):
    ts = ts or int(time.time())
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    return f"t={ts},v1={sig}"


def link(username):
    code = whatsapp.start_link(username)["code"]
    return run(whatsapp.handle({"id": f"w{time.time_ns()}", "from": PHONE, "text": f"LINK {code}"}))


# ── Entitlement ─────────────────────────────────────────────────────────────

def test_free_users_get_no_whatsapp(env):
    assert not payments.has_whatsapp("freebie")
    assert payments.public_subscription("freebie")["plan_id"] == "free"
    link("freebie")                                       # (an old link from before WhatsApp was paid)
    ok, why = run(whatsapp.send_to_user("freebie", "BTC above 60,000", "alerts"))
    assert not ok and "Pro plan" in why
    reply = run(whatsapp.handle({"id": "w-chat", "from": PHONE, "text": "How is my portfolio?"}))
    assert "Pro plan" in reply and "/billing" in reply
    # Opting out always works
    assert "Paused" in run(whatsapp.handle({"id": "w-stop", "from": PHONE, "text": "STOP"}))
    assert not whatsapp.public_state("freebie")["entitled"]


def test_link_endpoint_refuses_without_a_plan(env):
    from api.whatsapp import router

    app = FastAPI()

    @app.middleware("http")
    async def as_user(request, call_next):
        request.state.user = {"sub": "freebie"}
        return await call_next(request)

    app.include_router(router, prefix="/api/whatsapp")
    r = TestClient(app).post("/api/whatsapp/link")
    assert r.status_code == 402 and "Pro" in r.json()["error"]


def test_paid_subscription_turns_whatsapp_on_and_cancellation_off(env):
    run(payments.handle_event(event("customer.subscription.created", sub_obj())))
    assert payments.has_whatsapp("payer")
    link("payer")
    ok, _ = run(whatsapp.send_to_user("payer", "BTC above 60,000", "alerts"))
    assert ok and env["sent"]
    # Card failing: Stripe retries for a while, WhatsApp keeps working
    run(payments.handle_event(event("customer.subscription.updated", sub_obj("past_due"))))
    assert payments.has_whatsapp("payer")
    # Cancelled at the end of the period
    run(payments.handle_event(event("customer.subscription.deleted", sub_obj("canceled"), created=int(time.time()) + 5)))
    assert not payments.has_whatsapp("payer")
    assert payments.get_user_subscription("payer")["plan_id"] == "free"


def test_a_lapsed_period_ends_access_even_if_a_webhook_is_missed(env):
    run(payments.handle_event(event("customer.subscription.created", sub_obj(end=int(time.time()) - 4 * 86400))))
    assert not payments.has_whatsapp("payer")
    run(payments.handle_event(event("customer.subscription.updated", sub_obj(end=int(time.time()) - 86400),
                                    created=int(time.time()) + 1)))
    assert payments.has_whatsapp("payer")                 # inside the 3-day grace


def test_events_out_of_order_dont_undo_newer_state(env):
    now = int(time.time())
    run(payments.handle_event(event("customer.subscription.deleted", sub_obj("canceled"), created=now)))
    run(payments.handle_event(event("customer.subscription.created", sub_obj("active"), created=now - 60)))
    assert not payments.has_whatsapp("payer")


def test_support_grant_and_revoke(env):
    with pytest.raises(ValueError):
        payments.grant("nobody", actor="support:x", reason="test")
    with pytest.raises(ValueError):
        payments.grant("freebie", actor="", reason="")
    payments.grant("freebie", "pro", days=30, actor="support:x", reason="beta tester")
    assert payments.has_whatsapp("freebie")
    assert payments.public_subscription("freebie")["payment_method"] == "comp"
    assert not payments.has_whatsapp("freebie", now=time.time() + 40 * 86400)
    payments.revoke("freebie", actor="support:x", reason="beta over")
    assert not payments.has_whatsapp("freebie")


# ── Checkout and portal ─────────────────────────────────────────────────────

def test_checkout_creates_a_monthly_subscription_for_the_user(env):
    out = run(payments.create_checkout("payer", "pro"))
    assert out["checkout_url"].startswith("https://checkout.stripe.test/")
    method, path, data = env["calls"][-1]
    assert (method, path, data["mode"]) == ("POST", "/checkout/sessions", "subscription")
    assert data["metadata"] == {"username": "payer", "plan_id": "pro"} == data["subscription_data"]["metadata"]
    item = data["line_items"][0]["price_data"]
    assert item["unit_amount"] == 1999 and item["recurring"] == {"interval": "month"}
    assert data["success_url"].endswith("/billing?checkout=success")
    assert run(payments.create_checkout("payer", "free"))["error"]


def test_checkout_uses_a_configured_price_and_refuses_a_second_subscription(env, monkeypatch):
    monkeypatch.setenv("STRIPE_PRICE_PRO", "price_123")
    run(payments.create_checkout("payer", "pro"))
    assert env["calls"][-1][2]["line_items"] == [{"price": "price_123", "quantity": 1}]
    run(payments.handle_event(event("customer.subscription.created", sub_obj())))
    assert "already" in run(payments.create_checkout("payer", "pro"))["error"]
    assert run(payments.create_portal("payer"))["url"].startswith("https://billing.stripe.test/")
    assert "error" in run(payments.create_portal("freebie"))


def test_checkout_is_off_until_payments_are_enabled(env, monkeypatch):
    monkeypatch.setenv("PAYMENTS_ENABLED", "false")
    assert "error" in run(payments.create_checkout("payer", "pro"))


def test_stripe_form_encoding():
    assert payments._form({"a": {"b": [{"c": 1}, "x"]}, "t": True, "n": None}) == [
        ("a[b][0][c]", "1"), ("a[b][1]", "x"), ("t", "true")]


# ── Webhook ─────────────────────────────────────────────────────────────────

def _client():
    from api.payments import router
    from middleware.auth import AuthMiddleware
    from middleware.csrf import CSRFMiddleware

    app = FastAPI()
    app.add_middleware(CSRFMiddleware)
    app.add_middleware(AuthMiddleware)
    app.include_router(router, prefix="/api/payments")
    return TestClient(app)


def test_webhook_needs_stripes_signature(env):
    c = _client()
    body = json.dumps(event("checkout.session.completed", {"mode": "subscription", "customer": "cus_1",
                                                           "subscription": "sub_1", "client_reference_id": "payer",
                                                           "metadata": {"username": "payer", "plan_id": "pro"}})).encode()
    assert c.post("/api/payments/webhook/stripe", content=body).status_code == 400
    assert c.post("/api/payments/webhook/stripe", content=body,
                  headers={"stripe-signature": signed(body, "whsec_wrong")}).status_code == 400
    assert c.post("/api/payments/webhook/stripe", content=body,
                  headers={"stripe-signature": signed(body, ts=int(time.time()) - 3600)}).status_code == 400
    assert not payments.has_whatsapp("payer")
    # Public (no session, no CSRF token) with a valid signature
    r = c.post("/api/payments/webhook/stripe", content=body, headers={"stripe-signature": signed(body)})
    assert r.status_code == 200
    assert payments.has_whatsapp("payer")
    assert payments._username_for_customer("cus_1") == "payer"
    # Everything else needs a session
    assert c.get("/api/payments/subscription").status_code == 401


def test_invoices_go_into_the_payment_history(env):
    run(payments.handle_event(event("customer.subscription.created", sub_obj())))
    inv = {"id": "in_1", "customer": "cus_1", "amount_paid": 1999, "currency": "usd", "created": 1764000000,
           "hosted_invoice_url": "https://invoice.stripe.test/in_1"}
    run(payments.handle_event(event("invoice.paid", inv)))
    run(payments.handle_event(event("invoice.paid", inv)))          # Stripe retries: recorded once
    run(payments.handle_event(event("invoice.payment_failed", {**inv, "id": "in_2", "amount_due": 1999})))
    h = payments.get_payment_history("payer")
    assert [(p["id"], p["status"], p["amount"]) for p in h] == [("in_2", "failed", "19.99 USD"), ("in_1", "completed", "19.99 USD")]


def test_deleting_an_account_cancels_its_subscription(env):
    run(payments.handle_event(event("customer.subscription.created", sub_obj())))
    run(payments.cancel_on_account_deletion("payer"))
    assert ("DELETE", "/subscriptions/sub_1", None) in env["calls"]
