"""Trade Journal Analysis — Claude-powered trade review."""

from services.claude_cli import ask_claude


async def analyze_trades(trades: list) -> str:
    """Analyze trade history for patterns and improvement areas."""
    if not trades:
        return "No trade history to analyze."

    # Build a readable trade summary
    buys = [t for t in trades if t.get("side") == "buy"]
    sells = [t for t in trades if t.get("side") == "sell"]

    summary = f"Trade history: {len(trades)} total ({len(buys)} buys, {len(sells)} sells)\n"
    summary += "Recent trades:\n"
    for t in trades[-15:]:
        coin = t.get("coin_id", t.get("coin", "Unknown"))
        side = t.get("side", "unknown")
        price = t.get("price", 0)
        qty = t.get("quantity", 0)
        date = t.get("date", "N/A")
        fee = t.get("fee", 0)
        summary += f"- {date}: {side} {qty} {coin} @ ${price:,.2f} (fee: ${fee:.2f})\n"

    prompt = (
        f"You are a trading coach analyzing a crypto trader's journal.\n"
        f"{summary}\n"
        f"Provide:\n"
        f"1) Win rate estimate and average trade performance\n"
        f"2) Trading patterns — timing, position sizing, coin selection\n"
        f"3) Common mistakes or areas for improvement\n"
        f"4) Specific actionable suggestions\n"
        f"Be concise and constructive."
    )
    return await ask_claude(prompt)


async def analyze_single_trade(trade: dict, market_context: dict) -> str:
    """Post-trade analysis with market context."""
    coin = trade.get("coin_id", trade.get("coin", "Unknown"))
    side = trade.get("side", "unknown")
    price = trade.get("price", 0)
    qty = trade.get("quantity", 0)
    date = trade.get("date", "N/A")

    current_price = market_context.get(coin, {}).get("usd", 0)
    change = market_context.get(coin, {}).get("usd_24h_change", 0)

    prompt = (
        f"You are a trade analyst. Review this trade:\n"
        f"- {side.upper()} {qty} {coin} @ ${price:,.2f} on {date}\n"
        f"- Current price: ${current_price:,.2f} (24h change: {change:+.2f}%)\n\n"
        f"Provide:\n"
        f"1) Was the entry/exit well-timed?\n"
        f"2) P&L assessment\n"
        f"3) What the market was doing at the time\n"
        f"4) Lessons for future trades\n"
        f"Be concise."
    )
    return await ask_claude(prompt)


async def get_trade_suggestions(holdings: list, market_data: dict) -> str:
    """Suggest potential trades based on holdings and market conditions."""
    if not holdings and not market_data:
        return "Insufficient data for trade suggestions."

    summary = "Current holdings:\n"
    for h in holdings[:10]:
        name = h.get("Asset", h.get("coin", h.get("name", "Unknown")))
        value = h.get("Value", h.get("value", "N/A"))
        summary += f"- {name}: {value}\n"

    summary += "\nMarket snapshot:\n"
    for coin, data in list(market_data.items())[:10]:
        price = data.get("usd", 0)
        change = data.get("usd_24h_change", 0)
        summary += f"- {coin}: ${price:,.2f} ({change:+.2f}%)\n"

    prompt = (
        f"You are a crypto trading advisor. Based on current positions and market:\n"
        f"{summary}\n"
        f"Suggest 3-5 potential trades with:\n"
        f"1) Trade direction (buy/sell) and asset\n"
        f"2) Rationale\n"
        f"3) Suggested entry price range\n"
        f"4) Risk level (low/medium/high)\n\n"
        f"DISCLAIMER: This is AI-generated analysis, not financial advice. "
        f"Always do your own research before trading."
    )
    return await ask_claude(prompt)
