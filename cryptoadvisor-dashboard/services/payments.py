"""Plans, subscriptions and card payments through Stripe.

WhatsApp is the paid feature: Meta charges per message, so it comes with a paid plan (PAID_PLANS).
Everything else in AssetAdvisor stays free.

Configuration (environment):
  PAYMENTS_ENABLED        "true" to let people subscribe (the Billing page shows "Coming soon" otherwise)
  STRIPE_SECRET_KEY       sk_test_... or sk_live_...
  STRIPE_WEBHOOK_SECRET   whsec_... of the webhook endpoint /api/payments/webhook/stripe
  STRIPE_PRICE_PRO        optional: a recurring Price id; without it the checkout uses PLAN_PRO_PRICE_USD
  PLAN_PRO_PRICE_USD      monthly price shown and charged when no Price id is set (default 19.99)

Stripe is the source of truth: the webhook keeps each user's subscription record in step with it
(created, renewed, payment failed, cancelled). Support can also give a plan without payment (grant()).

Subscription record (per user, namespace "subscription"):
  plan_id, status (active | trialing | past_due | canceled | unpaid | incomplete ...), payment_method
  ("card" | "comp"), started_at, expires_at (ISO), period_end (epoch), cancel_at_period_end,
  stripe_customer_id, stripe_subscription_id, event_at (the newest Stripe event applied).
"""

import hashlib
import hmac
import json
import logging
import os
import time
from datetime import datetime, timezone

import httpx

from services.user_data import load_user_data, save_user_data, update_shared_data, load_shared_data

logger = logging.getLogger(__name__)

STRIPE_API = "https://api.stripe.com/v1"
CUSTOMERS = "stripe_customers"          # shared: {customer_id: {"username": ...}}
PAID_PLANS = {"pro", "premium"}         # plans that include WhatsApp ("premium" kept for old records)
LIVE_STATUSES = {"active", "trialing", "past_due"}   # past_due: Stripe is still retrying the card
GRACE = 3 * 86400                       # a renewal webhook that arrives late doesn't cut anyone off
SIGNATURE_TOLERANCE = 300


def is_payments_enabled() -> bool:
    return os.getenv("PAYMENTS_ENABLED", "false").lower() == "true"


def _secret_key() -> str:
    return os.getenv("STRIPE_SECRET_KEY", "")


def card_payments_ready() -> bool:
    return is_payments_enabled() and bool(_secret_key())


def _pro_price() -> float:
    try:
        return round(float(os.getenv("PLAN_PRO_PRICE_USD", "19.99")), 2)
    except ValueError:
        return 19.99


def get_plans() -> list[dict]:
    return [
        {"id": "free", "name": "Free", "price_usd": 0, "interval": None, "features": [
            "Every dashboard, chart and indicator",
            "Portfolios, trades, tax report and DCA plans",
            "Unlimited alerts in the app and by email",
            "AI assistant and briefings in the app",
        ]},
        {"id": "pro", "name": "Pro", "price_usd": _pro_price(), "interval": "month", "features": [
            "Everything in Free",
            "Alerts on WhatsApp, with their time scale",
            "In-Play and the daily AI briefing on WhatsApp",
            "Chat with the assistant from WhatsApp",
        ]},
    ]


def _plan(plan_id: str) -> dict | None:
    return next((p for p in get_plans() if p["id"] == plan_id), None)


# ── Subscriptions and entitlement ───────────────────────────────────────────

FREE = {"plan_id": "free", "status": "active", "payment_method": None, "started_at": None, "expires_at": None}


def get_user_subscription(username: str) -> dict:
    data = load_user_data(username, "subscription")
    return {**FREE, **data} if isinstance(data, dict) and data else dict(FREE)


def save_subscription(username: str, subscription: dict) -> None:
    save_user_data(username, "subscription", subscription)


def has_whatsapp(username: str, now: float | None = None) -> bool:
    """True while the user's plan includes WhatsApp and is paid up (or given by support)."""
    if not username:
        return False
    sub = get_user_subscription(username)
    if sub.get("plan_id") not in PAID_PLANS or sub.get("status") not in LIVE_STATUSES:
        return False
    end = sub.get("period_end")
    return not end or float(end) + GRACE > (now or time.time())


