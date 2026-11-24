"""AI-powered chart pattern recognition — uses Claude to analyze price data."""

import asyncio
import json
import logging

from services.claude_cli import ask_claude

logger = logging.getLogger(__name__)

CONFIDENCE_LEVELS = ("low", "medium", "high")


async def detect_patterns(coin: str, price_history: list[dict]) -> str:
    """Analyze recent price data for chart patterns.

    `price_history` should contain dicts with keys:
        date, open, high, low, close

    Last 30 data points are sent to Claude for analysis. The reply is asked to be JSON
    (see `parse_patterns`); callers should still cope with free text.
    """
    recent = price_history[-30:] if len(price_history) > 30 else price_history

    formatted_rows = "\n".join(
        f"  {p.get('date', '?')} | O:{p.get('open', '?')} H:{p.get('high', '?')} "
        f"L:{p.get('low', '?')} C:{p.get('close', '?')}"
        for p in recent
    )

    prompt = (
        f"Analyze this daily price data for {coin} and identify any chart patterns: "
        "head-and-shoulders, double top/bottom, ascending/descending triangle, "
        "cup-and-handle, wedges, flags. For each pattern found, state: "
        "pattern name, confidence (low/medium/high), implication (bullish/bearish/neutral), "
        "target price if applicable, and a one-sentence description.\n\n"
        "Reply with ONLY valid JSON in this shape, no other text:\n"
        '{"summary": "<2-3 sentences on the overall picture>", "patterns": [{"name": "...", '
        '"confidence": "low|medium|high", "implication": "bullish|bearish|neutral", '
        '"target_price": <number or null>, "description": "..."}]}\n'
        "Use an empty patterns list if there are no clear patterns.\n\n"
        f"Price data (Date | Open | High | Low | Close):\n{formatted_rows}"
    )
    return await ask_claude(prompt)


def parse_patterns(text: str) -> dict:
    """Claude's reply -> {"summary": str, "patterns": [...]}. Free text becomes the summary."""
    start, end = text.find("{"), text.rfind("}") + 1
    data = None
    if start >= 0 and end > start:
        try:
            data = json.loads(text[start:end])
        except json.JSONDecodeError:
            data = None
    if not isinstance(data, dict):
        logger.info("pattern reply was not JSON; returning it as text")
        return {"summary": text.strip(), "patterns": []}
    patterns = []
    for p in data.get("patterns") or []:
        if not isinstance(p, dict) or not p.get("name"):
            continue
        conf = str(p.get("confidence") or "medium").lower()
        target = p.get("target_price")
        try:
            target = float(target) if target not in (None, "") else None
        except (TypeError, ValueError):
            target = None
        patterns.append({
            "name": str(p["name"]),
            "confidence": conf if conf in CONFIDENCE_LEVELS else "medium",
            "implication": str(p.get("implication") or "neutral").lower(),
            "target_price": target,
            "description": str(p.get("description") or ""),
        })
    return {"summary": str(data.get("summary") or ""), "patterns": patterns}


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
