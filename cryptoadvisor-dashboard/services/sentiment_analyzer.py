"""VADER-based sentiment analyzer with crypto-specific lexicon enhancements.

Scores individual articles and provides aggregated sentiment per coin.
"""

import logging
import time
from typing import Any

from nltk.sentiment.vader import SentimentIntensityAnalyzer

from services.news_scanner import get_articles, get_article_count

logger = logging.getLogger(__name__)

# Initialize VADER with crypto-specific lexicon additions
_sia = SentimentIntensityAnalyzer()

# Boost crypto-specific words in VADER's lexicon
_CRYPTO_LEXICON = {
    # Strongly bullish
    "bullish": 3.0, "moon": 2.5, "mooning": 3.0, "breakout": 2.5,
    "accumulate": 2.0, "hodl": 2.0, "diamond": 1.5, "rocket": 2.0,
    "rally": 2.5, "surge": 2.5, "soar": 2.5, "pump": 1.5,
    "adoption": 2.0, "partnership": 1.5, "upgrade": 1.5, "milestone": 1.5,
    "ath": 2.5, "record": 1.5, "breakthrough": 2.0,
    # Strongly bearish
    "bearish": -3.0, "crash": -3.0, "dump": -2.5, "rug": -3.5,
    "rugpull": -3.5, "scam": -3.5, "hack": -3.0, "exploit": -3.0,
    "liquidation": -2.5, "capitulation": -2.5, "bubble": -2.0,
    "ban": -2.5, "regulation": -1.0, "sec": -1.0, "lawsuit": -2.5,
    "bankrupt": -3.5, "insolvent": -3.5, "fraud": -3.5,
    "plunge": -3.0, "collapse": -3.0, "tumble": -2.5,
    # Mildly positive
    "undervalued": 1.5, "support": 1.0, "green": 1.0, "gains": 1.5,
    "profit": 1.5, "buy": 1.0, "accumulation": 1.5, "defi": 0.5,
    "staking": 0.5, "yield": 0.5, "airdrop": 1.0,
    # Mildly negative
    "overvalued": -1.5, "resistance": -0.5, "red": -1.0,
    "fear": -1.5, "sell": -1.0, "correction": -1.5, "decline": -1.5,
    "delay": -1.0, "postpone": -1.0, "risk": -0.5,
}

_sia.lexicon.update(_CRYPTO_LEXICON)


def analyze_text(text: str) -> dict[str, float]:
    """Score a text using VADER. Returns compound (-1 to 1) and category scores."""
    scores = _sia.polarity_scores(text)
    return {
        "compound": scores["compound"],
        "positive": scores["pos"],
        "negative": scores["neg"],
        "neutral": scores["neu"],
    }


def score_to_label(compound: float) -> str:
    """Map VADER compound score to human-readable label."""
    if compound >= 0.5:
        return "Very Bullish"
    if compound >= 0.15:
        return "Bullish"
    if compound > -0.15:
        return "Neutral"
    if compound > -0.5:
        return "Bearish"
    return "Very Bearish"


def score_to_100(compound: float) -> int:
    """Map VADER compound (-1 to 1) to -100 to 100 scale."""
    return int(compound * 100)


def analyze_articles(articles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Analyze sentiment for a list of articles in-place. Returns the updated list."""
    for article in articles:
        text = f"{article.get('title', '')} {article.get('summary', '')}"
        scores = analyze_text(text)
        article["sentiment_score"] = score_to_100(scores["compound"])
        article["sentiment_label"] = score_to_label(scores["compound"])
        article["sentiment_detail"] = scores
    return articles


def get_coin_sentiment(coin_id: str) -> dict[str, Any]:
    """Get aggregated sentiment for a specific coin from all cached articles."""
    articles = get_articles(coin_id)
    if not articles:
        return {
            "coin": coin_id,
            "overall_score": 0,
            "label": "No Data",
            "article_count": 0,
            "source_breakdown": {},
            "trend": "neutral",
            "confidence": 0,
        }

    # Analyze any unscored articles
    for article in articles:
        if article.get("sentiment_label") == "pending":
            text = f"{article.get('title', '')} {article.get('summary', '')}"
            scores = analyze_text(text)
            article["sentiment_score"] = score_to_100(scores["compound"])
            article["sentiment_label"] = score_to_label(scores["compound"])

    # Weighted average: newer articles weigh more
    now = time.time()
    total_weight = 0
    weighted_score = 0
    source_scores: dict[str, list[int]] = {}

    for article in articles:
        age_hours = (now - article.get("published_ts", now)) / 3600
        # Exponential decay: half-life of 24 hours
        weight = 2 ** (-age_hours / 24)

        # Boost weight for articles with high engagement
        ups = article.get("ups", 0)
        if ups > 100:
            weight *= 1.5
        elif ups > 50:
            weight *= 1.2

        score = article.get("sentiment_score", 0)
        weighted_score += score * weight
        total_weight += weight

        source_type = article.get("source_type", "unknown")
        source_scores.setdefault(source_type, []).append(score)

    overall = int(weighted_score / total_weight) if total_weight > 0 else 0

    # Source breakdown
    source_breakdown = {}
    for source_type, scores in source_scores.items():
        avg = sum(scores) // len(scores) if scores else 0
        source_breakdown[source_type] = {
            "average_score": avg,
            "label": score_to_label(avg / 100),
            "article_count": len(scores),
        }

    # Trend: compare recent (last 6h) vs older articles
    recent_scores = []
    older_scores = []
    for article in articles:
        age_hours = (now - article.get("published_ts", now)) / 3600
        s = article.get("sentiment_score", 0)
        if age_hours <= 6:
            recent_scores.append(s)
        else:
            older_scores.append(s)

    recent_avg = sum(recent_scores) / len(recent_scores) if recent_scores else 0
    older_avg = sum(older_scores) / len(older_scores) if older_scores else 0
    delta = recent_avg - older_avg

    if delta > 15:
        trend = "improving"
    elif delta < -15:
        trend = "declining"
    else:
        trend = "stable"

    # Confidence based on article count
    confidence = min(100, len(articles) * 5)

    return {
        "coin": coin_id,
        "overall_score": overall,
        "label": score_to_label(overall / 100),
        "article_count": len(articles),
        "source_breakdown": source_breakdown,
        "trend": trend,
        "trend_delta": round(delta, 1),
        "recent_avg": round(recent_avg, 1),
        "confidence": confidence,
    }


def get_market_sentiment() -> dict[str, Any]:
    """Get overall crypto market sentiment from all articles."""
    all_articles = get_articles(limit=200)
    if not all_articles:
        return {"overall_score": 0, "label": "No Data", "article_count": 0}

    scores = []
    for article in all_articles:
        if article.get("sentiment_label") == "pending":
            text = f"{article.get('title', '')} {article.get('summary', '')}"
            result = analyze_text(text)
            article["sentiment_score"] = score_to_100(result["compound"])
            article["sentiment_label"] = score_to_label(result["compound"])
        scores.append(article.get("sentiment_score", 0))

    avg = sum(scores) // len(scores)
    bullish = sum(1 for s in scores if s > 15)
    bearish = sum(1 for s in scores if s < -15)
    neutral = len(scores) - bullish - bearish

    return {
        "overall_score": avg,
        "label": score_to_label(avg / 100),
        "article_count": len(scores),
        "total_articles_stored": get_article_count(),
        "distribution": {
            "bullish": bullish,
            "bearish": bearish,
            "neutral": neutral,
        },
    }