def public_subscription(username: str) -> dict:
    sub = get_user_subscription(username)
    return {
        "plan_id": sub["plan_id"] if has_whatsapp(username) or sub["plan_id"] == "free" else "free",
        "status": sub.get("status"),
        "payment_method": sub.get("payment_method"),
        "expires_at": sub.get("expires_at"),
        "cancel_at_period_end": bool(sub.get("cancel_at_period_end")),
        "whatsapp": has_whatsapp(username),
        "can_manage": bool(sub.get("stripe_customer_id")) and card_payments_ready(),
        "enabled": is_payments_enabled(),
        "card": card_payments_ready(),
    }


def _iso(epoch) -> str | None:
    return datetime.fromtimestamp(float(epoch), timezone.utc).isoformat() if epoch else None


def _audit(actor: str, action: str, username: str, **detail) -> None:
    try:
        from services import audit_events
        audit_events.record(actor, action, target=username, detail=detail)
    except Exception:  # noqa: BLE001
        logger.exception("audit of %s failed", action)


def grant(username: str, plan_id: str = "pro", days: int | None = None, *, actor: str, reason: str) -> dict:
    """Give a plan without payment (testers, early users, goodwill). days=None: until revoked."""
    if plan_id not in PAID_PLANS:
        raise ValueError(f"unknown paid plan {plan_id!r}")
    if not actor or not reason:
        raise ValueError("actor and reason are required")
    from services.auth import load_users
    if not any(u.get("username") == username for u in load_users()):
        raise ValueError(f"no such user {username!r}")
    current = get_user_subscription(username)
    if current.get("stripe_subscription_id") and current.get("status") in LIVE_STATUSES:
        raise ValueError(f"{username} already pays by card; nothing to grant")
    end = time.time() + days * 86400 if days else None
    sub = {"plan_id": plan_id, "status": "active", "payment_method": "comp",
           "started_at": datetime.now(timezone.utc).isoformat(), "period_end": end, "expires_at": _iso(end),
           "granted_by": actor, "grant_reason": reason}
    save_subscription(username, sub)
    _audit(actor, "billing.grant", username, plan=plan_id, days=days, reason=reason)
    return sub


def revoke(username: str, *, actor: str, reason: str) -> dict:
    current = get_user_subscription(username)
    if current.get("payment_method") != "comp":
        raise ValueError(f"{username} has no granted plan (card subscriptions are cancelled in Stripe)")
    save_subscription(username, dict(FREE))
    _audit(actor, "billing.revoke", username, plan=current.get("plan_id"), reason=reason)
    return dict(FREE)


# ── Payment history ─────────────────────────────────────────────────────────

def get_payment_history(username: str) -> list[dict]:
    data = load_user_data(username, "payments")
    return data if isinstance(data, list) else []


def save_payment(username: str, payment: dict) -> None:
    history = [p for p in get_payment_history(username) if not (payment.get("id") and p.get("id") == payment["id"])]
    history.insert(0, payment)
    save_user_data(username, "payments", history[:200])


# ── Stripe API ──────────────────────────────────────────────────────────────

class StripeError(RuntimeError):
    pass


def _form(data: dict, prefix: str = "") -> list[tuple[str, str]]:
    """Stripe's form encoding: nested dicts and lists as a[b][0]=..."""
    out = []
    for k, v in data.items():
        key = f"{prefix}[{k}]" if prefix else str(k)
        if isinstance(v, dict):
            out += _form(v, key)
        elif isinstance(v, list):
            for i, item in enumerate(v):
                out += _form(item, f"{key}[{i}]") if isinstance(item, dict) else [(f"{key}[{i}]", str(item))]
        elif v is not None:
            out.append((key, "true" if v is True else "false" if v is False else str(v)))
    return out


async def _stripe(method: str, path: str, data: dict | None = None) -> dict:
    key = _secret_key()
    if not key:
        raise StripeError("Stripe isn't configured")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.request(method, f"{STRIPE_API}{path}", auth=(key, ""),
                                     data=_form(data) if data and method != "GET" else None,
                                     params=_form(data) if data and method == "GET" else None)
    except httpx.HTTPError as exc:
        raise StripeError(f"Stripe unreachable: {exc}") from exc
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if r.status_code >= 400:
        raise StripeError((body.get("error") or {}).get("message") or f"Stripe error {r.status_code}")
    return body


