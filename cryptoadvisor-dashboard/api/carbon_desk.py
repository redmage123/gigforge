"""Carbon Desk API: simulated carbon-offset futures trading (moved here from the BACSWN demo).

REST under /api/carbon-desk/ (cookie auth via AuthMiddleware, CSRF on writes) and a
per-user live feed on the WebSocket /ws/carbon-desk (auth from the same login cookie).
"""

import asyncio
import json
import math
from urllib.parse import urlparse

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from services.auth import verify_session_token
from services.carbon_desk import store
from services.carbon_desk.exchange import CONTRACT_SIZE, venue

router = APIRouter()
ws_router = APIRouter()

# Illustrative CORSIA offsetting requirement: share of an operator's emissions above
# the sector baseline that must be offset (sector growth factor). Real values are
# published annually by ICAO per operator/state pair.
CORSIA_OFFSET_RATIO = 0.10
# Starting hedge target until the user enters their own: roughly a year of the
# international traffic through the Bahamas FIR, as estimated by the BACSWN demo.
DEFAULT_ANNUAL_CO2_T = 880_000
MAX_ANNUAL_CO2_T = 100_000_000
PUSH_SECONDS = 0.5


class OrderRequest(BaseModel):
    symbol: str
    side: str
    qty: int
    type: str = "LMT"
    tif: str = "DAY"
    price: float | None = None
    stop: float | None = None


class ObligationRequest(BaseModel):
    annual_co2_tonnes: float = Field(ge=0, le=MAX_ANNUAL_CO2_T)


class AdvisorQuestion(BaseModel):
    message: str


def _owner(request: Request) -> str:
    return request.state.user["sub"]


@router.get("/specs")
async def contract_specs():
    """Contract specifications for the listed offset futures."""
    return {"venue": venue.venue_name, "simulated": True, "products": venue.contract_specs()}


@router.get("/market")
async def market(depth: int = 10):
    """Quotes, depth, time & sales, and news for every listed contract."""
    return venue.market_snapshot(depth_levels=max(1, min(depth, 20)))


@router.get("/candles/{symbol}")
async def candles(symbol: str, minutes: int = 1, limit: int = 240):
    if symbol.upper() not in venue.instruments:
        return JSONResponse(status_code=404, content={"error": "Unknown instrument"})
    return {"symbol": symbol.upper(), "minutes": minutes,
            "candles": venue.candles(symbol.upper(), minutes=minutes, limit=max(1, min(limit, 1000)))}


@router.get("/account")
async def account(request: Request):
    return venue.account(_owner(request))


@router.post("/orders")
async def submit_order(req: OrderRequest, request: Request):
    result = venue.submit(_owner(request), req.symbol.upper(), req.side, req.qty,
                          req.type, req.tif, req.price, req.stop)
    status = 400 if result["status"] == "REJECTED" else 200
    return JSONResponse(status_code=status, content=result)


@router.delete("/orders/{order_id}")
async def cancel_order(order_id: int, request: Request):
    result = venue.cancel(_owner(request), order_id)
    return JSONResponse(status_code=400 if "error" in result else 200, content=result)


@router.post("/orders/cancel-all")
async def cancel_all(request: Request, symbol: str | None = None):
    return {"cancelled": venue.cancel_all(_owner(request), symbol.upper() if symbol else None)}


@router.post("/positions/{symbol}/flatten")
async def flatten(symbol: str, request: Request):
    result = venue.flatten(_owner(request), symbol.upper())
    return JSONResponse(status_code=400 if "error" in result else 200, content=result)


# ── CORSIA hedge ────────────────────────────────────────────────────────────

@router.get("/corsia-obligation")
async def corsia_obligation(request: Request):
    """The user's CORSIA offset requirement (from their annual emissions) vs. their GEO hedge."""
    return await _obligation(_owner(request))


@router.put("/corsia-obligation")
async def set_corsia_obligation(req: ObligationRequest, request: Request):
    owner = _owner(request)
    await store.set_obligation(owner, round(req.annual_co2_tonnes))
    return await _obligation(owner)


async def _obligation(owner: str) -> dict:
    saved = await store.get_obligation(owner)
    annual_t = DEFAULT_ANNUAL_CO2_T if saved is None else saved
    required = annual_t * CORSIA_OFFSET_RATIO
    acct = venue.account(owner)
    hedged = sum(p["offsets"] for p in acct["positions"] if p["product"] == "GEO" and p["qty"] > 0)
    front = next((q for q in venue.market_snapshot(1)["quotes"] if q["product"] == "GEO"), None)
    remaining = max(0.0, required - hedged)
    contracts = math.ceil(remaining / CONTRACT_SIZE)
    return {
        "annual_co2_tonnes": round(annual_t),
        "is_default": saved is None,
        "offset_ratio": CORSIA_OFFSET_RATIO,
        "required_offsets": round(required),
        "hedged_offsets": hedged,
        "coverage_pct": round(min(100.0, hedged / required * 100), 1) if required else 100.0,
        "contracts_to_hedge": contracts,
        "hedge_symbol": front["symbol"] if front else None,
        "hedge_cost_estimate": round(contracts * CONTRACT_SIZE * front["ask"], 2) if front and front["ask"] else None,
        "methodology": "Annual CO2 you entered × illustrative CORSIA sector growth factor",
    }


