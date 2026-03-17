"""On-chain profit and loss endpoints."""

from fastapi import APIRouter, Request, Query
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/")
async def token_pnl(
    request: Request,
    address: str = Query(..., description="Wallet address"),
    chain: str = Query(None, description="Optional chain filter"),
):
    try:
        username = request.state.user.get("sub", "")
        # Placeholder: calculate per-token P&L from on-chain transactions
        return {
            "address": address,
            "chain": chain,
            "tokens": [],
            "total_realized_pnl": 0.0,
            "total_unrealized_pnl": 0.0,
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/summary")
async def transaction_summary(
    request: Request,
    address: str = Query(..., description="Wallet address"),
):
    try:
        username = request.state.user.get("sub", "")
        # Placeholder: summarize on-chain transaction history
        return {
            "address": address,
            "transaction_count": 0,
            "total_gas_spent_usd": 0.0,
            "first_transaction": None,
            "last_transaction": None,
            "chains_active": [],
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