def _remember_customer(customer_id: str, username: str) -> None:
    if customer_id and username:
        def put(m):
            m = dict(m or {})
            m[customer_id] = {"username": username}
            return m
        update_shared_data(CUSTOMERS, put, default={})


def _username_for_customer(customer_id: str) -> str | None:
    row = (load_shared_data(CUSTOMERS) or {}).get(customer_id or "")
    return row.get("username") if isinstance(row, dict) else None


async def create_checkout(username: str, plan_id: str) -> dict:
    """A Stripe Checkout page for a monthly subscription; returns {"checkout_url"}."""
    if not card_payments_ready():
        return {"error": "Card payments aren't available yet"}
    plan = _plan(plan_id)
    if not plan or plan["id"] not in PAID_PLANS:
        return {"error": "Unknown plan"}
    current = get_user_subscription(username)
    if current.get("stripe_subscription_id") and current.get("status") in LIVE_STATUSES:
        return {"error": "You already have a subscription. Use Manage subscription to change it."}
    from services.sso import public_url
    base = public_url()
    price_id = os.getenv(f"STRIPE_PRICE_{plan_id.upper()}", "")
    item = {"price": price_id, "quantity": 1} if price_id else {"quantity": 1, "price_data": {
        "currency": "usd", "unit_amount": int(round(plan["price_usd"] * 100)), "recurring": {"interval": "month"},
        "product_data": {"name": f"AssetAdvisor {plan['name']}"}}}
    params = {
        "mode": "subscription",
        "line_items": [item],
        "client_reference_id": username,
        "metadata": {"username": username, "plan_id": plan_id},
        "subscription_data": {"metadata": {"username": username, "plan_id": plan_id}},
        "success_url": f"{base}/billing?checkout=success",
        "cancel_url": f"{base}/billing?checkout=cancelled",
        "allow_promotion_codes": True,
    }
    if current.get("stripe_customer_id"):
        params["customer"] = current["stripe_customer_id"]
    try:
        session = await _stripe("POST", "/checkout/sessions", params)
    except StripeError as exc:
        logger.warning("checkout for %s failed: %s", username, exc)
        return {"error": f"Couldn't start the checkout: {exc}"}
    return {"checkout_url": session.get("url"), "session_id": session.get("id")}


async def create_portal(username: str) -> dict:
    """Stripe's customer portal: change card, see invoices, cancel. Returns {"url"}."""
    customer = get_user_subscription(username).get("stripe_customer_id")
    if not customer or not _secret_key():
        return {"error": "There's no card subscription to manage"}
    from services.sso import public_url
    try:
        s = await _stripe("POST", "/billing_portal/sessions", {"customer": customer, "return_url": f"{public_url()}/billing"})
    except StripeError as exc:
        return {"error": f"Couldn't open subscription management: {exc}"}
    return {"url": s.get("url")}


async def cancel_on_account_deletion(username: str) -> None:
    """Stop billing someone who deletes their account (best effort; logged if Stripe can't be reached)."""
    sub = get_user_subscription(username)
    sid = sub.get("stripe_subscription_id")
    if sid and sub.get("status") in LIVE_STATUSES and _secret_key():
        try:
            await _stripe("DELETE", f"/subscriptions/{sid}")
            _audit("system", "billing.cancel_deleted_account", username, subscription=sid)
        except StripeError as exc:
            logger.error("could not cancel Stripe subscription %s of deleted account %s: %s", sid, username, exc)
            _audit("system", "billing.cancel_failed", username, subscription=sid, error=str(exc))


# ── Webhook ─────────────────────────────────────────────────────────────────

def verify_webhook(payload: bytes, header: str, now: float | None = None) -> dict:
    """The event, if `header` (Stripe-Signature) is a valid signature of `payload`; else ValueError."""
    secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    if not secret:
        raise ValueError("webhook secret not configured")
    parts = [p.split("=", 1) for p in (header or "").split(",") if "=" in p]
    ts = next((v for k, v in parts if k == "t"), "")
    sigs = [v for k, v in parts if k == "v1"]
    if not ts.isdigit() or not sigs:
        raise ValueError("malformed signature header")
    if abs((now or time.time()) - int(ts)) > SIGNATURE_TOLERANCE:
        raise ValueError("signature too old")
    want = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(want, s) for s in sigs):
        raise ValueError("bad signature")
    return json.loads(payload)


