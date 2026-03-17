"""Rug-pull / token risk analysis API."""

from fastapi import APIRouter, Request, Query

router = APIRouter()


@router.get("/")
async def analyze_token(
    request: Request,
    token_address: str = Query(...),
    chain: str = Query(default="ethereum"),
):
    username = request.state.user.get("sub", "")
    return {
        "token_address": token_address,
        "chain": chain,
        "risk_score": 0.0,
        "flags": [],
        "liquidity_locked": False,
        "ownership_renounced": False,
        "honeypot": False,
        "top_holders_pct": 0.0,
        "username": username,
    }
