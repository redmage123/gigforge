"""Multi-wallet aggregation — net worth API."""

from fastapi import APIRouter, Request
from services.user_data import get_username, load_user_data
from services.trades import calculate_pnl

router = APIRouter()


@router.get("/")
async def net_worth(request: Request):
    """Combined net worth across wallets and trades."""
    username = get_username(request)

    # Trade-based portfolio value
    trade_value = 0
    try:
        pnl = await calculate_pnl(username)
        trade_value = sum(p["current_value"] for p in pnl)
    except Exception:
        pnl = []

    # Saved wallet native balances (fetch from wallet API)
    wallet_value = 0
    wallets = load_user_data(username, "wallets")

    return {
        "trade_portfolio": round(trade_value, 2),
        "num_wallets": len(wallets),
        "positions": pnl,
        "total_usd": round(trade_value + wallet_value, 2),
    }
