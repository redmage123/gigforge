"""AI Analysis API — all Claude-powered endpoints."""

import logging
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel

from services.user_data import get_username
from services import trades as trades_service
from services import user_data
from services import coingecko
from services import news as news_service
from services.memory import get_portfolio
from services.ai_copilot import (
    analyze_page_data, analyze_technical, analyze_portfolio,
    analyze_whale_activity, analyze_defi_positions,
)
from services.ai_smart_alerts import parse_alert_condition, get_alert_suggestions
from services.ai_trade_analysis import analyze_trades, get_trade_suggestions
from services.ai_news_briefing import (
    generate_daily_briefing, summarize_news, get_market_commentary,
)
from services.ai_risk_assessment import (
    full_risk_assessment, assess_position_risk, get_risk_score,
)
from services.ai_tax_optimizer import (
    find_tax_loss_harvesting, optimize_tax_strategy, estimate_tax_impact,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# --- Request models ---

class CopilotRequest(BaseModel):
    page: str
    data: dict[str, Any] = {}


class TechnicalRequest(BaseModel):
    coin: str


class WhaleRequest(BaseModel):
    transactions: list[dict[str, Any]]


class DefiRequest(BaseModel):
    positions: list[dict[str, Any]]


class AlertParseRequest(BaseModel):
    condition: str


class TradeImpactRequest(BaseModel):
    trade: dict[str, Any]


# --- Copilot endpoints ---

@router.post("/copilot")
async def copilot(request: Request, body: CopilotRequest):
    analysis = await analyze_page_data(body.page, body.data)
    return {"analysis": analysis}


@router.post("/copilot/technical")
async def copilot_technical(request: Request, body: TechnicalRequest):
    coin = body.coin.lower()
    try:
        prices = await coingecko.get_prices((coin,))
        price_data = prices.get(coin, {})
    except Exception:
        price_data = {}
    analysis = await analyze_technical(coin, price_data)
    return {"analysis": analysis}


@router.post("/copilot/portfolio")
async def copilot_portfolio(request: Request):
    portfolio = get_portfolio()
    holdings = portfolio.get("holdings", [])
    analysis = await analyze_portfolio(holdings)
    return {"analysis": analysis}


@router.post("/copilot/whale")
async def copilot_whale(request: Request, body: WhaleRequest):
    analysis = await analyze_whale_activity(body.transactions)
    return {"analysis": analysis}


@router.post("/copilot/defi")
async def copilot_defi(request: Request, body: DefiRequest):
    analysis = await analyze_defi_positions(body.positions)
    return {"analysis": analysis}


# --- Smart alerts endpoints ---

@router.post("/smart-alerts/parse")
async def smart_alerts_parse(request: Request, body: AlertParseRequest):
    parsed = await parse_alert_condition(body.condition)
    return parsed


@router.post("/smart-alerts/suggest")
async def smart_alerts_suggest(request: Request):
    portfolio = get_portfolio()
    holdings = portfolio.get("holdings", [])
    suggestions = await get_alert_suggestions(holdings)
    return {"suggestions": suggestions}


# --- Trade analysis endpoints ---

@router.post("/trades/analyze")
async def trades_analyze(request: Request):
    username = get_username(request)
    user_trades = trades_service.get_trades(username)
    analysis = await analyze_trades(user_trades)
    return {"analysis": analysis}


@router.post("/trades/suggest")
async def trades_suggest(request: Request):
    username = get_username(request)
    portfolio = get_portfolio()
    holdings = portfolio.get("holdings", [])
    try:
        prices = await coingecko.get_prices(("bitcoin", "ethereum", "solana"))
    except Exception:
        prices = {}
    suggestions = await get_trade_suggestions(holdings, prices)
    return {"suggestions": suggestions}


# --- Briefing endpoints ---

@router.get("/briefing")
async def daily_briefing(request: Request):
    try:
        prices = await coingecko.get_prices(
            ("bitcoin", "ethereum", "solana", "cardano", "polkadot")
        )
    except Exception:
        prices = {}
    try:
        articles = await news_service.get_news(limit=10)
    except Exception:
        articles = []
    # Simple sentiment placeholder — could integrate sentiment service
    sentiment = {"market_mood": "neutral"}
    briefing = await generate_daily_briefing(prices, articles, sentiment)
    return {"briefing": briefing}


@router.get("/briefing/{coin}")
async def coin_briefing(request: Request, coin: str):
    coin = coin.lower()
    try:
        prices = await coingecko.get_prices((coin,))
        price_data = prices.get(coin, {})
    except Exception:
        price_data = {}
    try:
        articles = await news_service.get_news(limit=15)
    except Exception:
        articles = []
    commentary = await get_market_commentary(coin, price_data, articles)
    return {"commentary": commentary}


# --- Risk endpoints ---

@router.post("/risk/assessment")
async def risk_assessment(request: Request):
    username = get_username(request)
    portfolio = get_portfolio()
    # Enrich with DeFi and staking data if available
    defi_data = user_data.load_user_data(username, "defi")
    staking_data = user_data.load_user_data(username, "staking")
    exchange_data = user_data.load_user_data(username, "exchanges")

    full_portfolio = {
        "holdings": portfolio.get("holdings", []),
        "total_value": portfolio.get("total_value", 0),
        "defi_positions": defi_data if isinstance(defi_data, list) else [],
        "staking": staking_data if isinstance(staking_data, list) else [],
        "exchanges": exchange_data if isinstance(exchange_data, list) else [],
    }
    report = await full_risk_assessment(full_portfolio)
    return {"report": report}


@router.post("/risk/score")
async def risk_score(request: Request):
    portfolio = get_portfolio()
    score = await get_risk_score(portfolio)
    return score


# --- Tax endpoints ---

@router.post("/tax/optimize")
async def tax_optimize(request: Request):
    username = get_username(request)
    portfolio = get_portfolio()
    holdings = portfolio.get("holdings", [])
    tax_data = user_data.load_user_data(username, "tax_report")
    tax_report = tax_data if isinstance(tax_data, dict) else {
        "short_term_gains": 0, "long_term_gains": 0,
        "total_gains": 0, "total_losses": 0,
    }
    strategy = await optimize_tax_strategy(tax_report, holdings)
    return {"strategy": strategy}


@router.post("/tax/harvest")
async def tax_harvest(request: Request):
    username = get_username(request)
    portfolio = get_portfolio()
    holdings = portfolio.get("holdings", [])
    user_trades = trades_service.get_trades(username)
    opportunities = await find_tax_loss_harvesting(holdings, user_trades)
    return {"opportunities": opportunities}


@router.post("/tax/impact")
async def tax_impact(request: Request, body: TradeImpactRequest):
    username = get_username(request)
    user_trades = trades_service.get_trades(username)
    impact = await estimate_tax_impact(body.trade, user_trades)
    return {"impact": impact}
