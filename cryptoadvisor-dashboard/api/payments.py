"""Billing: plans, the user's subscription, Stripe checkout and subscription management.

GET  /api/payments/status          {enabled, card}
GET  /api/payments/plans
GET  /api/payments/subscription    the signed-in user's plan (and whether it includes WhatsApp)
GET  /api/payments/history
POST /api/payments/checkout/stripe {plan_id} -> {checkout_url}
POST /api/payments/portal          -> {url} (Stripe's page to change card, see invoices or cancel)
POST /api/payments/webhook/stripe  Stripe's servers (public; checked against the webhook signature)
"""

import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from services import payments
from services.user_data import get_username

logger = logging.getLogger(__name__)
router = APIRouter()

DISABLED_MSG = {"enabled": False, "message": "Paid plans aren't available yet."}


def _user(request: Request) -> str:
    u = get_username(request)
    return "" if u == "anonymous" else u


@router.get("/status")
async def payment_status():
    return {"enabled": payments.is_payments_enabled(), "card": payments.card_payments_ready()}


@router.get("/plans")
async def list_plans():
    return {"plans": payments.get_plans(), "enabled": payments.is_payments_enabled()}


@router.get("/subscription")
async def current_subscription(request: Request):
    username = _user(request)
    if not username:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    return payments.public_subscription(username)


@router.get("/history")
async def payment_history(request: Request):
    username = _user(request)
    if not username:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    return {"payments": payments.get_payment_history(username), "enabled": payments.is_payments_enabled()}


@router.post("/checkout/stripe")
async def stripe_checkout(request: Request):
    if not payments.card_payments_ready():
        return JSONResponse(status_code=503, content=DISABLED_MSG)
    username = _user(request)
    if not username:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    try:
        body = await request.json()
    except ValueError:
        body = {}
    result = await payments.create_checkout(username, str((body or {}).get("plan_id", "pro")))
    if "error" in result:
        return JSONResponse(status_code=400, content=result)
    from services import audit_events
    audit_events.from_request(request, "billing.checkout_started", detail={"plan": body.get("plan_id", "pro")})
    return result


@router.post("/portal")
async def portal(request: Request):
    username = _user(request)
    if not username:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    result = await payments.create_portal(username)
    if "error" in result:
        return JSONResponse(status_code=400, content=result)
    return result


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    try:
        event = payments.verify_webhook(payload, request.headers.get("stripe-signature", ""))
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    try:
        logger.info("stripe %s: %s", event.get("id"), await payments.handle_event(event))
    except Exception:  # noqa: BLE001
        # A 500 makes Stripe retry the event later, which is what we want
        logger.exception("stripe event %s failed", event.get("id"))
        return JSONResponse(status_code=500, content={"error": "event not processed"})
    return {"received": True}
