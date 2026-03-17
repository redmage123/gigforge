"""DCA (Dollar-Cost Averaging) automation scheduler service."""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from config import DATA_DIR

DCA_DIR = DATA_DIR / "dca_plans"


def _ensure_dir() -> None:
    """Ensure the DCA plans directory exists."""
    DCA_DIR.mkdir(parents=True, exist_ok=True)


def _user_file(username: str) -> Path:
    """Get the path to a user's DCA plans file."""
    return DCA_DIR / f"{username}.json"


def _load_plans(username: str) -> list[dict]:
    """Load a user's DCA plans from disk."""
    path = _user_file(username)
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return []


def _save_plans(username: str, plans: list[dict]) -> None:
    """Save a user's DCA plans to disk."""
    _ensure_dir()
    _user_file(username).write_text(json.dumps(plans, indent=2, default=str))


async def create_dca_plan(username: str, plan: dict) -> dict:
    """
    Create a new DCA plan.

    plan: {
        coin: str,                    # e.g. "BTC"
        exchange: str,                # e.g. "binance"
        amount_usd: float,            # e.g. 100.0
        frequency: str,               # "daily", "weekly", "monthly"
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


def get_dca_plans(username: str) -> list[dict]:
    """List all DCA plans for a user."""
    return _load_plans(username)


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
    """
    Placeholder for executing a DCA buy.

    In production this would call the exchange service to place a market order.
    For now, logs the intended buy.
    """
    now = datetime.now(timezone.utc)
    execution = {
        "timestamp": now.isoformat(),
        "coin": plan["coin"],
        "exchange": plan["exchange"],
        "amount_usd": plan["amount_usd"],
        "status": "simulated",  # Would be "executed" with real exchange integration
        "note": "Placeholder: actual exchange execution requires exchange API keys",
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

    freq = plan.get("frequency", "weekly")
    elapsed_days = (now - last_dt).days

    if freq == "daily" and elapsed_days >= 1:
        return True
    if freq == "weekly" and elapsed_days >= 7:
        return True
    if freq == "monthly" and elapsed_days >= 30:
        return True

    return False


async def check_and_execute_dcas() -> None:
    """Check all users' plans and execute any that are due."""
    _ensure_dir()

    for plan_file in DCA_DIR.glob("*.json"):
        username = plan_file.stem
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
