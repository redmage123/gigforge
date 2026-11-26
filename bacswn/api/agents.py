"""BACSWN — AI agent console API router.

What: agent status, manual triggers, the activity log and the scripted weather-event
pipeline (monitor → chief → QC → SIGMET drafter → emissions → dispatch).

Why: the agent console lets operators see and drive the seven agents, and the pipeline
endpoint demonstrates them working together end to end.

How: delegates to the shared ``orchestrator``; the activity log is read from the
``agent_activity`` table.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from services.agent_orchestrator import orchestrator

router = APIRouter()


class AgentTrigger(BaseModel):
    """Agent to run and the optional context passed to it."""

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
    """Trigger the full weather event pipeline: detect → evaluate → draft → dispatch.

    ``context`` (optional) overrides the SIGMET drafter's hazard; each step's result is
    returned in order with its step number and agent name.
    """
    results = []

    async def step(agent: str, ctx: dict | None = None) -> dict:
        """Run one pipeline agent, append its numbered result and return the raw result."""
        result = await orchestrator.trigger_agent(agent, ctx)
        results.append({"step": len(results) + 1, "agent": agent, **result})
        return result

    await step("bacswn-wx-monitor")                                  # 1. detect
    await step("bacswn-chief", {"event_type": "wx_change"})          # 2. evaluate
    await step("bacswn-qc")                                          # 3. validate data
    sigmet_result = await step("bacswn-sigmet-drafter", context or {  # 4. draft advisory
        "hazard_type": "TS",
        "description": "Embedded thunderstorms developing over northern Bahamas",
    })
    await step("bacswn-emissions-analyst")                           # 5. emissions impact
    await step("bacswn-dispatch", {                                  # 6. send alerts
        "subject": "SIGMET — Thunderstorm Activity",
        "body": sigmet_result.get("sigmet", {}).get("raw_text", "Advisory generated"),
        "severity": "warning",
    })

    return {"pipeline": "weather_event", "steps": len(results), "results": results}
