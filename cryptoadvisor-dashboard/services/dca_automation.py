"""DCA (Dollar-Cost Averaging) plan tracker.

The app holds no trading permissions and places no orders: when a plan is due, the hourly scheduler
only records a simulated purchase in the plan's log (status "simulated").
"""

import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from config import DATA_DIR
from services import store

DCA_DIR = DATA_DIR / "dca_plans"
FREQUENCY_DAYS = {"daily": 1, "weekly": 7, "monthly": 30}


def _ensure_dir() -> None:
    """Ensure the DCA plans directory exists."""
    DCA_DIR.mkdir(parents=True, exist_ok=True)


def _user_file(username: str) -> Path:
    """Get the path to a user's DCA plans file."""
    return DCA_DIR / f"{username}.json"


def _load_plans(username: str) -> list[dict]:
    return store.get("dca_plans", username, [])


def _save_plans(username: str, plans: list[dict]) -> None:
    store.put("dca_plans", username, plans)


async def create_dca_plan(username: str, plan: dict) -> dict:
    """
    Create a new DCA plan.

    plan: {
        coin: str,                    # e.g. "BTC"
        exchange: str,                # e.g. "binance"
        amount_usd: float,            # e.g. 100.0
        frequency: str,               # one of FREQUENCY_DAYS
        start_date: str               # e.g. "2026-03-10"
    }
    """
    plans = _load_plans(username)

    new_plan = {
        "plan_id": str(uuid.uuid4())[:8],
        "coin": plan.get("coin", "BTC").upper(),
        "exchange": plan.get("exchange", "binance"),
        "amount_usd": float(plan.get("amount_usd", 100)),
        "frequency": plan.get("frequency", "weekly"),
        "start_date": plan.get("start_date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "active",
        "total_invested": 0.0,
        "total_coins_bought": 0.0,
        "execution_count": 0,
        "last_executed": None,
        "execution_log": [],
    }

    plans.append(new_plan)
    _save_plans(username, plans)
    return new_plan


def next_execution(plan: dict, now: datetime | None = None) -> str | None:
    """When the scheduler will next log this plan's (simulated) buy, as an ISO timestamp.

    The scheduler checks hourly, so a plan that is already due runs within the hour.
    """
    if plan.get("status") != "active":
        return None
    now = now or datetime.now(timezone.utc)
    try:
        start = datetime.strptime(plan["start_date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except (KeyError, ValueError, TypeError):
        return None
    last = plan.get("last_executed")
    if not last:
        return max(start, now).isoformat()
    try:
        last_dt = datetime.fromisoformat(last)
    except (ValueError, TypeError):
        return now.isoformat()
    due = last_dt + timedelta(days=FREQUENCY_DAYS.get(plan.get("frequency"), 7))
    return max(due, now).isoformat()


def get_dca_plans(username: str) -> list[dict]:
    """List all DCA plans for a user, each with its computed next (simulated) execution."""
    return [{**p, "next_execution": next_execution(p)} for p in _load_plans(username)]


def delete_dca_plan(username: str, plan_id: str) -> bool:
    """Delete a DCA plan by ID."""
    plans = _load_plans(username)
    original_count = len(plans)
    plans = [p for p in plans if p.get("plan_id") != plan_id]

    if len(plans) == original_count:
        return False

    _save_plans(username, plans)
    return True


async def execute_dca_buy(plan: dict) -> dict:
    """Record a simulated DCA buy. No order is sent to any exchange."""
    now = datetime.now(timezone.utc)
    execution = {
        "timestamp": now.isoformat(),
        "coin": plan["coin"],
        "exchange": plan["exchange"],
        "amount_usd": plan["amount_usd"],
        "status": "simulated",
        "note": "Simulated: AssetAdvisor does not place orders",
    }
    return execution


def _is_due(plan: dict) -> bool:
    """Check if a DCA plan is due for execution."""
    now = datetime.now(timezone.utc)
    start = datetime.strptime(plan["start_date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)

    if now < start:
        return False

    last_executed = plan.get("last_executed")
    if not last_executed:
        return True

    try:
        last_dt = datetime.fromisoformat(last_executed)
    except (ValueError, TypeError):
        return True

    return (now - last_dt).days >= FREQUENCY_DAYS.get(plan.get("frequency", "weekly"), 7)


async def check_and_execute_dcas() -> None:
    """Check all users' plans and execute any that are due."""
    _ensure_dir()

    for username in store.keys("dca_plans"):
        plans = _load_plans(username)
        modified = False

        for plan in plans:
            if plan.get("status") != "active":
                continue

            if not _is_due(plan):
                continue

            result = await execute_dca_buy(plan)

            plan["last_executed"] = datetime.now(timezone.utc).isoformat()
            plan["execution_count"] = plan.get("execution_count", 0) + 1
            plan["total_invested"] = plan.get("total_invested", 0) + plan["amount_usd"]

            log = plan.get("execution_log", [])
            log.append(result)
            # Keep last 100 executions
            plan["execution_log"] = log[-100:]
            modified = True

        if modified:
            _save_plans(username, plans)
