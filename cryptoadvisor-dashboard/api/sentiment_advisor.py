"""Sentiment advisor API — personalized recommendations, news, alerts, profile."""

import time
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import DEFAULT_COINS
from services.sentiment_analyzer import (
    get_coin_sentiment,
    get_market_sentiment,
    analyze_articles,
)
from services.recommendation_engine import generate_all_recommendations
from services.news_scanner import get_articles, get_last_scan_time, get_article_count
from services.sentiment_alerts import get_user_sentiment_alerts, mark_alert_read
from services.user_data import get_username, load_user_data
from services.investment_profile import (
    get_profile,
    save_profile,
    RISK_LEVELS,
    STRATEGIES,
    TIME_HORIZONS,
    PORTFOLIO_GOALS,
)

router = APIRouter()


class ProfileUpdate(BaseModel):
    risk_tolerance: str = "moderate"
    strategy: str = "hodl"
    time_horizon: str = "medium"
    target_return_pct: int = 50
    portfolio_goal: str = "growth"
    monthly_investment: float = 0
    preferred_coins: list[str] = []
    avoid_coins: list[str] = []
    notes: str = ""


@router.get("/recommendations")
async def recommendations(request: Request):
    """Get personalized buy/hold/sell recommendations based on user's investment profile."""
    try:
        username = get_username(request)
        profile = get_profile(username)

        # Get user's favorites to include in recommendations
        favs = load_user_data(username, "favorites")
        user_coins = set(DEFAULT_COINS)
        if isinstance(favs, list):
            for fav in favs:
                coin_id = fav.get("coin_id") if isinstance(fav, dict) else fav
                if coin_id:
                    user_coins.add(coin_id)
        # Also add preferred coins from profile
        for coin_id in profile.get("preferred_coins", []):
            if coin_id:
                user_coins.add(coin_id)

        # Fetch current prices from CoinGecko (gracefully degrade if rate-limited)
        prices = []
        try:
            from services.coingecko import get_prices_list
            prices = await get_prices_list(tuple(sorted(user_coins)))
        except Exception:
            pass

        # Get fear & greed value
        fg_value = None
        try:
            from services.feargreed import get_fear_greed
            fg = await get_fear_greed()
            fg_data = fg.get("data", [{}])
            if isinstance(fg_data, list) and fg_data:
                fg_value = int(fg_data[0].get("value", 50))
            elif isinstance(fg_data, dict):
                fg_value = int(fg_data.get("value", 50))
        except Exception:
            pass

        recs = await generate_all_recommendations(
            prices=prices,
            fear_greed_value=fg_value,
            coin_ids=list(user_coins),
            profile=profile,
        )

        return {
            "recommendations": recs,
            "market_sentiment": get_market_sentiment(),
            "fear_greed": fg_value,
            "last_scan": get_last_scan_time(),
            "article_count": get_article_count(),
            "profile_completed": profile.get("completed", False),
            "strategy": profile.get("strategy", "hodl"),
            "risk_level": profile.get("risk_tolerance", "moderate"),
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/profile")
async def get_user_profile(request: Request):
    """Get the user's investment profile and all available options."""
    try:
        username = get_username(request)
        profile = get_profile(username)

        return {
            "profile": profile,
            "options": {
                "risk_levels": {
                    k: {"label": v["label"], "description": v["description"]}
                    for k, v in RISK_LEVELS.items()
                },
                "strategies": {
                    k: {"label": v["label"], "description": v["description"]}
                    for k, v in STRATEGIES.items()
                },
                "time_horizons": {
                    k: {"label": v["label"]}
                    for k, v in TIME_HORIZONS.items()
                },
                "portfolio_goals": {
                    k: {"label": v["label"], "description": v["description"]}
                    for k, v in PORTFOLIO_GOALS.items()
                },
            },
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/profile")
async def update_profile(request: Request, body: ProfileUpdate):
    """Save the user's investment profile."""
    try:
        username = get_username(request)
        profile_data = body.model_dump()
        saved = save_profile(username, profile_data)
        return {"ok": True, "profile": saved}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/news")
async def news_feed(request: Request, coin: str | None = None, limit: int = 30):
    """Get scored news articles, optionally filtered by coin."""
    try:
        articles = get_articles(coin_id=coin, limit=limit)
        articles = analyze_articles(articles)

        return {
            "articles": [
                {
                    "title": a.get("title", ""),
                    "summary": a.get("summary", "")[:200],
                    "url": a.get("url", ""),
                    "source": a.get("source", ""),
                    "source_type": a.get("source_type", ""),
                    "published_ts": a.get("published_ts", 0),
                    "coin_tags": a.get("coin_tags", []),
                    "sentiment_score": a.get("sentiment_score", 0),
                    "sentiment_label": a.get("sentiment_label", ""),
                }
                for a in articles
            ],
            "total": get_article_count(),
            "last_scan": get_last_scan_time(),
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/coin/{coin_id}")
async def coin_sentiment(request: Request, coin_id: str):
    """Get detailed sentiment analysis for a specific coin."""
    try:
        sentiment = get_coin_sentiment(coin_id)
        articles = get_articles(coin_id=coin_id, limit=10)
        articles = analyze_articles(articles)

        return {
            **sentiment,
            "recent_articles": [
                {
                    "title": a.get("title", ""),
                    "url": a.get("url", ""),
                    "source": a.get("source", ""),
                    "sentiment_score": a.get("sentiment_score", 0),
                    "sentiment_label": a.get("sentiment_label", ""),
                    "published_ts": a.get("published_ts", 0),
                }
                for a in articles
            ],
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/market")
async def market_overview(request: Request):
    """Get overall crypto market sentiment."""
    try:
        return get_market_sentiment()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/alerts")
async def sentiment_alerts(request: Request, unread_only: bool = False):
    """Get sentiment shift alerts for the current user."""
    try:
        username = get_username(request)
        alerts = get_user_sentiment_alerts(username, unread_only=unread_only)
        return {"alerts": alerts}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/alerts/{timestamp}/read")
async def mark_read(request: Request, timestamp: float):
    """Mark a sentiment alert as read."""
    try:
        username = get_username(request)
        mark_alert_read(username, timestamp)
        return {"ok": True}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
