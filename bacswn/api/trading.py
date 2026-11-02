"""BACSWN — Carbon-offset futures trading API (simulated CME venue)."""

import math

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services.carbon_exchange import venue, CONTRACT_SIZE
from services.emissions_calculator import estimate_airspace_emissions
from services.opensky_client import fetch_flights

router = APIRouter()

# Illustrative CORSIA offsetting requirement: share of tracked emissions above
# the sector baseline that must be offset (sector growth factor). Real values
# are published annually by ICAO per operator/state pair.
CORSIA_OFFSET_RATIO = 0.10
HOURS_PER_YEAR = 8760


class OrderRequest(BaseModel):
    symbol: str
    side: str
    qty: int
    type: str = "LMT"
    tif: str = "DAY"
    price: float | None = None
    stop: float | None = None


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
            "candles": venue.candles(symbol.upper(), minutes=minutes, limit=min(limit, 1000))}


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


@router.get("/corsia-obligation")
async def corsia_obligation(request: Request):
    """Annualised CORSIA offset requirement from live Bahamas FIR traffic vs. GEO hedge."""
    return await _obligation(_owner(request))


async def _obligation(owner: str) -> dict:
    flights = await fetch_flights()
    em = estimate_airspace_emissions(flights)
    transit_h = em["estimated_transit_hours"] or 0.5
    # The snapshot is the traffic in the FIR right now; each flight spends
    # ~transit_h inside it, so snapshot CO2 / transit_h ≈ CO2 per hour.
    annual_t = em["total_co2_tonnes"] / transit_h * HOURS_PER_YEAR
    required = annual_t * CORSIA_OFFSET_RATIO
    acct = venue.account(owner)
    hedged = sum(p["offsets"] for p in acct["positions"] if p["product"] == "GEO" and p["qty"] > 0)
    front = next((q for q in venue.market_snapshot(1)["quotes"] if q["product"] == "GEO"), None)
    remaining = max(0.0, required - hedged)
    return {
        "tracked_flights": em["total_flights"],
        "snapshot_co2_tonnes": em["total_co2_tonnes"],
        "annualised_co2_tonnes": round(annual_t),
        "offset_ratio": CORSIA_OFFSET_RATIO,
        "required_offsets": round(required),
        "hedged_offsets": hedged,
        "coverage_pct": round(min(100.0, hedged / required * 100), 1) if required else 100.0,
        "contracts_to_hedge": math.ceil(remaining / CONTRACT_SIZE),
        "hedge_symbol": front["symbol"] if front else None,
        "hedge_cost_estimate": round(math.ceil(remaining / CONTRACT_SIZE) * CONTRACT_SIZE * front["ask"], 2)
        if front and front["ask"] else None,
        "methodology": "ICAO CORSIA fuel-burn × 3.16; illustrative sector growth factor",
    }


# ── AI trading advisor ──────────────────────────────────────────────────────

class AdvisorQuestion(BaseModel):
    message: str


@router.get("/advisor/ideas")
async def advisor_ideas(request: Request):
    """Rule-based trade ideas and position review for the caller, plus AI availability."""
    from services import advisor_llm
    from services.trading_advisor import ideas
    owner = _owner(request)
    return {**ideas(venue, venue.account(owner), await _obligation(owner)), "ai": advisor_llm.status()}


@router.post("/advisor/chat")
async def advisor_chat(req: AdvisorQuestion, request: Request):
    """Ask the AI advisor (Claude via `claude -p`). Proposals come back as tickets; nothing is traded."""
    from services import advisor_llm
    from services.trading_advisor import ideas
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
    from services import advisor_llm
    advisor_llm.reset(_owner(request))
    return {"ok": True}
