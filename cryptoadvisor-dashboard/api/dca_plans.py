"""DCA (Dollar Cost Averaging) plans API."""

from fastapi import APIRouter, Request, Query
from pydantic import BaseModel
from services.dca_automation import (
    get_dca_plans,
    create_dca_plan as svc_create_dca_plan,
    delete_dca_plan as svc_delete_dca_plan,
)

router = APIRouter()


class DcaPlanCreate(BaseModel):
    coin: str
    exchange: str
    amount_usd: float
    frequency: str  # "daily", "weekly", "biweekly", "monthly"


@router.get("/")
async def list_dca_plans(request: Request):
    username = request.state.user.get("sub", "")
    return get_dca_plans(username)


@router.post("/")
async def create_dca_plan(request: Request, body: DcaPlanCreate):
    username = request.state.user.get("sub", "")
    return await svc_create_dca_plan(username, body.dict())


@router.delete("/{plan_id}")
async def delete_dca_plan(request: Request, plan_id: str):
    username = request.state.user.get("sub", "")
    return svc_delete_dca_plan(username, plan_id)
