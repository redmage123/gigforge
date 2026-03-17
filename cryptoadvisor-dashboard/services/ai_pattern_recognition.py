"""AI-powered chart pattern recognition — uses Claude to analyze price data."""

import asyncio

from services.claude_cli import ask_claude


async def detect_patterns(coin: str, price_history: list[dict]) -> str:
    """Analyze recent price data for chart patterns.

    `price_history` should contain dicts with keys:
        date, open, high, low, close

    Last 30 data points are sent to Claude for analysis.
    """
    recent = price_history[-30:] if len(price_history) > 30 else price_history

    formatted_rows = "\n".join(
        f"  {p.get('date', '?')} | O:{p.get('open', '?')} H:{p.get('high', '?')} "
        f"L:{p.get('low', '?')} C:{p.get('close', '?')}"
        for p in recent
    )

    prompt = (
        f"Analyze this price data for {coin} and identify any chart patterns: "
        "head-and-shoulders, double top/bottom, ascending/descending triangle, "
        "cup-and-handle, wedges, flags. For each pattern found, state: "
        "pattern name, confidence (low/medium/high), implication (bullish/bearish), "
        "and target price if applicable.\n\n"
        f"Price data (Date | Open | High | Low | Close):\n{formatted_rows}"
    )
    return await ask_claude(prompt)


async def scan_all_coins(coins: list[str], price_data: dict[str, list[dict]] | None = None) -> list[dict]:
    """Run pattern detection on multiple coins in parallel.

    `price_data` maps coin name to its price_history list.
    Returns a list of {coin, analysis} dicts.
    """
    if price_data is None:
        price_data = {}

    async def _analyze(coin: str) -> dict:
        history = price_data.get(coin, [])
        if not history:
            return {"coin": coin, "analysis": "No price data available"}
        try:
            result = await detect_patterns(coin, history)
            return {"coin": coin, "analysis": result}
        except Exception as exc:
            return {"coin": coin, "analysis": f"Error: {exc}"}

    results = await asyncio.gather(*[_analyze(c) for c in coins])
    return list(results)
