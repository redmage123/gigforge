"""Advanced AI-powered analysis endpoints."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from api.portfolios import scope_of
from services import market
from services.ai_context import holdings_for_ai
from services.ai_pattern_recognition import detect_patterns, parse_patterns
from services.ai_portfolio_builder import build_portfolio, optimize_existing
from services.ai_trade_coach import compute_trade_stats, get_trading_insights, post_mortem
from services.market import registry
from services.trades import get_trades
from services.user_data import get_username

logger = logging.getLogger(__name__)

router = APIRouter()


class PortfolioBuilderRequest(BaseModel):
    description: str
    budget: float


class PortfolioOptimizeRequest(BaseModel):
    goal: str


class PatternDetectRequest(BaseModel):
    coin: str  # instrument id ("crypto:BTC", "stock:AAPL") or a legacy CoinGecko id ("bitcoin")


class TradeCoachRequest(BaseModel):
    trade_id: str


class AiError(Exception):
    """The AI call failed; the message is safe to show the user."""


def _error(message: str, status: int = 502) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status)


async def _ai(call) -> str:
    """Await a service's ask_claude-based call. ask_claude reports failures as "Error: ..." text."""
    try:
        text = await call
    except Exception as exc:  # noqa: BLE001 — surface as a readable 502, never a 500
        logger.warning("AI call failed: %s", exc)
        raise AiError(f"AI analysis failed: {exc}") from exc
    if not text or text.startswith("Error:"):
        raise AiError(f"AI analysis failed: {(text or 'empty reply').removeprefix('Error:').strip()}")
    return text


async def _resolve_instrument(ref: str):
    await registry.ensure_loaded()
    iid = ref if ":" in ref else registry.from_coingecko_id(ref.lower())
    return registry.get(iid) if iid else None


def _scoped_trades(request: Request) -> list[dict]:
    """The trades the user is looking at (same portfolio scope as the Trade Journal)."""
    scope = scope_of(request)
    return get_trades(scope.owner, scope.portfolio_ids)


@router.post("/portfolio-builder")
async def ai_portfolio_builder(request: Request, body: PortfolioBuilderRequest):
    if not body.description.strip():
        return _error("Describe the portfolio you want.", 400)
    if body.budget <= 0:
        return _error("Budget must be greater than zero.", 400)
    try:
        text = await _ai(build_portfolio(body.description.strip(), body.budget))
    except AiError as exc:
        return _error(str(exc))
    return {"description": body.description, "budget": body.budget, "analysis": text}


@router.post("/portfolio-optimize")
async def ai_portfolio_optimize(request: Request, body: PortfolioOptimizeRequest):
    holdings = await holdings_for_ai(get_username(request))
    if not holdings:
        return _error("You have no open positions to optimize. Add trades in the Trade Journal first.", 400)
    goal = body.goal.strip() or "maximize risk-adjusted returns"
    try:
        text = await _ai(optimize_existing(holdings, goal))
    except AiError as exc:
        return _error(str(exc))
    return {"goal": goal, "positions": len(holdings), "analysis": text}


@router.post("/pattern-detect")
async def ai_pattern_detect(request: Request, body: PatternDetectRequest):
    inst = await _resolve_instrument(body.coin.strip())
    if not inst:
        return _error(f"Unknown instrument '{body.coin}'.", 400)
    try:
        candles = await market.candles(inst.id, "1d", 60)
    except Exception as exc:  # noqa: BLE001 — provider/network errors
        logger.warning("pattern-detect candles for %s failed: %s", inst.id, exc)
        return _error(f"Could not load price history for {inst.name}: {exc}")
    if not candles:
        return _error(f"No price history available for {inst.name}.")
    history = [{
        "date": datetime.fromtimestamp(c.open_time / 1000, timezone.utc).strftime("%Y-%m-%d"),
        "open": c.open, "high": c.high, "low": c.low, "close": c.close,
    } for c in candles]
    label = f"{inst.name} ({inst.symbol}, {inst.asset_class})"
    try:
        text = await _ai(detect_patterns(label, history))
    except AiError as exc:
        return _error(str(exc))
    parsed = parse_patterns(text)
    return {"coin": inst.id, "name": inst.name, "last_close": history[-1]["close"], **parsed}


@router.get("/regulatory")
async def regulatory_briefing(request: Request):
    username = request.state.user.get("sub", "")
    return {
        "briefing": [],
        "last_updated": None,
        "username": username,
    }


@router.post("/regulatory-risk")
async def regulatory_risk_assessment(request: Request):
    username = request.state.user.get("sub", "")
    return {
        "risk_level": "unknown",
        "flagged_tokens": [],
        "summary": "",
        "username": username,
    }


@router.post("/trade-coach")
async def trade_coach(request: Request, body: TradeCoachRequest):
    trades = _scoped_trades(request)
    trade = next((t for t in trades if t.get("id") == body.trade_id), None)
    if not trade:
        return _error("Trade not found.", 404)
    inst = await _resolve_instrument(trade["instrument_id"])
    stats = compute_trade_stats([t for t in trades if t["instrument_id"] == trade["instrument_id"]],
                                {inst.id: inst.multiplier} if inst else None)
    try:
        quote = (await market.quotes([trade["instrument_id"]])).get(trade["instrument_id"])
    except Exception as exc:  # noqa: BLE001 — the post-mortem still works without a live price
        logger.warning("trade-coach quote failed: %s", exc)
        quote = None
    market_data = {"instrument": f"{inst.name} ({inst.symbol}, {inst.asset_class})" if inst else trade["instrument_id"],
                   "price_at_trade": trade["price"]}
    if quote:
        market_data.update({
            "price_now": quote.price,
            "change_since_trade_pct": round((quote.price / trade["price"] - 1) * 100, 2) if trade["price"] else None,
            "change_24h_pct": quote.change_pct,
        })
    if trade.get("id") in stats["trade_pnl"]:
        market_data["realized_pnl_of_this_trade"] = stats["trade_pnl"][trade["id"]]
    trade_info = {k: trade.get(k) for k in ("instrument_id", "side", "quantity", "price", "fee", "date", "notes")}
    try:
        text = await _ai(post_mortem(trade_info, market_data))
    except AiError as exc:
        return _error(str(exc))
    return {"trade_id": body.trade_id, "trade": trade_info, "market": market_data, "analysis": text}


@router.post("/trading-insights")
async def trading_insights(request: Request):
    trades = _scoped_trades(request)
    await registry.ensure_loaded()
    mult = {}
    for iid in {t["instrument_id"] for t in trades}:
        inst = registry.get(iid)
        mult[iid] = inst.multiplier if inst else 1.0
    full = compute_trade_stats(trades, mult)
    stats = {k: v for k, v in full.items() if k != "trade_pnl"}
    if not trades:
        return {**stats, "analysis": None, "ai_error": None}
    # The statistics are useful on their own: an AI failure is reported next to them, not as an error
    try:
        analysis, ai_error = await _ai(get_trading_insights(trades, full)), None
    except AiError as exc:
        analysis, ai_error = None, str(exc)
    return {**stats, "analysis": analysis, "ai_error": ai_error}
