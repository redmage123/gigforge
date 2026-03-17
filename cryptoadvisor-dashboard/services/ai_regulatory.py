"""AI-powered regulatory news monitoring and risk assessment."""

from services.claude_cli import ask_claude


async def get_regulatory_briefing() -> str:
    """Ask Claude for a concise summary of recent crypto regulatory developments."""
    prompt = (
        "Provide a brief summary of the most recent and impactful cryptocurrency "
        "regulatory developments from SEC, CFTC, EU MiCA, and other major jurisdictions. "
        "Focus on: enforcement actions, new rules/proposals, court decisions, and their "
        "potential market impact. Be concise and factual."
    )
    return await ask_claude(prompt)


async def assess_regulatory_risk(holdings: list[dict]) -> str:
    """Assess regulatory risk for a portfolio.

    `holdings` should be a list of dicts like:
        [{"coin": "BTC", "amount": 0.5}, {"coin": "UNI", "amount": 100}, ...]
    """
    holdings_text = ", ".join(
        f"{h.get('coin', '?')} ({h.get('amount', '?')})" for h in holdings
    )
    prompt = (
        f"Assess the regulatory risk for this crypto portfolio: {holdings_text}. "
        "For each token, rate regulatory risk (low/medium/high) based on: "
        "SEC security classification risk, geographic restrictions, DeFi regulatory exposure. "
        "Provide overall portfolio regulatory risk score."
    )
    return await ask_claude(prompt)
