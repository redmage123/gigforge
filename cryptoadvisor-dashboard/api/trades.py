"""Trade journal and P&L API (any asset class)."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services import market
from services.market import registry
from services.trades import add_trade, calculate_pnl, get_trades, portfolio, remove_trade
from services.user_data import get_username

router = APIRouter()


class TradeCreate(BaseModel):
    instrument_id: str = ""
    coin_id: str = ""  # legacy clients (CoinGecko id); mapped to an instrument id
    side: str  # "buy" or "sell"
    price: float
    quantity: float
    date: str = ""
    fee: float = 0
    notes: str = ""


@router.get("/")
async def list_trades(request: Request):
    await registry.ensure_loaded()
    rows = get_trades(get_username(request))
    for t in rows:
        inst = registry.get(t["instrument_id"])
        t["name"] = inst.name if inst else t["instrument_id"]
        t["symbol"] = inst.symbol if inst else t["instrument_id"].split(":", 1)[-1]
        t["asset_class"] = inst.asset_class if inst else t["instrument_id"].split(":", 1)[0]
        t["multiplier"] = inst.multiplier if inst else 1.0
    return sorted(rows, key=lambda t: (t.get("date", ""), t.get("created_at", 0)), reverse=True)


@router.post("/")
async def create_trade(request: Request, trade: TradeCreate):
    iid = trade.instrument_id
    if not iid and trade.coin_id:
        await registry.ensure_loaded()
        iid = registry.from_coingecko_id(trade.coin_id) or ""
    inst = await market.get_instrument(iid) if iid else None
    if not inst:
        return JSONResponse({"error": f"Unknown instrument '{iid or trade.coin_id}'. Pick one from the search list."}, status_code=400)
    if not inst.tradable:
        return JSONResponse({"error": f"{inst.name} is a reference series and can't be traded."}, status_code=400)
    try:
        return add_trade(get_username(request), inst.id, trade.side.lower(), trade.price, trade.quantity,
                         trade.date, trade.fee, trade.notes)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)


@router.delete("/{trade_id}")
async def delete_trade(request: Request, trade_id: str):
    if not remove_trade(get_username(request), trade_id):
        return JSONResponse({"error": "Trade not found"}, status_code=404)
    return {"status": "removed"}


@router.get("/pnl")
async def pnl(request: Request):
    return await calculate_pnl(get_username(request))


@router.get("/portfolio")
async def full_portfolio(request: Request):
    """Open and closed positions, realized/unrealized/day P&L, totals per asset class."""
    return await portfolio(get_username(request))
