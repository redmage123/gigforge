"""BACSWN — communication channels API router.

What: lists the configured alert channels and a per-type summary.

Why: the dispatch console shows where an alert would go before it is sent.

How: read-only views of ``services.channel_dispatcher.CHANNELS``.
"""

from fastapi import APIRouter
from services.channel_dispatcher import CHANNELS, get_channel_summary

router = APIRouter()


@router.get("/")
async def list_channels():
    """Get all configured communication channels."""
    return {"channels": CHANNELS, "total": len(CHANNELS)}


@router.get("/summary")
async def channel_summary():
    """Get channel summary by type."""
    return get_channel_summary()
