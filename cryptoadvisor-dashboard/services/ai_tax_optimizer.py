"""Tax Optimization — Claude-powered tax strategy analysis."""

from services.claude_cli import ask_claude


async def find_tax_loss_harvesting(holdings: list, trades: list) -> str:
    """Identify tax-loss harvesting opportunities."""
    if not holdings:
        return "No holdings data available for tax-loss analysis."

    # Summarize holdings with cost basis info
    holdings_summary = "Current holdings:\n"
    for h in holdings[:15]:
        coin = h.get("Asset", h.get("coin", h.get("name", "Unknown")))
        value = h.get("Value", h.get("value", "N/A"))
        cost_basis = h.get("cost_basis", h.get("avg_buy_price", "N/A"))
        holdings_summary += f"- {coin}: current value {value}, cost basis {cost_basis}\n"

    # Summarize recent trades for gain/loss context
    trades_summary = "Recent trades:\n"
    for t in trades[-10:]:
        coin = t.get("coin_id", t.get("coin", "Unknown"))
        side = t.get("side", "unknown")
        price = t.get("price", 0)
        qty = t.get("quantity", 0)
        date = t.get("date", "N/A")
        trades_summary += f"- {date}: {side} {qty} {coin} @ ${price:,.2f}\n"

    prompt = (
        f"You are a crypto tax optimization specialist. Analyze for tax-loss harvesting:\n\n"
        f"{holdings_summary}\n{trades_summary}\n"
        f"Identify:\n"
        f"1) Positions currently at a loss that could be sold to offset gains\n"
        f"2) Wash sale rule considerations (30-day rule)\n"
        f"3) Timing suggestions — end of year vs. strategic harvesting\n"
        f"4) Estimated tax savings potential\n\n"
        f"DISCLAIMER: This is AI analysis, not tax advice. Consult a tax professional."
    )
    return await ask_claude(prompt)


async def optimize_tax_strategy(tax_report: dict, holdings: list) -> str:
    """Review tax report and suggest optimization strategies."""
    # Format tax report summary
    report_summary = "Tax report summary:\n"
    short_term = tax_report.get("short_term_gains", 0)
    long_term = tax_report.get("long_term_gains", 0)
    total_gains = tax_report.get("total_gains", 0)
    total_losses = tax_report.get("total_losses", 0)
    report_summary += f"- Short-term gains: ${short_term:,.2f}\n"
    report_summary += f"- Long-term gains: ${long_term:,.2f}\n"
    report_summary += f"- Total gains: ${total_gains:,.2f}\n"
    report_summary += f"- Total losses: ${total_losses:,.2f}\n"
    report_summary += f"- Net: ${total_gains + total_losses:,.2f}\n"

    holdings_summary = "Current holdings:\n"
    for h in holdings[:10]:
        coin = h.get("Asset", h.get("coin", "Unknown"))
        value = h.get("Value", h.get("value", "N/A"))
        holdings_summary += f"- {coin}: {value}\n"

    prompt = (
        f"You are a crypto tax strategist. Review this tax situation:\n\n"
        f"{report_summary}\n{holdings_summary}\n"
        f"Suggest strategies to minimize tax liability:\n"
        f"1) Short-term vs long-term holding period optimization\n"
        f"2) Loss harvesting opportunities\n"
        f"3) Charitable donation strategies (if applicable)\n"
        f"4) Timing strategies for remaining trades this year\n"
        f"5) Estimated tax impact under current strategy\n\n"
        f"DISCLAIMER: This is AI analysis, not tax advice. Consult a tax professional."
    )
    return await ask_claude(prompt)


async def estimate_tax_impact(proposed_trade: dict, existing_trades: list) -> str:
    """Estimate tax impact of a proposed trade before execution."""
    coin = proposed_trade.get("coin", proposed_trade.get("coin_id", "Unknown"))
    side = proposed_trade.get("side", "sell")
    quantity = proposed_trade.get("quantity", 0)
    price = proposed_trade.get("price", 0)

    # Calculate existing cost basis from trade history
    buy_trades = [t for t in existing_trades
                  if t.get("coin_id", t.get("coin", "")) == coin
                  and t.get("side") == "buy"]
    avg_cost = 0
    if buy_trades:
        total_cost = sum(t.get("price", 0) * t.get("quantity", 0) for t in buy_trades)
        total_qty = sum(t.get("quantity", 0) for t in buy_trades)
        avg_cost = total_cost / total_qty if total_qty else 0

    trade_value = quantity * price
    estimated_gain = trade_value - (quantity * avg_cost) if avg_cost else 0

    prompt = (
        f"You are a crypto tax calculator. Estimate the tax impact of this trade:\n"
        f"- Proposed: {side} {quantity} {coin} @ ${price:,.2f} (total: ${trade_value:,.2f})\n"
        f"- Average cost basis: ${avg_cost:,.2f}\n"
        f"- Estimated gain/loss: ${estimated_gain:,.2f}\n\n"
        f"Provide:\n"
        f"1) Estimated tax liability (short-term vs long-term rates)\n"
        f"2) Net proceeds after estimated tax\n"
        f"3) Whether to execute now or wait for long-term treatment\n"
        f"4) Alternative approaches to reduce tax impact\n\n"
        f"DISCLAIMER: This is AI analysis, not tax advice. Consult a tax professional."
    )
    return await ask_claude(prompt)