def _period_end(obj: dict):
    # Newer Stripe API versions keep the period on the subscription items
    ends = [i.get("current_period_end") for i in (obj.get("items") or {}).get("data") or [] if i.get("current_period_end")]
    return obj.get("current_period_end") or (max(ends) if ends else None)


def _apply_subscription(obj: dict, event_at: int, username: str | None = None) -> str | None:
    meta = obj.get("metadata") or {}
    username = meta.get("username") or username or _username_for_customer(obj.get("customer"))
    if not username:
        logger.warning("Stripe subscription %s has no AssetAdvisor user", obj.get("id"))
        return None
    current = get_user_subscription(username)
    if current.get("stripe_subscription_id") not in (None, obj.get("id")) and current.get("status") in LIVE_STATUSES \
            and obj.get("status") not in LIVE_STATUSES:
        return username                      # an old, ended subscription mustn't override the live one
    if int(current.get("event_at") or 0) > event_at and current.get("stripe_subscription_id") == obj.get("id"):
        return username                      # Stripe can deliver events out of order
    _remember_customer(obj.get("customer"), username)
    status = obj.get("status") or "active"
    end = _period_end(obj)
    live = status in LIVE_STATUSES
    sub = {
        "plan_id": (meta.get("plan_id") or "pro") if live else "free",
        "status": status,
        "payment_method": "card",
        "started_at": current.get("started_at") if current.get("stripe_subscription_id") == obj.get("id") else _iso(obj.get("start_date")),
        "period_end": end if live else None,
        "expires_at": _iso(end) if live else None,
        "cancel_at_period_end": bool(obj.get("cancel_at_period_end")),
        "stripe_customer_id": obj.get("customer"),
        "stripe_subscription_id": obj.get("id"),
        "event_at": event_at,
    }
    save_subscription(username, sub)
    if current.get("status") != status or current.get("plan_id") != sub["plan_id"]:
        _audit("stripe", f"billing.subscription.{status}", username, plan=sub["plan_id"], subscription=obj.get("id"))
    return username


def _record_invoice(inv: dict, paid: bool) -> None:
    username = ((inv.get("subscription_details") or {}).get("metadata") or {}).get("username") \
        or _username_for_customer(inv.get("customer"))
    if not username:
        return
    amount = (inv.get("amount_paid") if paid else inv.get("amount_due")) or 0
    save_payment(username, {
        "id": inv.get("id"),
        "date": _iso(inv.get("created") or time.time()),
        "plan": "Pro",
        "amount": f"{amount / 100:.2f} {(inv.get('currency') or 'usd').upper()}",
        "method": "Card",
        "status": "completed" if paid else "failed",
        "invoice_url": inv.get("hosted_invoice_url"),
    })


async def handle_event(event: dict) -> str:
    """Apply one verified Stripe event; returns what was done (for the log)."""
    kind = event.get("type", "")
    obj = (event.get("data") or {}).get("object") or {}
    at = int(event.get("created") or time.time())
    if kind == "checkout.session.completed" and obj.get("mode") == "subscription":
        username = (obj.get("metadata") or {}).get("username") or obj.get("client_reference_id")
        _remember_customer(obj.get("customer"), username)
        if obj.get("subscription"):
            try:
                sub = await _stripe("GET", f"/subscriptions/{obj['subscription']}")
                _apply_subscription(sub, at, username)
            except StripeError as exc:
                # customer.subscription.created carries the same data, so nothing is lost
                logger.warning("could not fetch subscription after checkout: %s", exc)
        return f"checkout completed for {username}"
    if kind in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
                "customer.subscription.paused", "customer.subscription.resumed"):
        return f"{kind} for {_apply_subscription(obj, at)}"
    if kind in ("invoice.paid", "invoice.payment_failed"):
        _record_invoice(obj, kind == "invoice.paid")
        return kind
    return f"ignored {kind}"
