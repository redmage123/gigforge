"""Price alerts and watchlist API."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from services.alerts import get_alerts, add_alert, remove_alert, update_alert, get_alert_history
from services.user_data import get_username

router = APIRouter()


class AlertCreate(BaseModel):
    coin_id: str
    direction: str  # "above" or "below"
    target_price: float
    notes: str = ""
    support: float = 0
    resistance: float = 0


class AlertUpdate(BaseModel):
    target_price: float = None
    notes: str = None
    support: float = None
    resistance: float = None
    active: bool = None


@router.get("/")
async def list_alerts(request: Request):
    return get_alerts(get_username(request))


@router.post("/")
async def create_alert(request: Request, alert: AlertCreate):
    username = get_username(request)
    return add_alert(username, alert.coin_id, alert.direction, alert.target_price,
                     alert.notes, alert.support, alert.resistance)


@router.delete("/{alert_id}")
async def delete_alert(request: Request, alert_id: str):
    remove_alert(get_username(request), alert_id)
    return {"status": "removed"}


@router.put("/{alert_id}")
async def modify_alert(request: Request, alert_id: str, updates: AlertUpdate):
    result = update_alert(get_username(request), alert_id,
                         {k: v for k, v in updates.model_dump().items() if v is not None})
    if not result:
        return JSONResponse({"error": "Alert not found"}, status_code=404)
    return result


@router.get("/history")
async def alert_history(request: Request):
    return get_alert_history(get_username(request))
