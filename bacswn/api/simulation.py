"""BACSWN — Simulation API router."""

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
