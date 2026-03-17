"""Mempool stats API for ETH and BTC."""

from fastapi import APIRouter, Request, Query

router = APIRouter()


@router.get("/")
async def combined_mempool(request: Request):
    username = request.state.user.get("sub", "")
    return {
        "eth": {"pending_txns": 0, "avg_gas_gwei": 0.0, "congestion": "low"},
        "btc": {"pending_txns": 0, "avg_fee_sat_vb": 0.0, "congestion": "low"},
        "username": username,
    }


@router.get("/eth")
async def eth_mempool(request: Request):
    username = request.state.user.get("sub", "")
    return {
        "chain": "eth",
        "pending_txns": 0,
        "avg_gas_gwei": 0.0,
        "base_fee_gwei": 0.0,
        "congestion": "low",
        "username": username,
    }


@router.get("/btc")
async def btc_mempool(request: Request):
    username = request.state.user.get("sub", "")
    return {
        "chain": "btc",
        "pending_txns": 0,
        "avg_fee_sat_vb": 0.0,
        "recommended_fee_sat_vb": 0.0,
        "congestion": "low",
        "username": username,
    }
