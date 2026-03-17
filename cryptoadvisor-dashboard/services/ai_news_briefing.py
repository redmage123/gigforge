"""News Summarization & Market Briefing — Claude-powered briefings."""

from services.claude_cli import ask_claude


async def generate_daily_briefing(prices: dict, news: list, sentiment: dict) -> str:
    """Compile a concise daily market briefing."""
    # Format price data
    price_summary = "Market prices:\n"
    for coin, data in list(prices.items())[:10]:
        p = data.get("usd", 0)
        change = data.get("usd_24h_change", 0)
        vol = data.get("usd_24h_vol", 0)
        price_summary += f"- {coin}: ${p:,.2f} ({change:+.2f}%), vol ${vol:,.0f}\n"

    # Format news headlines
    news_summary = "Top headlines:\n"
    for article in news[:8]:
        title = article.get("title", "No title")
        source = article.get("source", "Unknown")
        news_summary += f"- [{source}] {title}\n"

    # Format sentiment
    sentiment_summary = "Sentiment signals:\n"
    if isinstance(sentiment, dict):
        for key, val in list(sentiment.items())[:5]:
            sentiment_summary += f"- {key}: {val}\n"

    prompt = (
        f"You are a crypto market analyst producing a daily briefing.\n\n"
        f"{price_summary}\n{news_summary}\n{sentiment_summary}\n"
        f"Produce a concise daily briefing covering:\n"
        f"1) Key movers — biggest gainers/losers and why\n"
        f"2) Important news — what matters most today\n"
        f"3) Market mood — overall sentiment and fear/greed\n"
        f"4) What to watch — upcoming events or levels to monitor\n"
        f"Keep it under 300 words."
    )
    return await ask_claude(prompt)


async def summarize_news(articles: list) -> str:
    """Summarize the top impactful news stories."""
    if not articles:
        return "No news articles available to summarize."

    articles_text = ""
    for i, article in enumerate(articles[:10], 1):
        title = article.get("title", "No title")
        source = article.get("source", "Unknown")
        published = article.get("published", "")
        articles_text += f"{i}. [{source}] {title} ({published})\n"

    prompt = (
        f"You are a crypto news analyst. Here are recent headlines:\n"
        f"{articles_text}\n"
        f"Summarize the top 5 most impactful stories. For each:\n"
        f"1) One-sentence summary\n"
        f"2) Market impact (bullish/bearish/neutral)\n"
        f"3) Which coins are affected\n"
        f"Be concise."
    )
    return await ask_claude(prompt)


async def get_market_commentary(coin: str, price_data: dict, news: list) -> str:
    """Coin-specific commentary combining price action with news."""
    price = price_data.get("usd", 0)
    change = price_data.get("usd_24h_change", 0)
    volume = price_data.get("usd_24h_vol", 0)
    market_cap = price_data.get("usd_market_cap", 0)

    # Filter news relevant to the coin
    relevant_news = ""
    coin_lower = coin.lower()
    for article in news[:15]:
        title = article.get("title", "")
        if coin_lower in title.lower():
            relevant_news += f"- {title}\n"
    if not relevant_news:
        relevant_news = "No coin-specific news found.\n"

    prompt = (
        f"You are a crypto analyst providing commentary on {coin}.\n"
        f"Price: ${price:,.2f}, 24h change: {change:+.2f}%, "
        f"volume: ${volume:,.0f}, market cap: ${market_cap:,.0f}\n\n"
        f"Related news:\n{relevant_news}\n"
        f"Provide a brief market commentary combining the price action "
        f"with the news context. Include outlook and key levels. Keep it under 200 words."
    )
    return await ask_claude(prompt)
