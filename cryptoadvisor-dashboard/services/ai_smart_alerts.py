"""Smart Natural Language Alerts — Claude-powered alert parsing."""

import json
import logging

from services.claude_cli import ask_claude

logger = logging.getLogger(__name__)


async def parse_alert_condition(natural_language: str) -> dict:
    """Parse a natural language alert condition into structured JSON."""
    prompt = (
        "Parse this crypto alert condition into structured JSON. "
        "Return ONLY valid JSON with format: "
        '{"conditions": [{"coin": "...", "metric": "price|volume|gas|change_24h", '
        '"operator": "gt|lt|eq", "value": number}], '
        '"logic": "and|or", "description": "..."}. '
        f"Condition: {natural_language}"
    )

    response = await ask_claude(prompt)

    # Try to extract JSON from Claude's response
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        # Claude may wrap JSON in markdown code blocks
        for line in response.split("\n"):
            line = line.strip().strip("`")
            if line.startswith("{"):
                try:
                    return json.loads(line)
                except json.JSONDecodeError:
                    continue

        # Try to find JSON block in the full response
        start = response.find("{")
        end = response.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(response[start:end])
            except json.JSONDecodeError:
                pass

        # Fallback — return the raw text as a description
        logger.warning("Could not parse Claude response as JSON: %s", response[:200])
        return {
            "conditions": [],
            "logic": "and",
            "description": natural_language,
            "raw_response": response,
            "parse_error": True,
        }


async def check_smart_alert(alert: dict, market_data: dict) -> bool:
    """Evaluate parsed alert conditions against current market data."""
    conditions = alert.get("conditions", [])
    if not conditions:
        return False

    logic = alert.get("logic", "and")
    results = []

    for cond in conditions:
        coin = cond.get("coin", "").lower()
        metric = cond.get("metric", "price")
        operator = cond.get("operator", "gt")
        threshold = float(cond.get("value", 0))

        # Look up current value from market data
        coin_data = market_data.get(coin, {})
        metric_map = {
            "price": "usd",
            "volume": "usd_24h_vol",
            "change_24h": "usd_24h_change",
            "gas": "gas_price",
        }
        current = float(coin_data.get(metric_map.get(metric, metric), 0))

        if operator == "gt":
            results.append(current > threshold)
        elif operator == "lt":
            results.append(current < threshold)
        elif operator == "eq":
            results.append(abs(current - threshold) < threshold * 0.01)
        else:
            results.append(False)

    if logic == "or":
        return any(results)
    return all(results)


async def get_alert_suggestions(portfolio: list) -> str:
    """Suggest useful alerts based on user's holdings."""
    if not portfolio:
        return "No portfolio data available to suggest alerts."

    holdings_summary = "User holds:\n"
    for h in portfolio[:10]:
        name = h.get("Asset", h.get("coin", h.get("name", "Unknown")))
        value = h.get("Value", h.get("value", "N/A"))
        holdings_summary += f"- {name}: {value}\n"

    prompt = (
        f"You are a crypto alert advisor. Based on these holdings:\n"
        f"{holdings_summary}\n"
        f"Suggest 5 smart alerts the user should set up. For each, provide:\n"
        f"1) The alert in natural language\n"
        f"2) Why it matters for their portfolio\n"
        f"Include price alerts, volatility warnings, and whale movement alerts. Be concise."
    )
    return await ask_claude(prompt)
