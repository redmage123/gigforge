"""DCA (Dollar Cost Averaging) plans API. Plans are tracked and their buys simulated; no orders are placed."""

from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from services.dca_automation import (
    get_dca_plans,
    create_dca_plan as svc_create_dca_plan,
    delete_dca_plan as svc_delete_dca_plan,
    next_execution,
    set_plan_status,
)

router = APIRouter()


class DcaPlanCreate(BaseModel):
    coin: str = Field(min_length=1, max_length=20)  # symbol, e.g. "BTC"
    exchange: str = Field(default="", max_length=40)
    amount_usd: float = Field(gt=0, le=1_000_000)
    frequency: Literal["daily", "weekly", "monthly"]


@router.get("/")
async def list_dca_plans(request: Request):
    username = request.state.user.get("sub", "")
    return get_dca_plans(username)


@router.post("/")
async def create_dca_plan(request: Request, body: DcaPlanCreate):
    username = request.state.user.get("sub", "")
    plan = await svc_create_dca_plan(username, body.model_dump())
    return {**plan, "next_execution": next_execution(plan)}


@router.delete("/{plan_id}")
async def delete_dca_plan(request: Request, plan_id: str):
    username = request.state.user.get("sub", "")
    if svc_delete_dca_plan(username, plan_id):
        return {"status": "deleted"}
    return JSONResponse({"error": "Plan not found"}, status_code=404)


def _set_status(request: Request, plan_id: str, status: str):
    username = request.state.user.get("sub", "")
    try:
        return set_plan_status(username, plan_id, status)
    except KeyError:
        return JSONResponse({"error": "Plan not found"}, status_code=404)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=409)


@router.post("/{plan_id}/pause")
async def pause_dca_plan(request: Request, plan_id: str):
    return _set_status(request, plan_id, "paused")


@router.post("/{plan_id}/resume")
async def resume_dca_plan(request: Request, plan_id: str):
    """Resume a paused plan. Buys missed while paused are skipped; the next one is scheduled from now."""
    return _set_status(request, plan_id, "active")
