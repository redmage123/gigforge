"""Exchange API integration endpoints."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from services.exchanges import get_exchanges, add_exchange, remove_exchange, get_exchange_balances
from services.user_data import get_username

router = APIRouter()


class ExchangeCreate(BaseModel):
    name: str  # "binance" or "coinbase"
    api_key: str
    api_secret: str
    label: str = ""


@router.get("/")
async def list_exchanges(request: Request):
    return get_exchanges(get_username(request))


@router.post("/")
async def create_exchange(request: Request, exchange: ExchangeCreate):
    username = get_username(request)
    return add_exchange(username, exchange.name, exchange.api_key, exchange.api_secret, exchange.label)


@router.delete("/{index}")
async def delete_exchange(request: Request, index: int):
    if remove_exchange(get_username(request), index):
        return {"status": "removed"}
    return JSONResponse({"error": "Invalid index"}, status_code=404)


@router.get("/balances")
async def exchange_balances(request: Request):
    try:
        return await get_exchange_balances(get_username(request))
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)
