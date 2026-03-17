"""Trade tracking and P&L API."""

from fastapi import APIRouter, Request
from pydantic import BaseModel
from services.trades import get_trades, add_trade, remove_trade, calculate_pnl
from services.user_data import get_username

router = APIRouter()


class TradeCreate(BaseModel):
    coin_id: str
    side: str  # "buy" or "sell"
    price: float
    quantity: float
    date: str = ""
    fee: float = 0


@router.get("/")
async def list_trades(request: Request):
    return get_trades(get_username(request))


@router.post("/")
async def create_trade(request: Request, trade: TradeCreate):
    username = get_username(request)
    return add_trade(username, trade.coin_id, trade.side, trade.price,
                     trade.quantity, trade.date, trade.fee)


@router.delete("/{trade_id}")
async def delete_trade(request: Request, trade_id: str):
    remove_trade(get_username(request), trade_id)
    return {"status": "removed"}


@router.get("/pnl")
async def pnl(request: Request):
    return await calculate_pnl(get_username(request))
