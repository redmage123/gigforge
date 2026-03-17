"""Multi-source news scanner for cryptocurrency sentiment analysis.

Aggregates news from RSS feeds (CoinDesk, CoinTelegraph, Bitcoin Magazine,
CryptoSlate, The Block) plus Reddit and CryptoPanic into a unified feed.
Each article gets a VADER sentiment score and coin-tag mapping.
"""

import asyncio
import logging
import time
from typing import Any

import feedparser
import httpx

logger = logging.getLogger(__name__)

# RSS feed sources
RSS_FEEDS = {
    "CoinDesk": "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "CoinTelegraph": "https://cointelegraph.com/rss",
    "Bitcoin Magazine": "https://bitcoinmagazine.com/feed",
    "CryptoSlate": "https://cryptoslate.com/feed/",
    "The Block": "https://www.theblock.co/rss.xml",
    "Decrypt": "https://decrypt.co/feed",
}

# Map common coin names/tickers to CoinGecko IDs
COIN_ALIASES: dict[str, str] = {
    "bitcoin": "bitcoin", "btc": "bitcoin",
    "ethereum": "ethereum", "eth": "ethereum",
    "solana": "solana", "sol": "solana",
    "cardano": "cardano", "ada": "cardano",
    "polkadot": "polkadot", "dot": "polkadot",
    "avalanche": "avalanche-2", "avax": "avalanche-2",
    "chainlink": "chainlink", "link": "chainlink",
    "dogecoin": "dogecoin", "doge": "dogecoin",
    "ripple": "ripple", "xrp": "ripple",
    "bnb": "binancecoin", "binance": "binancecoin",
    "polygon": "matic-network", "matic": "matic-network",
    "uniswap": "uniswap", "uni": "uniswap",
    "litecoin": "litecoin", "ltc": "litecoin",
    "shiba": "shiba-inu", "shib": "shiba-inu",
}

# In-memory article store (persists across scans within one process lifetime)
_articles: list[dict[str, Any]] = []
_last_scan: float = 0


def _extract_coin_tags(text: str) -> list[str]:
    """Extract coin IDs mentioned in text."""
    text_lower = text.lower()
    found = set()
    for alias, coin_id in COIN_ALIASES.items():
        # Match whole words to avoid false positives
        if f" {alias} " in f" {text_lower} " or f" {alias}." in f" {text_lower}." or f" {alias}," in f" {text_lower},":
            found.add(coin_id)
    return list(found)


async def _fetch_rss_feed(source: str, url: str) -> list[dict[str, Any]]:
    """Fetch and parse a single RSS feed."""
    articles = []
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "CryptoAdvisor/1.0"})
            if resp.status_code != 200:
                logger.warning("RSS %s returned %d", source, resp.status_code)
                return []

        feed = feedparser.parse(resp.text)
        for entry in feed.entries[:30]:
            title = entry.get("title", "")
            summary = entry.get("summary", "")[:500]
            link = entry.get("link", "")
            published = entry.get("published", "")

            # Parse published time to epoch
            published_ts = 0
            if hasattr(entry, "published_parsed") and entry.published_parsed:
                try:
                    published_ts = time.mktime(entry.published_parsed)
                except Exception:
                    pass

            coin_tags = _extract_coin_tags(f"{title} {summary}")

            articles.append({
                "title": title,
                "summary": summary,
                "url": link,
                "source": source,
                "source_type": "rss",
                "published": published,
                "published_ts": published_ts or time.time(),
                "coin_tags": coin_tags,
                "sentiment_score": 0,  # filled in by sentiment_analyzer
                "sentiment_label": "pending",
            })
    except Exception as exc:
        logger.warning("Error fetching RSS %s: %s", source, exc)

    return articles


