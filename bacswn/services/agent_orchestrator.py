"""BACSWN — 7-agent orchestration system.

What: the seven operational agents (chief, weather monitor, flight tracker, SIGMET
drafter, emissions analyst, dispatch, QC) and the ``AgentOrchestrator`` that owns them,
runs the periodic ones and triggers any of them on demand.

Why: the agent console, the weather-event pipeline and the health check all need one
shared set of agents with their run counts, last-run time and recent events.

How: each agent subclasses ``Agent`` and implements ``_run``. ``Agent.execute`` wraps
``_run`` with timing, status tracking, a bounded in-memory event log, a row in
``agent_activity`` and a broadcast on the ``agents`` WebSocket channel. Agents with a
poll interval are run forever by ``services.scheduler.run_forever`` (skipped while the
demo is paused); the others run only when triggered. Heavy imports are done lazily
inside ``_run`` so importing this module stays cheap.
"""

import asyncio
import logging
import time
from datetime import datetime, timezone
from services.database import db_insert
from services.websocket_manager import ws_manager
from services.scheduler import run_forever

logger = logging.getLogger("bacswn.agents")


class Agent:
    """Base class for BACSWN AI agents: bookkeeping around a subclass's ``_run``."""

    MAX_EVENTS = 50  # recent events kept in memory per agent

    def __init__(self, name: str, role: str, poll_interval: int = 0):
        """Create an idle agent.

        Args:
            name: unique agent id, e.g. ``"bacswn-qc"``.
            role: one-line description shown in the console.
            poll_interval: seconds between periodic runs; 0 means event-driven only.
        """
        self.name = name
        self.role = role
        self.poll_interval = poll_interval
        self.status = "idle"
        self.last_run = None
        self.run_count = 0
        self.events: list[dict] = []

    async def execute(self, context: dict | None = None) -> dict:
        """Run the agent once, record the outcome and return ``_run``'s result.

        On success the event is appended to the in-memory log, inserted into
        ``agent_activity`` and broadcast on the ``agents`` channel. Any exception is
        caught deliberately (an agent failure must never break the pipeline or the
        periodic loop): the agent's status becomes ``"error"`` and
        ``{"action": "error", "details": <message>}`` is returned instead.
        """
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
            if len(self.events) > self.MAX_EVENTS:
                self.events = self.events[-self.MAX_EVENTS:]

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
        """Do the agent's work; subclasses override this.

        Returns a dict with at least ``action`` and ``details``; extra keys are
        passed back to the caller of ``execute``.
        """
        return {"action": "noop", "details": "Base agent"}

    def to_dict(self) -> dict:
        """Status snapshot for the API: identity, counters and the last five events."""
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
    """Polls AWC METARs and flags IFR/LIFR stations (two or more suggest a SIGMET)."""

    def __init__(self):
        """Register the agent's name, role and poll interval."""
        super().__init__("bacswn-wx-monitor", "Weather change detection", 60)

    async def _run(self, context: dict) -> dict:
        """Count IFR/LIFR METARs; ``trigger_sigmet`` is True when two or more stations are affected."""
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
    """Refreshes the airspace picture from OpenSky for the Bahamas FIR."""

    def __init__(self):
        """Register the agent's name, role and poll interval."""
        super().__init__("bacswn-flight-tracker", "Airspace picture maintenance", 30)

    async def _run(self, context: dict) -> dict:
        """Fetch current flights and report how many aircraft are in the FIR."""
        from services.opensky_client import fetch_flights
        flights = await fetch_flights()
        return {
            "action": "airspace_update",
            "details": f"Tracking {len(flights)} aircraft in Bahamas FIR",
            "flight_count": len(flights),
        }


class SigmetDrafterAgent(Agent):
    """Drafts an ICAO-format SIGMET when a hazard is detected (event-driven)."""

    def __init__(self):
        """Register the agent's name, role and poll interval."""
        super().__init__("bacswn-sigmet-drafter", "ICAO advisory generation", 0)

    async def _run(self, context: dict) -> dict:
        """Draft a SIGMET from ``context["hazard_type"]`` and ``context["description"]`` (with defaults)."""
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
    """Estimates CORSIA CO2 for the aircraft currently in the FIR (hourly)."""

    def __init__(self):
        """Register the agent's name, role and poll interval."""
        super().__init__("bacswn-emissions-analyst", "CORSIA carbon calculation", 3600)

    async def _run(self, context: dict) -> dict:
        """Estimate CO2 for the live flights and return the totals under ``emissions``."""
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
    """Sends an alert to every configured communication channel (event-driven)."""

    def __init__(self):
        """Register the agent's name, role and poll interval."""
        super().__init__("bacswn-dispatch", "Multi-channel alert sender", 0)

    async def _run(self, context: dict) -> dict:
        """Dispatch ``context`` subject/body/severity (with defaults) to all channels."""
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
    """Validates incoming METARs and flags out-of-range temperatures."""

    def __init__(self):
        """Register the agent's name, role and poll interval."""
        super().__init__("bacswn-qc", "Data quality validation", 30)

    async def _run(self, context: dict) -> dict:
        """Flag METARs whose temperature is outside -10..50 °C."""
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
    """Operations orchestrator: evaluates escalated events (currently always "continue monitoring")."""

    def __init__(self):
        """Register the agent's name, role and poll interval."""
        super().__init__("bacswn-chief", "Operations orchestrator", 0)

    async def _run(self, context: dict) -> dict:
        """Acknowledge ``context["event_type"]`` and return the standing decision."""
        event_type = context.get("event_type", "status_check")
        return {
            "action": "chief_decision",
            "details": f"Evaluated {event_type} — operations normal",
            "decision": "continue_monitoring",
        }


class AgentOrchestrator:
    """Owns the seven agents: status listing, on-demand triggers and periodic runs."""

    def __init__(self):
        """Instantiate one of each agent, keyed by agent name."""
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
        """Status snapshot of every agent (see ``Agent.to_dict``)."""
        return [a.to_dict() for a in self.agents.values()]

    async def trigger_agent(self, name: str, context: dict | None = None) -> dict:
        """Run the named agent once with ``context``.

        An unknown name returns ``{"error": "Agent <name> not found"}`` (HTTP 200) rather
        than raising, because the console and pipeline render that dict as-is.
        """
        agent = self.agents.get(name)
        if not agent:
            return {"error": f"Agent {name} not found"}
        return await agent.execute(context)

    async def run_periodic_agents(self):
        """Start a background task for every agent with a poll interval (needs a running loop)."""
        for name, agent in self.agents.items():
            if agent.poll_interval > 0:
                asyncio.create_task(self._periodic_loop(agent))
                logger.info(f"Started periodic agent: {name} (every {agent.poll_interval}s)")

    async def _periodic_loop(self, agent: Agent):
        """Run ``agent`` every ``poll_interval`` seconds, skipping cycles while the demo is paused."""
        await run_forever(agent.execute, agent.poll_interval, f"Agent {agent.name} loop error", log=logger)


# Global orchestrator instance
orchestrator = AgentOrchestrator()
