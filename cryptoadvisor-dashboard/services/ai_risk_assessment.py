"""Risk Assessment Agent — Claude-powered portfolio risk analysis."""

import json
import logging

from services.claude_cli import ask_claude

logger = logging.getLogger(__name__)


async def full_risk_assessment(portfolio: dict) -> str:
    """Comprehensive risk report for the full portfolio."""
    holdings = portfolio.get("holdings", [])
    defi = portfolio.get("defi_positions", [])
    staking = portfolio.get("staking", [])
    exchanges = portfolio.get("exchanges", [])
    total_value = portfolio.get("total_value", 0)

    summary = f"Portfolio value: ${total_value:,.2f}\n\nHoldings:\n"
    for h in holdings[:15]:
        name = h.get("Asset", h.get("coin", "Unknown"))
        value = h.get("Value", h.get("value", "N/A"))
        alloc = h.get("Allocation", h.get("allocation", "N/A"))
        summary += f"- {name}: {value} ({alloc})\n"

    if defi:
        summary += "\nDeFi positions:\n"
        for p in defi[:5]:
            protocol = p.get("protocol", "Unknown")
            value = p.get("value", "N/A")
            summary += f"- {protocol}: {value}\n"

    if staking:
        summary += "\nStaking:\n"
        for s in staking[:5]:
            coin = s.get("coin", s.get("asset", "Unknown"))
            amount = s.get("amount", s.get("staked", "N/A"))
            summary += f"- {coin}: {amount}\n"

    if exchanges:
        summary += "\nExchange exposure:\n"
        for ex in exchanges[:5]:
            name = ex.get("name", "Unknown")
            balance = ex.get("balance", ex.get("value", "N/A"))
            summary += f"- {name}: {balance}\n"

    prompt = (
        f"You are a crypto risk assessment specialist. Analyze this portfolio:\n"
        f"{summary}\n"
        f"Produce a comprehensive risk report covering:\n"
        f"1) Concentration risk — over-exposure to single assets\n"
        f"2) Smart contract risk — per DeFi protocol\n"
        f"3) Counterparty risk — exchange exposure\n"
        f"4) Correlation risk — how correlated are the holdings\n"
        f"5) Liquidity risk — any illiquid positions\n"
        f"6) Regulatory risk — jurisdiction concerns\n\n"
        f"Include an overall risk score (1-10, where 10 is highest risk) "
        f"and specific recommendations to reduce risk."
    )
    return await ask_claude(prompt)


async def assess_position_risk(position: dict) -> str:
    """Risk analysis for a single position."""
    coin = position.get("coin", position.get("asset", "Unknown"))
    value = position.get("value", position.get("amount", "N/A"))
    protocol = position.get("protocol", "spot")
    entry_price = position.get("entry_price", position.get("price", "N/A"))
    leverage = position.get("leverage", 1)

    prompt = (
        f"You are a crypto risk analyst. Assess the risk of this position:\n"
        f"- Asset: {coin}\n"
        f"- Value: {value}\n"
        f"- Type: {protocol}\n"
        f"- Entry price: {entry_price}\n"
        f"- Leverage: {leverage}x\n\n"
        f"Evaluate: market risk, protocol risk, liquidation risk, "
        f"and recommend a position size relative to portfolio. Be concise."
    )
    return await ask_claude(prompt)


async def get_risk_score(portfolio: dict) -> dict:
    """Get a structured risk score as JSON."""
    holdings = portfolio.get("holdings", [])
    total_value = portfolio.get("total_value", 0)

    summary = f"Portfolio: ${total_value:,.2f} across {len(holdings)} assets.\n"
    for h in holdings[:10]:
        name = h.get("Asset", h.get("coin", "Unknown"))
        alloc = h.get("Allocation", h.get("allocation", "N/A"))
        summary += f"- {name}: {alloc}\n"

    prompt = (
        f"Analyze this crypto portfolio risk and return ONLY valid JSON:\n"
        f"{summary}\n"
        f"Return: {{\"overall_score\": <1-100>, \"risk_level\": \"low|medium|high|critical\", "
        f"\"top_risks\": [\"risk 1\", \"risk 2\", \"risk 3\"]}}"
    )

    response = await ask_claude(prompt)

    # Try to parse JSON from response
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        start = response.find("{")
        end = response.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(response[start:end])
            except json.JSONDecodeError:
                pass

        logger.warning("Could not parse risk score JSON: %s", response[:200])
        return {
            "overall_score": 50,
            "risk_level": "medium",
            "top_risks": ["Unable to parse AI risk assessment"],
            "raw_response": response,
        }
