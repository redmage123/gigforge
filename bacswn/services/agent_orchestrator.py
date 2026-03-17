"""BACSWN — 7-agent orchestration system."""

import asyncio
import logging
import time
from datetime import datetime, timezone
from services.database import db_insert
from services.websocket_manager import ws_manager

logger = logging.getLogger("bacswn.agents")


class Agent:
    """Base class for BACSWN AI agents."""

    def __init__(self, name: str, role: str, poll_interval: int = 0):
        self.name = name
        self.role = role
        self.poll_interval = poll_interval
        self.status = "idle"
        self.last_run = None
        self.run_count = 0
        self.events: list[dict] = []

    async def execute(self, context: dict | None = None) -> dict:
        """Execute agent task and log activity."""
        start = time.time()
        self.status = "running"
        self.run_count += 1

        try:
            result = await self._run(context or {})
            elapsed = int((time.time() - start) * 1000)
            self.status = "idle"
            self.last_run = datetime.now(timezone.utc).isoformat()

            event = {
                "agent_name": self.name,
                "action": result.get("action", "check"),
                "details": result.get("details", ""),
                "status": "completed",
                "duration_ms": elapsed,
            }
            self.events.append(event)
            if len(self.events) > 50:
                self.events = self.events[-50:]

            await db_insert("agent_activity", event)
            await ws_manager.broadcast("agents", {
                "type": "agent_activity",
                "agent": self.name,
                **event,
                "timestamp": self.last_run,
            })

            return result
        except Exception as e:
            self.status = "error"
            logger.error(f"Agent {self.name} failed: {e}")
            return {"action": "error", "details": str(e)}

    async def _run(self, context: dict) -> dict:
        """Override in subclasses."""
        return {"action": "noop", "details": "Base agent"}

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "role": self.role,
            "status": self.status,
            "last_run": self.last_run,
            "run_count": self.run_count,
            "poll_interval": self.poll_interval,
            "recent_events": self.events[-5:],
        }


class WxMonitorAgent(Agent):
    def __init__(self):
        super().__init__("bacswn-wx-monitor", "Weather change detection", 60)

    async def _run(self, context: dict) -> dict:
        from services.awc_client import fetch_metars
        metars = await fetch_metars()
        significant = [m for m in metars if m.get("fltcat") in ("IFR", "LIFR")]
        if significant:
            return {
                "action": "wx_change_detected",
                "details": f"{len(significant)} stations reporting IFR/LIFR conditions",
                "trigger_sigmet": len(significant) >= 2,
            }
        return {
            "action": "wx_scan",
            "details": f"Scanned {len(metars)} stations — all VFR/MVFR",
        }


class FlightTrackerAgent(Agent):
    def __init__(self):
        super().__init__("bacswn-flight-tracker", "Airspace picture maintenance", 30)

    async def _run(self, context: dict) -> dict:
        from services.opensky_client import fetch_flights
        flights = await fetch_flights()
        return {
            "action": "airspace_update",
            "details": f"Tracking {len(flights)} aircraft in Bahamas FIR",
            "flight_count": len(flights),
        }


class SigmetDrafterAgent(Agent):
    def __init__(self):
        super().__init__("bacswn-sigmet-drafter", "ICAO advisory generation", 0)

    async def _run(self, context: dict) -> dict:
        hazard = context.get("hazard_type", "TS")
        description = context.get("description", "Embedded thunderstorms observed")
        from services.sigmet_generator import generate_sigmet
        sigmet = generate_sigmet(hazard, description)
        return {
            "action": "sigmet_drafted",
            "details": f"Generated {sigmet['advisory_type']} for {sigmet['hazard_name']}",
            "sigmet": sigmet,
        }


class EmissionsAnalystAgent(Agent):
    def __init__(self):
        super().__init__("bacswn-emissions-analyst", "CORSIA carbon calculation", 3600)

    async def _run(self, context: dict) -> dict:
        from services.opensky_client import fetch_flights
        from services.emissions_calculator import estimate_airspace_emissions
        flights = await fetch_flights()
        emissions = estimate_airspace_emissions(flights)
        return {
            "action": "emissions_calculated",
            "details": f"{emissions['total_co2_tonnes']} tonnes CO2 from {emissions['total_flights']} flights",
            "emissions": emissions,
        }


class DispatchAgent(Agent):
    def __init__(self):
        super().__init__("bacswn-dispatch", "Multi-channel alert sender", 0)

    async def _run(self, context: dict) -> dict:
        subject = context.get("subject", "BACSWN Alert")
        body = context.get("body", "Alert details")
        severity = context.get("severity", "warning")
        from services.channel_dispatcher import dispatch_alert
        results = await dispatch_alert(subject, body, severity)
        return {
            "action": "alert_dispatched",
            "details": f"Sent to {len(results)} channels",
            "channels_reached": len(results),
        }


class QCAgent(Agent):
    def __init__(self):
        super().__init__("bacswn-qc", "Data quality validation", 30)

    async def _run(self, context: dict) -> dict:
        from services.awc_client import fetch_metars
        metars = await fetch_metars()
        issues = []
        for m in metars:
            if m.get("temp") is not None and (m["temp"] < -10 or m["temp"] > 50):
                issues.append(f"{m.get('icaoId', '?')}: temp {m['temp']}°C out of range")
        return {
            "action": "qc_check",
            "details": f"Validated {len(metars)} observations, {len(issues)} issues",
            "issues": issues,
        }


class ChiefAgent(Agent):
    def __init__(self):
        super().__init__("bacswn-chief", "Operations orchestrator", 0)

    async def _run(self, context: dict) -> dict:
        event_type = context.get("event_type", "status_check")
        return {
            "action": "chief_decision",
            "details": f"Evaluated {event_type} — operations normal",
            "decision": "continue_monitoring",
        }


class AgentOrchestrator:
    """Manages the 7-agent pipeline."""

    def __init__(self):
        self.agents: dict[str, Agent] = {
            "bacswn-chief": ChiefAgent(),
            "bacswn-wx-monitor": WxMonitorAgent(),
            "bacswn-flight-tracker": FlightTrackerAgent(),
            "bacswn-sigmet-drafter": SigmetDrafterAgent(),
            "bacswn-emissions-analyst": EmissionsAnalystAgent(),
            "bacswn-dispatch": DispatchAgent(),
            "bacswn-qc": QCAgent(),
        }

    def get_all_status(self) -> list[dict]:
        return [a.to_dict() for a in self.agents.values()]

    async def trigger_agent(self, name: str, context: dict | None = None) -> dict:
        agent = self.agents.get(name)
        if not agent:
            return {"error": f"Agent {name} not found"}
        return await agent.execute(context)

    async def run_periodic_agents(self):
        """Start all periodic agents as background tasks."""
        for name, agent in self.agents.items():
            if agent.poll_interval > 0:
                asyncio.create_task(self._periodic_loop(agent))
                logger.info(f"Started periodic agent: {name} (every {agent.poll_interval}s)")

    async def _periodic_loop(self, agent: Agent):
        while True:
            try:
                await agent.execute()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Agent {agent.name} loop error: {e}")
            await asyncio.sleep(agent.poll_interval)


# Global orchestrator instance
orchestrator = AgentOrchestrator()
