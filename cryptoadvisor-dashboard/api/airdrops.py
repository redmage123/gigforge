"""Airdrop eligibility and activity score endpoints."""

from fastapi import APIRouter, Request, Query
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/check")
async def check_eligibility(
    request: Request,
    address: str = Query(..., description="Wallet address"),
):
    try:
        username = request.state.user.get("sub", "")
        # Placeholder: check airdrop eligibility criteria
        return {
            "address": address,
            "eligibility": [],
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/score")
async def activity_score(
    request: Request,
    address: str = Query(..., description="Wallet address"),
):
    try:
        username = request.state.user.get("sub", "")
        # Placeholder: calculate on-chain activity score
        return {
            "address": address,
            "score": 0,
            "breakdown": {
                "transaction_count": 0,
                "unique_protocols": 0,
                "unique_chains": 0,
                "nft_activity": 0,
                "defi_activity": 0,
                "governance_participation": 0,
            },
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
