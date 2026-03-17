"""AI Analysis Copilot — Claude-powered crypto analysis."""

from services.claude_cli import ask_claude


async def analyze_technical(coin: str, price_data: dict) -> str:
    """Technical analysis for a single coin."""
    price = price_data.get("usd", 0)
    change = price_data.get("usd_24h_change", 0)
    volume = price_data.get("usd_24h_vol", 0)
    market_cap = price_data.get("usd_market_cap", 0)

    prompt = (
        f"You are a crypto technical analyst. Analyze {coin}: "
        f"current price ${price:,.2f}, 24h change {change:+.2f}%, "
        f"volume ${volume:,.0f}, market cap ${market_cap:,.0f}. "
        f"Provide: 1) Short-term outlook (24-48h) 2) Key support/resistance levels "
        f"3) Trading signal (buy/sell/hold) 4) Confidence level. Be concise."
    )
    return await ask_claude(prompt)


async def analyze_portfolio(holdings: list) -> str:
    """Review portfolio allocation and suggest rebalancing."""
    if not holdings:
        return "No holdings found to analyze."

    summary = "Current portfolio:\n"
    for h in holdings:
        name = h.get("Asset", h.get("coin", h.get("name", "Unknown")))
        value = h.get("Value", h.get("value", "N/A"))
        alloc = h.get("Allocation", h.get("allocation", "N/A"))
        summary += f"- {name}: value {value}, allocation {alloc}\n"

    prompt = (
        f"You are a crypto portfolio manager. Review this portfolio and provide:\n"
        f"{summary}\n"
        f"1) Allocation assessment — is it well balanced?\n"
        f"2) Concentration risk — any over-exposed positions?\n"
        f"3) Diversification gaps — missing sectors or asset types?\n"
        f"4) Rebalancing suggestions with target percentages.\n"
        f"Be concise and actionable."
    )
    return await ask_claude(prompt)


async def analyze_whale_activity(transactions: list) -> str:
    """Analyze whale transactions for market direction signals."""
    if not transactions:
        return "No whale transactions to analyze."

    summary = "Recent whale transactions:\n"
    for tx in transactions[:10]:
        coin = tx.get("coin", tx.get("symbol", "Unknown"))
        amount = tx.get("amount", tx.get("value", "N/A"))
        direction = tx.get("type", tx.get("direction", "transfer"))
        to_label = tx.get("to_label", tx.get("to", "unknown"))
        summary += f"- {coin}: {direction} {amount} to {to_label}\n"

    prompt = (
        f"You are a crypto whale tracker analyst. Analyze these whale movements:\n"
        f"{summary}\n"
        f"What does this activity suggest for:\n"
        f"1) Short-term market direction\n"
        f"2) Accumulation or distribution patterns\n"
        f"3) Any coins to watch closely\n"
        f"Be concise."
    )
    return await ask_claude(prompt)


async def analyze_defi_positions(positions: list) -> str:
    """Assess DeFi position risk and yield optimization."""
    if not positions:
        return "No DeFi positions to analyze."

    summary = "Active DeFi positions:\n"
    for p in positions[:10]:
        protocol = p.get("protocol", "Unknown")
        pool = p.get("pool", p.get("pair", "N/A"))
        value = p.get("value", p.get("tvl", "N/A"))
        apy = p.get("apy", p.get("yield", "N/A"))
        summary += f"- {protocol} / {pool}: value {value}, APY {apy}\n"

    prompt = (
        f"You are a DeFi risk analyst. Assess these positions:\n"
        f"{summary}\n"
        f"Provide:\n"
        f"1) Protocol risk per position (smart contract, audit status)\n"
        f"2) Impermanent loss exposure\n"
        f"3) Yield sustainability assessment\n"
        f"4) Optimization suggestions — better yields for similar risk\n"
        f"Be concise."
    )
    return await ask_claude(prompt)


async def analyze_page_data(page_name: str, data: dict) -> str:
    """Generic page-context analyzer."""
    # Format data readably based on page context
    context_map = {
        "dashboard": "market overview and portfolio summary",
        "portfolio": "portfolio holdings and performance",
        "trades": "trade history and P&L",
        "defi": "DeFi positions and yields",
        "whales": "whale activity and large transactions",
        "sentiment": "market sentiment and social signals",
        "risk": "risk metrics and exposure analysis",
        "tax": "tax obligations and optimization",
        "staking": "staking positions and rewards",
        "nfts": "NFT holdings and floor prices",
    }
    context = context_map.get(page_name, f"the {page_name} page")

    # Build a readable summary of the data
    summary_parts = []
    for key, val in data.items():
        if isinstance(val, list) and val:
            summary_parts.append(f"{key}: {len(val)} items")
            # Show first few items briefly
            for item in val[:3]:
                if isinstance(item, dict):
                    brief = ", ".join(f"{k}={v}" for k, v in list(item.items())[:4])
                    summary_parts.append(f"  - {brief}")
        elif isinstance(val, dict):
            brief = ", ".join(f"{k}={v}" for k, v in list(val.items())[:5])
            summary_parts.append(f"{key}: {brief}")
        else:
            summary_parts.append(f"{key}: {val}")

    data_text = "\n".join(summary_parts) if summary_parts else "No data provided."

    prompt = (
        f"You are a crypto advisor analyzing {context}. "
        f"Here is the current data:\n{data_text}\n\n"
        f"Provide 3-5 key insights or actionable observations. Be concise."
    )
    return await ask_claude(prompt)
