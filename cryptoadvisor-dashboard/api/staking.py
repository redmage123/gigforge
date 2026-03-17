"""Staking position endpoints."""

from fastapi import APIRouter, Request, Query
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/")
async def staking_summary(
    request: Request,
    address: str = Query(..., description="Wallet address"),
):
    try:
        username = request.state.user.get("sub", "")
        # Placeholder: aggregate staking positions across all chains
        return {
            "address": address,
            "total_staked_usd": 0.0,
            "positions": [],
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/eth")
async def eth_staking(
    request: Request,
    address: str = Query(..., description="Ethereum address"),
):
    try:
        username = request.state.user.get("sub", "")
        # Placeholder: fetch ETH staking via Lido, Rocket Pool, etc.
        return {
            "address": address,
            "chain": "ethereum",
            "providers": {
                "lido": {"staked_eth": 0.0, "steth_balance": 0.0, "apy": 0.0},
                "rocket_pool": {"staked_eth": 0.0, "reth_balance": 0.0, "apy": 0.0},
            },
            "total_staked_eth": 0.0,
            "total_staked_usd": 0.0,
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/sol")
async def sol_staking(
    request: Request,
    address: str = Query(..., description="Solana address"),
):
    try:
        username = request.state.user.get("sub", "")
        # Placeholder: fetch Solana staking positions
        return {
            "address": address,
            "chain": "solana",
            "positions": [],
            "total_staked_sol": 0.0,
            "total_staked_usd": 0.0,
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
