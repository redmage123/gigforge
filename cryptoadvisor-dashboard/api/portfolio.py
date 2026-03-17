"""Portfolio API endpoints — multi-tenant, per-user data."""

from fastapi import APIRouter, Request
from services.memory import get_portfolio, get_signals, get_watchlist
from services.trades import get_trades, calculate_pnl

router = APIRouter()


def _get_username(request: Request) -> str:
    user = getattr(request.state, "user", {})
    return user.get("sub", "")


@router.get("/holdings")
async def holdings(request: Request):
    username = _get_username(request)
    portfolio = get_portfolio(username)

    # Merge with the user's tracked trades / P&L if they have any
    if username:
        try:
            pnl = await calculate_pnl(username)
            if pnl:
                portfolio["positions"] = pnl
                portfolio["total_value"] = round(
                    sum(p["current_value"] for p in pnl), 2
                )
        except Exception:
            pass  # fall back to memory-only data

    return portfolio


@router.get("/signals")
async def signals(request: Request):
    username = _get_username(request)
    return get_signals(username)


@router.get("/watchlist")
async def watchlist(request: Request):
    username = _get_username(request)
    return get_watchlist(username)