async def _fetch_reddit_posts(subreddits: list[str] = None) -> list[dict[str, Any]]:
    """Fetch recent crypto posts from Reddit."""
    subreddits = subreddits or ["cryptocurrency", "CryptoMarkets", "bitcoin", "ethereum", "solana"]
    articles = []

    try:
        async with httpx.AsyncClient(
            timeout=15.0,
            headers={"User-Agent": "CryptoAdvisor/1.0"},
        ) as client:
            for sub in subreddits:
                try:
                    resp = await client.get(
                        f"https://www.reddit.com/r/{sub}/hot.json",
                        params={"limit": 25},
                    )
                    if resp.status_code != 200:
                        continue

                    for child in resp.json().get("data", {}).get("children", []):
                        d = child.get("data", {})
                        title = d.get("title", "")
                        selftext = d.get("selftext", "")[:300]
                        coin_tags = _extract_coin_tags(f"{title} {selftext}")

                        articles.append({
                            "title": title,
                            "summary": selftext,
                            "url": f"https://reddit.com{d.get('permalink', '')}",
                            "source": f"r/{sub}",
                            "source_type": "reddit",
                            "published": "",
                            "published_ts": d.get("created_utc", time.time()),
                            "coin_tags": coin_tags,
                            "ups": d.get("ups", 0),
                            "num_comments": d.get("num_comments", 0),
                            "sentiment_score": 0,
                            "sentiment_label": "pending",
                        })
                except Exception as exc:
                    logger.warning("Error fetching r/%s: %s", sub, exc)

    except Exception as exc:
        logger.error("Reddit scanner error: %s", exc)

    return articles


async def _fetch_cryptopanic() -> list[dict[str, Any]]:
    """Fetch from CryptoPanic free API."""
    articles = []
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://cryptopanic.com/api/free/v1/posts/",
                params={"public": "true"},
            )
            if resp.status_code != 200:
                return []

            for item in resp.json().get("results", [])[:30]:
                title = item.get("title", "")
                votes = item.get("votes", {})
                coin_tags = _extract_coin_tags(title)

                # Also tag from CryptoPanic's currency data
                for curr in item.get("currencies", []):
                    code = curr.get("code", "").lower()
                    if code in COIN_ALIASES:
                        coin_tags.append(COIN_ALIASES[code])
                coin_tags = list(set(coin_tags))

                articles.append({
                    "title": title,
                    "summary": "",
                    "url": item.get("url", ""),
                    "source": item.get("source", {}).get("title", "CryptoPanic"),
                    "source_type": "cryptopanic",
                    "published": item.get("published_at", ""),
                    "published_ts": time.time(),
                    "coin_tags": coin_tags,
                    "positive_votes": votes.get("positive", 0),
                    "negative_votes": votes.get("negative", 0),
                    "sentiment_score": 0,
                    "sentiment_label": "pending",
                })
    except Exception as exc:
        logger.warning("CryptoPanic scanner error: %s", exc)

    return articles


async def scan_all_sources() -> list[dict[str, Any]]:
    """Scan all news sources concurrently. Called by the scheduler every 15 min."""
    global _articles, _last_scan

    logger.info("Starting news scan across all sources...")

    # Fetch all sources concurrently
    tasks = []
    for source, url in RSS_FEEDS.items():
        tasks.append(_fetch_rss_feed(source, url))
    tasks.append(_fetch_reddit_posts())
    tasks.append(_fetch_cryptopanic())

    results = await asyncio.gather(*tasks, return_exceptions=True)

    new_articles = []
    for result in results:
        if isinstance(result, list):
            new_articles.extend(result)
        elif isinstance(result, Exception):
            logger.warning("Source scan error: %s", result)

    # Deduplicate by URL
    seen_urls = set()
    deduped = []
    for article in new_articles:
        url = article.get("url", "")
        if url and url not in seen_urls:
            seen_urls.add(url)
            deduped.append(article)

    # Sort by published timestamp (newest first)
    deduped.sort(key=lambda a: a.get("published_ts", 0), reverse=True)

    # Keep last 500 articles
    _articles = deduped[:500]
    _last_scan = time.time()

    logger.info("News scan complete: %d articles from %d sources", len(_articles), len(RSS_FEEDS) + 2)

    # Auto-ingest new articles into RAG index
    try:
        from services.rag import ingest_news_article
        for article in deduped[:50]:  # Index top 50 newest
            try:
                await ingest_news_article(article)
            except Exception:
                pass
    except Exception as e:
        logger.warning("RAG news ingestion error: %s", e)

    return _articles


def get_articles(coin_id: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    """Get cached articles, optionally filtered by coin."""
    if coin_id:
        filtered = [a for a in _articles if coin_id in a.get("coin_tags", [])]
        return filtered[:limit]
    return _articles[:limit]


def get_last_scan_time() -> float:
    """Return epoch timestamp of the last scan."""
    return _last_scan


def get_article_count() -> int:
    """Total articles in the store."""
    return len(_articles)
