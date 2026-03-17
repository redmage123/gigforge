"""Multisig (Gnosis Safe) API."""

from fastapi import APIRouter, Request, Query

router = APIRouter()


@router.get("/{address}")
async def safe_info(request: Request, address: str):
    username = request.state.user.get("sub", "")
    return {
        "address": address,
        "owners": [],
        "threshold": 0,
        "nonce": 0,
        "version": None,
        "username": username,
    }


@router.get("/{address}/pending")
async def pending_transactions(request: Request, address: str):
    username = request.state.user.get("sub", "")
    return {
        "address": address,
        "pending": [],
        "count": 0,
        "username": username,
    }


@router.get("/{address}/balances")
async def safe_balances(request: Request, address: str):
    username = request.state.user.get("sub", "")
    return {
        "address": address,
        "balances": [],
        "total_usd": 0.0,
        "username": username,
    }
