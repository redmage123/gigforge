"""Liquidations API: a rolling window collected live from Binance's public futures stream."""

from fastapi import APIRouter, Query

from services import liquidations

router = APIRouter()


@router.get("/")
async def recent_liquidations(limit: int = Query(default=100, ge=1, le=500)):
    liquidations.ensure_collector()
    return {"liquidations": liquidations.recent(limit), "status": liquidations.status()}


@router.get("/summary")
async def liquidation_summary():
    liquidations.ensure_collector()
    return {**liquidations.summary(), "status": liquidations.status()}
