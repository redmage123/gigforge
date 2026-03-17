"""Payment service scaffold — supports Stripe (card) and crypto (BTC/ETH).

Currently DISABLED for testing. Set PAYMENTS_ENABLED=true in env to activate.
"""

import os
from datetime import datetime, timezone
from pathlib import Path
from services.user_data import load_user_data, save_user_data

# Master kill switch — payments are disabled until launch
PAYMENTS_ENABLED = os.getenv("PAYMENTS_ENABLED", "false").lower() == "true"

# Stripe config (set in env when ready)
STRIPE_PUBLIC_KEY = os.getenv("STRIPE_PUBLIC_KEY", "")
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

# Crypto payment addresses (set in env when ready)
BTC_PAYMENT_ADDRESS = os.getenv("BTC_PAYMENT_ADDRESS", "")
ETH_PAYMENT_ADDRESS = os.getenv("ETH_PAYMENT_ADDRESS", "")

# Subscription plans
PLANS = [
    {
        "id": "free",
        "name": "Free",
        "price_usd": 0,
        "price_btc": 0,
        "price_eth": 0,
        "interval": None,
        "features": [
            "Market dashboard",
            "Basic portfolio tracking",
            "5 price alerts",
            "Community support",
        ],
    },
    {
        "id": "pro",
        "name": "Pro",
        "price_usd": 19.99,
        "price_btc": 0.00020,
        "price_eth": 0.008,
        "interval": "month",
        "features": [
            "Everything in Free",
            "Unlimited alerts",
            "AI market briefings",
            "Technical analysis tools",
            "On-chain analytics",
            "Email support",
        ],
    },
    {
        "id": "premium",
        "name": "Premium",
        "price_usd": 49.99,
        "price_btc": 0.00050,
        "price_eth": 0.020,
        "interval": "month",
        "features": [
            "Everything in Pro",
            "AI portfolio builder",
            "AI trading coach",
            "Copy trading",
            "DCA automation",
            "Whale tracking",
            "Priority support",
        ],
    },
]


def is_payments_enabled() -> bool:
    return PAYMENTS_ENABLED


def get_plans() -> list[dict]:
    return PLANS


def get_user_subscription(username: str) -> dict:
    """Get the user's current subscription."""
    data = load_user_data(username, "subscription")
    if not data:
        return {
            "plan_id": "free",
            "status": "active",
            "payment_method": None,
            "started_at": None,
            "expires_at": None,
        }
    return data


def get_payment_history(username: str) -> list[dict]:
    """Get user's payment history."""
    data = load_user_data(username, "payments")
    return data if isinstance(data, list) else []


def save_subscription(username: str, subscription: dict) -> None:
    save_user_data(username, "subscription", subscription)


def save_payment(username: str, payment: dict) -> None:
    history = get_payment_history(username)
    history.insert(0, payment)
    save_user_data(username, "payments", history)


# --- Stripe scaffolds (no-op until enabled) ---

def create_stripe_checkout_session(username: str, plan_id: str) -> dict:
    """Create a Stripe checkout session. Returns session URL."""
    if not PAYMENTS_ENABLED:
        return {"error": "Payments are currently disabled"}

    # TODO: Implement when Stripe keys are configured
    # import stripe
    # stripe.api_key = STRIPE_SECRET_KEY
    # session = stripe.checkout.Session.create(
    #     payment_method_types=["card"],
    #     line_items=[{"price": plan_stripe_price_id, "quantity": 1}],
    #     mode="subscription",
    #     success_url="https://yourdomain.com/billing?success=true",
    #     cancel_url="https://yourdomain.com/billing?canceled=true",
    #     metadata={"username": username, "plan_id": plan_id},
    # )
    # return {"checkout_url": session.url, "session_id": session.id}
    return {"error": "Stripe integration not yet configured"}


def handle_stripe_webhook(payload: bytes, sig_header: str) -> dict:
    """Process Stripe webhook events."""
    if not PAYMENTS_ENABLED:
        return {"error": "Payments are currently disabled"}

    # TODO: Implement when Stripe keys are configured
    # import stripe
    # stripe.api_key = STRIPE_SECRET_KEY
    # event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    # if event["type"] == "checkout.session.completed":
    #     session = event["data"]["object"]
    #     username = session["metadata"]["username"]
    #     plan_id = session["metadata"]["plan_id"]
    #     save_subscription(username, {...})
    #     save_payment(username, {...})
    return {"received": True}


# --- Crypto payment scaffolds (no-op until enabled) ---

def create_crypto_payment_request(username: str, plan_id: str, currency: str) -> dict:
    """Generate a crypto payment request with address and amount."""
    if not PAYMENTS_ENABLED:
        return {"error": "Payments are currently disabled"}

    plan = next((p for p in PLANS if p["id"] == plan_id), None)
    if not plan or plan["price_usd"] == 0:
        return {"error": "Invalid plan"}

    if currency == "btc":
        if not BTC_PAYMENT_ADDRESS:
            return {"error": "BTC payments not yet configured"}
        return {
            "address": BTC_PAYMENT_ADDRESS,
            "amount": plan["price_btc"],
            "currency": "BTC",
            "plan_id": plan_id,
            "memo": f"cryptoadvisor-{username}-{plan_id}",
        }
    elif currency == "eth":
        if not ETH_PAYMENT_ADDRESS:
            return {"error": "ETH payments not yet configured"}
        return {
            "address": ETH_PAYMENT_ADDRESS,
            "amount": plan["price_eth"],
            "currency": "ETH",
            "plan_id": plan_id,
            "memo": f"cryptoadvisor-{username}-{plan_id}",
        }

    return {"error": f"Unsupported currency: {currency}"}


def verify_crypto_payment(username: str, tx_hash: str, currency: str) -> dict:
    """Verify a crypto payment on-chain. Scaffold only."""
    if not PAYMENTS_ENABLED:
        return {"error": "Payments are currently disabled"}

    # TODO: Implement on-chain verification
    # - For BTC: query Blockstream API for tx confirmation
    # - For ETH: use web3.py to check tx receipt and amount
    return {"error": "On-chain verification not yet implemented"}
