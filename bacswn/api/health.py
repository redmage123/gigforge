"""BACSWN — health check API router.

What: ``GET /health/`` returns service status, cache size, WebSocket connections per
channel and each agent's status.

Why: a public, unauthenticated probe for load balancers, uptime monitors and the
deploy scripts.

How: reads in-memory state only (no database or upstream calls), so it stays fast and
answers even when external feeds are down.
"""

from fastapi import APIRouter
from datetime import datetime, timezone
from services.cache import cache
from services.agent_orchestrator import orchestrator
from services.websocket_manager import ws_manager

router = APIRouter()


@router.get("/")
async def health_check():
    """Report liveness plus cache, WebSocket and agent status."""
    return {
        "status": "healthy",
        "service": "BACSWN SkyWatch Bahamas",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cache_keys": len(cache.keys()),
        "ws_connections": ws_manager.connection_count,
        "agents": {a["name"]: a["status"] for a in orchestrator.get_all_status()},
    }
