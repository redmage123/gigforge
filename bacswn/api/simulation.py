"""BACSWN — Simulation API router.

What: lists the scripted mesh-network scenarios and returns a scenario's state
at a given step.

Why: the Simulation page steps through storms and faults to demonstrate how the
station mesh responds.

How: thin handlers over ``services.simulation_engine``, which is deterministic
and needs no I/O.
"""

from fastapi import APIRouter
from services.simulation_engine import get_scenarios, run_scenario

router = APIRouter()


@router.get("/scenarios")
async def list_scenarios():
    """List all available simulation scenarios."""
    return get_scenarios()


@router.get("/run/{scenario_id}")
async def run(scenario_id: str, step: int = 0):
    """Get simulation state at a specific step."""
    return run_scenario(scenario_id, step)
