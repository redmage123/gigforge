"""Social sentiment aggregator for cryptocurrency mentions."""

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# Simple keyword-based sentiment scoring
_POSITIVE_WORDS = {
    "bullish", "moon", "pump", "breakout", "accumulate", "buy",
    "rocket", "surge", "rally", "gains", "undervalued", "gem",
    "strong", "support", "green", "hodl", "diamond",
}

_NEGATIVE_WORDS = {
    "bearish", "dump", "crash", "sell", "fear", "rug",
    "scam", "overvalued", "resistance", "red", "capitulation",
    "liquidation", "correction", "dead", "bubble", "panic",
}

CRYPTO_PANIC_API = "https://cryptopanic.com/api/free/v1/posts/"

# Subreddits to scan per coin (keys are CoinGecko IDs / common names)
_SUBREDDITS: dict[str, list[str]] = {
    "bitcoin": ["bitcoin", "cryptocurrency"],
    "ethereum": ["ethereum", "cryptocurrency"],
    "solana": ["solana", "cryptocurrency"],
    "cardano": ["cardano", "cryptocurrency"],
    "default": ["cryptocurrency", "CryptoMarkets"],
}


def _score_text(text: str) -> int:
    """Score a piece of text using keyword sentiment. Returns -100 to 100."""
    words = set(text.lower().split())
    pos = len(words & _POSITIVE_WORDS)
    neg = len(words & _NEGATIVE_WORDS)
    total = pos + neg
    if total == 0:
        return 0
    return int(((pos - neg) / total) * 100)


async def get_reddit_sentiment(coin: str) -> dict[str, Any]:
    """Fetch recent Reddit posts mentioning the coin and score sentiment.

    Uses Reddit's public JSON endpoints (no auth required, rate-limited).
    """
    subreddits = _SUBREDDITS.get(coin.lower(), _SUBREDDITS["default"])
    posts: list[dict[str, Any]] = []
    total_score = 0
    mention_count = 0

    try:
        async with httpx.AsyncClient(
            timeout=15.0,
            headers={"User-Agent": "CryptoAdvisor/1.0"},
        ) as client:
            for sub in subreddits:
                try:
                    url = f"https://www.reddit.com/r/{sub}/search.json"
                    params = {
                        "q": coin,
                        "sort": "new",
                        "limit": 25,
                        "restrict_sr": "true",
                        "t": "week",
                    }
                    resp = await client.get(url, params=params)
                    if resp.status_code != 200:
                        continue

                    data = resp.json()
                    children = data.get("data", {}).get("children", [])

                    for child in children:
                        post_data = child.get("data", {})
                        title = post_data.get("title", "")
                        selftext = post_data.get("selftext", "")
                        combined = f"{title} {selftext}"
                        score = _score_text(combined)
                        ups = post_data.get("ups", 0)

                        posts.append({
                            "title": title[:200],
                            "subreddit": sub,
                            "score": score,
                            "ups": ups,
                            "url": f"https://reddit.com{post_data.get('permalink', '')}",
                        })
                        total_score += score
                        mention_count += 1

                except Exception as exc:
                    logger.warning("Error fetching r/%s: %s", sub, exc)

    except Exception as exc:
        logger.error("Reddit sentiment error for %s: %s", coin, exc)

    avg_score = total_score // mention_count if mention_count > 0 else 0

    return {
        "source": "reddit",
        "coin": coin,
        "mention_count": mention_count,
        "average_score": avg_score,
        "posts": posts[:10],  # Top 10
    }


async def get_crypto_panic_news(coin: str) -> list[dict[str, Any]]:
    """Fetch news from CryptoPanic free API for a given coin."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            params: dict[str, str] = {
                "currencies": coin.upper()[:5],
                "public": "true",
            }
            resp = await client.get(CRYPTO_PANIC_API, params=params)
            if resp.status_code != 200:
                logger.warning("CryptoPanic returned %d", resp.status_code)
                return []

            data = resp.json()
            results: list[dict[str, Any]] = []
            for item in data.get("results", [])[:15]:
                sentiment = item.get("votes", {})
                results.append({
                    "title": item.get("title", ""),
                    "url": item.get("url", ""),
                    "source": item.get("source", {}).get("title", "Unknown"),
                    "published_at": item.get("published_at", ""),
                    "positive_votes": sentiment.get("positive", 0),
                    "negative_votes": sentiment.get("negative", 0),
                })
            return results

    except Exception as exc:
        logger.warning("CryptoPanic error for %s: %s", coin, exc)
        return []


async def get_aggregate_sentiment(coin: str) -> dict[str, Any]:
    """Combine Reddit and CryptoPanic signals into a single sentiment report.

    Returns overall_score (-100 to 100), sources, recent_mentions, trending flag.
    """
    try:
        reddit = await get_reddit_sentiment(coin)
        news = await get_crypto_panic_news(coin)

        scores: list[int] = []

        # Reddit score
        if reddit.get("mention_count", 0) > 0:
            scores.append(reddit["average_score"])

        # CryptoPanic score from vote ratios
        total_pos = sum(n.get("positive_votes", 0) for n in news)
        total_neg = sum(n.get("negative_votes", 0) for n in news)
        if total_pos + total_neg > 0:
            news_score = int(((total_pos - total_neg) / (total_pos + total_neg)) * 100)
            scores.append(news_score)

        overall = sum(scores) // len(scores) if scores else 0
        total_mentions = reddit.get("mention_count", 0) + len(news)

        # Trending heuristic: high mention count and strong sentiment
        trending = total_mentions > 15 and abs(overall) > 30

        if overall > 40:
            label = "Very Bullish"
        elif overall > 15:
            label = "Bullish"
        elif overall > -15:
            label = "Neutral"
        elif overall > -40:
            label = "Bearish"
        else:
            label = "Very Bearish"

        return {
            "coin": coin,
            "overall_score": overall,
            "label": label,
            "trending": trending,
            "recent_mentions": total_mentions,
            "sources": {
                "reddit": {
                    "score": reddit.get("average_score", 0),
                    "mentions": reddit.get("mention_count", 0),
                },
                "crypto_panic": {
                    "positive_votes": total_pos,
                    "negative_votes": total_neg,
                    "articles": len(news),
                },
            },
            "recent_news": news[:5],
            "recent_reddit_posts": reddit.get("posts", [])[:5],
        }

    except Exception as exc:
        logger.error("Aggregate sentiment error for %s: %s", coin, exc)
        return {
            "coin": coin,
            "overall_score": 0,
            "label": "Unknown",
            "trending": False,
            "recent_mentions": 0,
            "sources": {},
            "error": str(exc),
        }
