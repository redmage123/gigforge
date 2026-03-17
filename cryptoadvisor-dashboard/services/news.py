"""Crypto news aggregation with sentiment scoring."""

import os
import httpx
from services.cache import cached


@cached(ttl=600)
async def get_news(limit: int = 10) -> list[dict]:
    """Aggregate news from CryptoPanic and Reddit."""
    articles = []

    # CryptoPanic (if API key set)
    api_key = os.getenv("CRYPTOPANIC_API_KEY")
    if api_key:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://cryptopanic.com/api/v1/posts/",
                    params={"auth_token": api_key, "public": "true", "kind": "news"},
                )
                if resp.status_code == 200:
                    for item in resp.json().get("results", [])[:limit]:
                        articles.append({
                            "title": item.get("title", ""),
                            "url": item.get("url", ""),
                            "source": item.get("source", {}).get("title", "CryptoPanic"),
                            "published": item.get("published_at", ""),
                            "sentiment": _score_sentiment(item.get("title", "")),
                        })
        except Exception:
            pass

    # Reddit r/cryptocurrency (fallback)
    if len(articles) < limit:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://www.reddit.com/r/cryptocurrency/hot.json",
                    params={"limit": limit},
                    headers={"User-Agent": "CryptoAdvisor/1.0"},
                )
                if resp.status_code == 200:
                    for post in resp.json().get("data", {}).get("children", []):
                        d = post.get("data", {})
                        articles.append({
                            "title": d.get("title", ""),
                            "url": f"https://reddit.com{d.get('permalink', '')}",
                            "source": "Reddit",
                            "published": "",
                            "sentiment": _score_sentiment(d.get("title", "")),
                        })
        except Exception:
            pass

    return articles[:limit]


def _score_sentiment(text: str) -> str:
    """Simple keyword-based sentiment scoring."""
    text = text.lower()
    bullish = ["bull", "surge", "rally", "moon", "pump", "high", "record", "gain", "profit", "breakout"]
    bearish = ["bear", "crash", "dump", "drop", "low", "fear", "loss", "sell", "decline", "plunge"]
    b_score = sum(1 for w in bullish if w in text)
    s_score = sum(1 for w in bearish if w in text)
    if b_score > s_score:
        return "bullish"
    elif s_score > b_score:
        return "bearish"
    return "neutral"
