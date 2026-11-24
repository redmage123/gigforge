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
                    headers={"User-Agent": "AssetAdvisor/1.0"},
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

    # Free crypto news RSS feeds (Reddit refuses many server addresses)
    if len(articles) < limit:
        import time

        global _rss_cache
        at, cached = _rss_cache
        if not cached or time.time() - at > 900:
            cached = await _rss_articles()
            if cached:
                _rss_cache = (time.time(), cached)
        seen = {a["title"] for a in articles}
        for a in cached:                      # the same story often runs on several feeds
            if a["title"] not in seen:
                articles.append(a)
                seen.add(a["title"])

    return articles[:limit]


RSS_FEEDS = (("CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"), ("Cointelegraph", "https://cointelegraph.com/rss"))
_rss_cache: tuple[float, list[dict]] = (0.0, [])


async def _rss_articles(per_feed: int = 10) -> list[dict]:
    import feedparser

    out = []
    async with httpx.AsyncClient(timeout=15, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0 AssetAdvisor"}) as client:
        for source, url in RSS_FEEDS:
            try:
                r = await client.get(url)
                r.raise_for_status()
            except httpx.HTTPError:
                continue
            for e in feedparser.parse(r.text).entries[:per_feed]:
                title = e.get("title", "")
                if title:
                    out.append({"title": title, "url": e.get("link", ""), "source": source,
                                "published": e.get("published", ""), "sentiment": _score_sentiment(title)})
    return out


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