# ── AI trading advisor ──────────────────────────────────────────────────────

@router.get("/advisor/ideas")
async def advisor_ideas(request: Request):
    """Rule-based trade ideas and position review for the caller, plus AI availability."""
    from services.carbon_desk import advisor_llm
    from services.carbon_desk.signals import ideas
    owner = _owner(request)
    return {**ideas(venue, venue.account(owner), await _obligation(owner)), "ai": advisor_llm.status()}


@router.post("/advisor/chat")
async def advisor_chat(req: AdvisorQuestion, request: Request):
    """Ask the AI advisor (Claude via `claude -p`). Proposals come back as tickets; nothing is traded."""
    from services.carbon_desk import advisor_llm
    from services.carbon_desk.signals import ideas
    owner = _owner(request)
    acct = venue.account(owner)
    engine = ideas(venue, acct, await _obligation(owner))
    snap = venue.market_snapshot(depth_levels=1)
    snapshot = {
        "quotes": [{k: q[k] for k in ("symbol", "product", "month", "bid", "ask", "last", "change", "settle",
                                      "volume", "corsia_eligible", "initial_margin")} for q in snap["quotes"]],
        "news": snap["news"][:8],
        "account": {k: acct[k] for k in ("cash", "equity", "unrealized_pnl", "realized_pnl", "margin_used",
                                         "buying_power", "day_pnl")},
        "positions": acct["positions"], "working_orders": acct["working_orders"][:10], "recent_fills": acct["fills"][:8],
        "engine_ideas": engine["ideas"], "position_review": engine["review"], "signals": engine["signals"],
        "curve_anomalies": engine["curve_anomalies"], "corsia_hedge": engine["obligation"],
        "contract": {"size_offsets": CONTRACT_SIZE, "tick": 0.01, "tick_value_usd": 10},
    }
    try:
        return await advisor_llm.ask(owner, req.message, snapshot, venue)
    except advisor_llm.AdvisorUnavailable as e:
        return JSONResponse(status_code=503, content={"error": str(e), "ai": advisor_llm.status()})


@router.post("/advisor/reset")
async def advisor_reset(request: Request):
    from services.carbon_desk import advisor_llm
    advisor_llm.reset(_owner(request))
    return {"ok": True}


# ── Live feed ───────────────────────────────────────────────────────────────

def _same_origin(websocket: WebSocket) -> bool:
    """Browsers send cookies on cross-site WebSocket handshakes, so require our own Origin."""
    origin = websocket.headers.get("origin")
    if not origin:
        return True  # not a browser
    host = websocket.headers.get("x-forwarded-host") or websocket.headers.get("host", "")
    return urlparse(origin).netloc == host


@ws_router.websocket("/ws/carbon-desk")
async def ws_carbon_desk(websocket: WebSocket):
    """Per-user trading feed: market data plus that user's account, every 500 ms.

    The client may send {"focus": "<symbol>"} to choose which contract's full
    depth and time & sales are included (quotes always cover every contract).
    """
    payload = verify_session_token(websocket.cookies.get("access_token") or "")
    if not payload or not payload.get("sub") or not _same_origin(websocket):
        await websocket.close(code=4401)
        return
    await websocket.accept()
    owner = payload["sub"]
    state = {"focus": None}

    async def _reader():
        while True:
            try:
                msg = json.loads(await websocket.receive_text())
            except (ValueError, TypeError):
                continue
            if isinstance(msg, dict) and msg.get("focus") in venue.instruments:
                state["focus"] = msg["focus"]

    reader = asyncio.create_task(_reader())
    try:
        while not reader.done():
            await websocket.send_json({
                "type": "trading_update",
                "market": venue.market_snapshot(focus=state["focus"] or next(iter(venue.instruments))),
                "account": venue.account(owner),
            })
            await asyncio.sleep(PUSH_SECONDS)
    except (WebSocketDisconnect, RuntimeError):
        pass  # client went away mid-send
    except Exception as e:  # e.g. websockets ConnectionClosed
        if "ConnectionClosed" not in type(e).__name__:
            raise
    finally:
        reader.cancel()
