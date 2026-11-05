"""Conversational AI portfolio builder — uses Claude for allocation advice."""

from services.claude_cli import ask_claude


async def build_portfolio(description: str, budget: float = 10000) -> str:
    """Ask Claude to build a multi-asset portfolio based on a natural-language description.

    Returns a formatted portfolio allocation table with rationale.
    """
    prompt = (
        "You are a multi-asset portfolio advisor for AssetAdvisor (US stocks, ETFs, commodity and Treasury futures, crypto). "
        "Build a portfolio based on this request: "
        f"'{description}'. Budget: ${budget:,.2f}. "
        "Return a specific allocation with: instrument (ticker and asset class), percentage allocation, dollar amount, "
        "and brief rationale for each pick. Include at least 5 positions, and only use asset classes the request allows "
        "(if it names none, diversify across stocks, bonds, commodities and crypto to match the stated risk). "
        "Format as a clear table. Add a risk disclaimer."
    )
    return await ask_claude(prompt)


async def optimize_existing(holdings: list[dict], goal: str) -> str:
    """Send current holdings and an optimization goal to Claude.

    `holdings` should be a list of dicts like:
        [{"coin": "BTC", "amount": 0.5, "value_usd": 35000}, ...]

    Returns Claude's optimization suggestions.
    """
    holdings_text = "\n".join(
        f"- {h.get('coin', '?')}: {h.get('amount', '?')} units (~${h.get('value_usd', 0):,.2f})"
        for h in holdings
    )
    prompt = (
        "You are a multi-asset portfolio optimizer. Here are the current holdings:\n"
        f"{holdings_text}\n\n"
        f"Goal: {goal}\n\n"
        "Suggest specific changes: what to sell, what to buy, and why. "
        "Include percentage rebalancing. Consider risk, diversification, and the stated goal. "
        "Add a risk disclaimer."
    )
    return await ask_claude(prompt)
