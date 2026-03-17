"""BACSWN — AI Agent console API router."""

from fastapi import APIRouter
from pydantic import BaseModel
from services.agent_orchestrator import orchestrator

router = APIRouter()


class AgentTrigger(BaseModel):
    agent_name: str
    context: dict | None = None


@router.get("/status")
async def get_agent_status():
    """Get status of all 7 agents."""
    return {"agents": orchestrator.get_all_status()}


@router.post("/trigger")
async def trigger_agent(req: AgentTrigger):
    """Manually trigger an agent execution."""
    result = await orchestrator.trigger_agent(req.agent_name, req.context)
    return result


@router.get("/activity")
async def get_agent_activity(agent_name: str = "", limit: int = 50):
    """Get recent agent activity log."""
    from services.database import db_select
    where = {"agent_name": agent_name} if agent_name else None
    activities = await db_select("agent_activity", where=where, order_by="created_at DESC", limit=limit)
    return {"activities": activities, "count": len(activities)}


@router.post("/pipeline/weather-event")
async def trigger_weather_pipeline(context: dict = None):
    """Trigger the full weather event pipeline: detect → evaluate → draft → dispatch."""
    results = []

    # Step 1: Weather monitor detects
    wx_result = await orchestrator.trigger_agent("bacswn-wx-monitor")
    results.append({"step": 1, "agent": "bacswn-wx-monitor", **wx_result})

    # Step 2: Chief evaluates
    chief_result = await orchestrator.trigger_agent("bacswn-chief", {"event_type": "wx_change"})
    results.append({"step": 2, "agent": "bacswn-chief", **chief_result})

    # Step 3: QC validates data
    qc_result = await orchestrator.trigger_agent("bacswn-qc")
    results.append({"step": 3, "agent": "bacswn-qc", **qc_result})

    # Step 4: SIGMET drafter creates advisory
    sigmet_result = await orchestrator.trigger_agent("bacswn-sigmet-drafter", context or {
        "hazard_type": "TS",
        "description": "Embedded thunderstorms developing over northern Bahamas",
    })
    results.append({"step": 4, "agent": "bacswn-sigmet-drafter", **sigmet_result})

    # Step 5: Emissions analyst calculates impact
    em_result = await orchestrator.trigger_agent("bacswn-emissions-analyst")
    results.append({"step": 5, "agent": "bacswn-emissions-analyst", **em_result})

    # Step 6: Dispatch sends alerts
    dispatch_result = await orchestrator.trigger_agent("bacswn-dispatch", {
        "subject": "SIGMET — Thunderstorm Activity",
        "body": sigmet_result.get("sigmet", {}).get("raw_text", "Advisory generated"),
        "severity": "warning",
    })
    results.append({"step": 6, "agent": "bacswn-dispatch", **dispatch_result})

    return {"pipeline": "weather_event", "steps": len(results), "results": results}
