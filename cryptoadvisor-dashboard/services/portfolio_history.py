"""Portfolio history — daily value snapshots for historical charts."""

import time
from services.user_data import load_user_data, save_user_data, DATA_DIR
from services.trades import calculate_pnl


async def take_snapshot(username: str) -> dict | None:
    """Take a portfolio value snapshot for the user."""
    try:
        pnl = await calculate_pnl(username)
    except Exception:
        pnl = []

    if not pnl:
        return None

    total = sum(p["current_value"] for p in pnl)
    breakdown = {p["coin_id"]: p["current_value"] for p in pnl}
    date = time.strftime("%Y-%m-%d")

    history = load_user_data(username, "portfolio_history")
    # Replace today's entry if exists
    history = [h for h in history if h.get("date") != date]
    entry = {"date": date, "total_usd": round(total, 2), "breakdown": breakdown, "timestamp": time.time()}
    history.append(entry)
    # Keep last 365 days
    history = history[-365:]
    save_user_data(username, "portfolio_history", history)
    return entry


async def take_all_snapshots():
    """Background task: snapshot all users with trades."""
    trades_dir = DATA_DIR / "trades"
    if not trades_dir.exists():
        return
    for f in trades_dir.glob("*.json"):
        username = f.stem
        try:
            await take_snapshot(username)
        except Exception as e:
            print(f"[portfolio_history] Snapshot error for {username}: {e}")


def get_history(username: str, days: int = 90) -> list[dict]:
    history = load_user_data(username, "portfolio_history")
    return history[-days:]
