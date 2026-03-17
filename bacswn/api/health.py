"""BACSWN — Health check API router."""

from fastapi import APIRouter
from datetime import datetime, timezone
from services.cache import cache
from services.agent_orchestrator import orchestrator
from services.websocket_manager import ws_manager

router = APIRouter()


@router.get("/")
async def health_check():
    """System health check."""
    return {
        "status": "healthy",
        "service": "BACSWN SkyWatch Bahamas",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cache_keys": len(cache.keys()),
        "ws_connections": ws_manager.connection_count,
        "agents": {a["name"]: a["status"] for a in orchestrator.get_all_status()},
    }
