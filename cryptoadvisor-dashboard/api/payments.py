"""Payment API router — billing, subscriptions, and payment processing."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from services.payments import (
    is_payments_enabled,
    get_plans,
    get_user_subscription,
    get_payment_history,
    create_stripe_checkout_session,
    create_crypto_payment_request,
    verify_crypto_payment,
    handle_stripe_webhook,
)

router = APIRouter()

DISABLED_MSG = {
    "enabled": False,
    "message": "Payments are coming soon. We're currently in testing mode.",
}


def _get_username(request: Request) -> str:
    user = getattr(request.state, "user", {})
    return user.get("sub", "")


@router.get("/status")
async def payment_status():
    """Check if the payment system is enabled."""
    if not is_payments_enabled():
        return DISABLED_MSG
    return {"enabled": True}


@router.get("/plans")
async def list_plans():
    """List available subscription plans (always visible for display)."""
    return {"plans": get_plans(), "enabled": is_payments_enabled()}


@router.get("/subscription")
async def current_subscription(request: Request):
    """Get the current user's subscription."""
    username = _get_username(request)
    if not username:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    sub = get_user_subscription(username)
    sub["enabled"] = is_payments_enabled()
    return sub


@router.get("/history")
async def payment_history(request: Request):
    """Get the user's payment history."""
    username = _get_username(request)
    if not username:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    return {"payments": get_payment_history(username), "enabled": is_payments_enabled()}


@router.post("/checkout/stripe")
async def stripe_checkout(request: Request):
    """Create a Stripe checkout session for card payments."""
    if not is_payments_enabled():
        return JSONResponse(status_code=503, content=DISABLED_MSG)

    username = _get_username(request)
    if not username:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    body = await request.json()
    plan_id = body.get("plan_id", "")
    result = create_stripe_checkout_session(username, plan_id)
    if "error" in result:
        return JSONResponse(status_code=400, content=result)
    return result


@router.post("/checkout/crypto")
async def crypto_checkout(request: Request):
    """Generate a crypto payment request."""
    if not is_payments_enabled():
        return JSONResponse(status_code=503, content=DISABLED_MSG)

    username = _get_username(request)
    if not username:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    body = await request.json()
    plan_id = body.get("plan_id", "")
    currency = body.get("currency", "").lower()
    result = create_crypto_payment_request(username, plan_id, currency)
    if "error" in result:
        return JSONResponse(status_code=400, content=result)
    return result


@router.post("/verify/crypto")
async def verify_crypto(request: Request):
    """Verify a crypto payment transaction."""
    if not is_payments_enabled():
        return JSONResponse(status_code=503, content=DISABLED_MSG)

    username = _get_username(request)
    if not username:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    body = await request.json()
    tx_hash = body.get("tx_hash", "")
    currency = body.get("currency", "").lower()
    result = verify_crypto_payment(username, tx_hash, currency)
    if "error" in result:
        return JSONResponse(status_code=400, content=result)
    return result


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events (called by Stripe, not the frontend)."""
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    result = handle_stripe_webhook(payload, sig)
    return result
