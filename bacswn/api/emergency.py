"""BACSWN — Emergency response API router."""

from fastapi import APIRouter
from pydantic import BaseModel
from services.channel_dispatcher import dispatch_alert, get_channel_summary
from services.database import db_insert, db_select

router = APIRouter()


class EmergencyAlert(BaseModel):
    title: str
    description: str
    severity: str = "warning"
    incident_type: str = "weather"
    channel_types: list[str] | None = None


class IncidentReport(BaseModel):
    incident_type: str
    severity: str
    title: str
    description: str
    station_id: str = ""
    latitude: float | None = None
    longitude: float | None = None


@router.post("/dispatch")
async def dispatch_emergency(alert: EmergencyAlert):
    """Dispatch emergency alert to all configured channels."""
    results = await dispatch_alert(
        subject=alert.title,
        body=alert.description,
        severity=alert.severity,
        channel_types=alert.channel_types,
    )
    return {
        "dispatched": True,
        "channels_reached": len(results),
        "results": results,
    }


@router.get("/channels")
async def get_channels():
    """Get available emergency communication channels."""
    return get_channel_summary()


@router.post("/incidents")
async def create_incident(report: IncidentReport):
    """Create a new incident report."""
    incident_id = await db_insert("incidents", {
        "incident_type": report.incident_type,
        "severity": report.severity,
        "title": report.title,
        "description": report.description,
        "station_id": report.station_id,
        "latitude": report.latitude,
        "longitude": report.longitude,
    })
    return {"id": incident_id, "status": "created"}


@router.get("/incidents")
async def get_incidents(status: str = "active", limit: int = 50):
    """Get incident reports."""
    where = {"status": status} if status != "all" else None
    incidents = await db_select("incidents", where=where, order_by="created_at DESC", limit=limit)
    return {"incidents": incidents, "count": len(incidents)}


@router.get("/dispatch-log")
async def get_dispatch_log(limit: int = 100):
    """Get recent dispatch log entries."""
    messages = await db_select("channel_messages", order_by="sent_at DESC", limit=limit)
    return {"messages": messages, "count": len(messages)}
