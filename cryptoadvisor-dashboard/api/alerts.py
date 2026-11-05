"""Price alerts and watchlist API."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from services import market
from services.alerts import get_alerts, add_alert, remove_alert, update_alert, get_alert_history
from services.market import registry
from services.user_data import get_username

router = APIRouter()


class AlertCreate(BaseModel):
    instrument_id: str = ""
    coin_id: str = ""  # legacy clients (CoinGecko id)
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


def _describe(alerts: list[dict]) -> list[dict]:
    for a in alerts:
        inst = registry.get(a["instrument_id"])
        a["name"] = inst.name if inst else a["instrument_id"]
        a["symbol"] = inst.symbol if inst else a["instrument_id"].split(":", 1)[-1]
        a["asset_class"] = inst.asset_class if inst else a["instrument_id"].split(":", 1)[0]
    return alerts


@router.get("/")
async def list_alerts(request: Request):
    await registry.ensure_loaded()
    return _describe(get_alerts(get_username(request)))


@router.post("/")
async def create_alert(request: Request, alert: AlertCreate):
    await registry.ensure_loaded()
    iid = alert.instrument_id or registry.from_coingecko_id(alert.coin_id) or ""
    inst = await market.get_instrument(iid) if iid else None
    if not inst:
        return JSONResponse({"error": f"Unknown instrument '{alert.instrument_id or alert.coin_id}'"}, status_code=400)
    try:
        created = add_alert(get_username(request), inst.id, alert.direction, alert.target_price,
                            alert.notes, alert.support, alert.resistance)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    return _describe([created])[0]


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
    await registry.ensure_loaded()
    return _describe(get_alert_history(get_username(request)))
