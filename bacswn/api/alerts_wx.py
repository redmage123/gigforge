"""BACSWN — Weather alerts API router."""

from fastapi import APIRouter
from services.nws_client import fetch_alerts
from services.awc_client import fetch_sigmets

router = APIRouter()


@router.get("/active")
async def get_active_alerts():
    """Get active weather alerts affecting Bahamas."""
    alerts = await fetch_alerts()
    sigmets = await fetch_sigmets()
    return {
        "nws_alerts": alerts,
        "sigmets": sigmets,
        "total_nws": len(alerts),
        "total_sigmets": len(sigmets),
    }


@router.get("/nws")
async def get_nws_alerts():
    """Get NWS alerts only."""
    alerts = await fetch_alerts()
    return {"alerts": alerts, "count": len(alerts)}


@router.get("/sigmets")
async def get_sigmets():
    """Get active SIGMETs/AIRMETs."""
    sigmets = await fetch_sigmets()
    return {"sigmets": sigmets, "count": len(sigmets)}
