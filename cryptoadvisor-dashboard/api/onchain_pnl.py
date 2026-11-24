"""On-chain activity, value and gas for an Ethereum address (keyless Blockscout data)."""

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from services.onchain_pnl import PnLError, analyze

router = APIRouter()

UNSUPPORTED = ("Only Ethereum mainnet is supported. The free, keyless explorers for other chains "
               "block automated requests.")


@router.get("/")
async def token_pnl(
    address: str = Query(..., max_length=64, description="Ethereum address"),
    chain: str = Query("ethereum", description="Only ethereum is supported"),
):
    if chain != "ethereum":
        return JSONResponse({"detail": UNSUPPORTED}, status_code=400)
    try:
        return await analyze(address)
    except PnLError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=exc.status)


@router.get("/summary")
async def transaction_summary(address: str = Query(..., max_length=64)):
    """Short form: totals and gas, without the token table."""
    try:
        d = await analyze(address)
    except PnLError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=exc.status)
    return {"address": d["address"], "chain": d["chain"], "transactions_read": d["transactions_read"],
            "gas": d["gas"], "total_value_usd": d["total_value_usd"], "first_activity": d["first_activity"],
            "last_activity": d["last_activity"], "truncated": d["truncated"], "notes": d["notes"]}
