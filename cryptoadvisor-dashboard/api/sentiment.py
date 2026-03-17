"""Sentiment analysis endpoints — wired to real sentiment aggregator."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from services.sentiment import get_aggregate_sentiment, get_reddit_sentiment, get_crypto_panic_news

router = APIRouter()


@router.get("/")
async def sentiment_overview(request: Request, coin: str = "bitcoin"):
    """Get aggregate sentiment for a coin (used by the Sentiment page)."""
    try:
        data = await get_aggregate_sentiment(coin)

        # Reshape into the format the Sentiment.jsx page expects
        sources = []
        src = data.get("sources", {})
        if "reddit" in src:
            sources.append({
                "name": "Reddit",
                "score": src["reddit"].get("score", 0),
                "post_count": src["reddit"].get("mentions", 0),
            })
        if "crypto_panic" in src:
            cp = src["crypto_panic"]
            pos = cp.get("positive_votes", 0)
            neg = cp.get("negative_votes", 0)
            total = pos + neg
            score = int(((pos - neg) / total) * 100) if total > 0 else 0
            sources.append({
                "name": "CryptoPanic",
                "score": score,
                "post_count": cp.get("articles", 0),
            })

        mentions = []
        for post in data.get("recent_reddit_posts", []):
            mentions.append({
                "title": post.get("title", ""),
                "source": f"r/{post.get('subreddit', 'cryptocurrency')}",
                "score": post.get("score", 0),
                "url": post.get("url", ""),
            })
        for news in data.get("recent_news", []):
            mentions.append({
                "title": news.get("title", ""),
                "source": news.get("source", ""),
                "score": 0,
                "url": news.get("url", ""),
            })

        return {
            "coin": data.get("coin", coin),
            "overall_score": data.get("overall_score", 0),
            "label": data.get("label", "Neutral"),
            "trending": data.get("trending", False),
            "recent_mentions": data.get("recent_mentions", 0),
            "sources": sources,
            "mentions": mentions,
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/{coin}")
async def aggregate_sentiment(request: Request, coin: str):
    """Get full aggregate sentiment report for a coin."""
    try:
        return await get_aggregate_sentiment(coin)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/{coin}/reddit")
async def reddit_sentiment(request: Request, coin: str):
    try:
        return await get_reddit_sentiment(coin)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/{coin}/news")
async def news_sentiment(request: Request, coin: str):
    try:
        news = await get_crypto_panic_news(coin)
        return {"coin": coin, "source": "cryptopanic", "articles": news}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
