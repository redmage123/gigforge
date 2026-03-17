"""BACSWN — Distributed Mesh Network API router."""

from fastapi import APIRouter
from services.mesh_network import get_mesh_status, get_node_detail, trigger_consensus

router = APIRouter()


@router.get("/status")
async def mesh_status():
    """Get full mesh network status — all nodes, links, messages, consensus."""
    return get_mesh_status()


@router.get("/node/{station_id}")
async def node_detail(station_id: str):
    """Get detailed info for a single mesh node."""
    node = get_node_detail(station_id.upper())
    if not node:
        return {"error": "Node not found"}
    return node


@router.post("/consensus")
async def run_consensus(event_type: str = "weather_alert"):
    """Trigger a new consensus vote."""
    return trigger_consensus(event_type)
