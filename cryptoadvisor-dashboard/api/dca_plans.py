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
