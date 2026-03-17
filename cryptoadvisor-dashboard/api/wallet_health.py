"""Wallet health scan API."""

from fastapi import APIRouter, Request, Query

router = APIRouter()


@router.get("/")
async def wallet_health_scan(request: Request, address: str = Query(...), chain: str = Query(default="ethereum")):
    username = request.state.user.get("sub", "")
    return {
        "address": address,
        "chain": chain,
        "health_score": 0.0,
        "token_count": 0,
        "nft_count": 0,
        "approvals_at_risk": 0,
        "dust_tokens": 0,
        "recommendations": [],
        "username": username,
    }
