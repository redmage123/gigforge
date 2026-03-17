"""AI post-trade coaching — analyzes trades for lessons and behavioral patterns."""

import json

from services.claude_cli import ask_claude


async def post_mortem(trade: dict, market_data: dict) -> str:
    """Generate a post-mortem analysis for a single trade.

    `trade` should include: coin, type (buy/sell), entry_price, exit_price,
        amount, date, pnl, etc.
    `market_data` should include: price_at_entry, price_now, volume, trend.
    """
    trade_text = json.dumps(trade, indent=2, default=str)
    market_text = json.dumps(market_data, indent=2, default=str)

    prompt = (
        f"Post-mortem analysis for this trade:\n{trade_text}\n\n"
        f"Market context:\n{market_text}\n\n"
        "Provide:\n"
        "1) What went right\n"
        "2) What went wrong\n"
        "3) Was the timing good?\n"
        "4) What would you do differently?\n"
        "5) Key lesson\n\n"
        "Be constructive and specific."
    )
    return await ask_claude(prompt)


async def get_trading_insights(trades: list[dict]) -> str:
    """Review a list of trades for behavioral patterns.

    Looks for: revenge trading, FOMO buying, panic selling, overtrading.
    """
    if not trades:
        return "No trades provided for analysis."

    # Summarize trades for Claude (keep payload manageable)
    summary_lines: list[str] = []
    for t in trades[-50:]:  # last 50 trades max
        summary_lines.append(
            f"  {t.get('date', '?')} | {t.get('type', '?')} {t.get('coin', '?')} | "
            f"price={t.get('price', '?')} amount={t.get('amount', '?')} "
            f"pnl={t.get('pnl', 'n/a')}"
        )
    trades_text = "\n".join(summary_lines)

    prompt = (
        f"Review this trade history and identify behavioral patterns:\n{trades_text}\n\n"
        "Look specifically for:\n"
        "- Revenge trading (rapid trades after a loss)\n"
        "- FOMO buying (buying after large price spikes)\n"
        "- Panic selling (selling during sharp dips)\n"
        "- Overtrading (excessive frequency)\n\n"
        "Provide specific examples from the data and actionable coaching advice."
    )
    return await ask_claude(prompt)
