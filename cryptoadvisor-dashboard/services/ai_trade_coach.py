"""AI post-trade coaching — analyzes trades for lessons and behavioral patterns."""

import json
from collections import Counter
from datetime import date

from services.claude_cli import ask_claude

EPS = 1e-12


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


def _day(value) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def compute_trade_stats(trades: list[dict], multipliers: dict[str, float] | None = None) -> dict:
    """Win rate, hold time and activity from a trade journal (trades in services.trades' schema).

    Each trade that reduces a position is a closed round trip, scored with the average-cost method
    (same as services.trades.replay) net of that trade's fee. Hold time runs from the date the
    position was opened to the closing trade's date. Pure; unit-tested.
    """
    mult = multipliers or {}
    ordered = sorted(trades, key=lambda t: (t.get("date", ""), t.get("created_at", 0)))
    pos: dict[str, dict] = {}
    closes: list[dict] = []
    for t in ordered:
        iid, qty, px = t["instrument_id"], float(t["quantity"]), float(t["price"])
        direction = 1 if t["side"] == "buy" else -1
        p = pos.setdefault(iid, {"qty": 0.0, "avg": 0.0, "opened": t.get("date")})
        q = p["qty"]
        if abs(q) < EPS or (q > 0) == (direction > 0):  # opening or adding
            if abs(q) < EPS:
                p["opened"] = t.get("date")
            new_q = q + direction * qty
            p["avg"] = (abs(q) * p["avg"] + qty * px) / abs(new_q) if abs(new_q) > EPS else 0.0
            p["qty"] = new_q
            continue
        closing = min(qty, abs(q))
        pnl = (px - p["avg"]) * closing * mult.get(iid, 1.0) * (1 if q > 0 else -1) - float(t.get("fee") or 0)
        opened, closed = _day(p["opened"]), _day(t.get("date"))
        closes.append({"id": t.get("id"), "instrument_id": iid, "pnl": pnl,
                       "hold_days": (closed - opened).days if opened and closed else None})
        p["qty"] = q + direction * closing
        rest = qty - closing
        if abs(p["qty"]) < EPS:
            p["qty"], p["avg"] = 0.0, 0.0
        if rest > EPS:  # flipped to the other side
            p["qty"], p["avg"], p["opened"] = direction * rest, px, t.get("date")

    wins = [c["pnl"] for c in closes if c["pnl"] > 0]
    losses = [c["pnl"] for c in closes if c["pnl"] <= 0]
    holds = [c["hold_days"] for c in closes if c["hold_days"] is not None]
    days = [d for d in (_day(t.get("date")) for t in ordered) if d]
    span_weeks = max(((max(days) - min(days)).days + 1) / 7, 1) if days else None
    counts = Counter(t["instrument_id"] for t in ordered)
    top = counts.most_common(1)
    return {
        "total_trades": len(ordered),
        "buys": sum(1 for t in ordered if t["side"] == "buy"),
        "sells": sum(1 for t in ordered if t["side"] != "buy"),
        "instruments": len(counts),
        "closed_trades": len(closes),
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": round(100 * len(wins) / len(closes), 1) if closes else None,
        "avg_win": round(sum(wins) / len(wins), 2) if wins else None,
        "avg_loss": round(sum(losses) / len(losses), 2) if losses else None,
        "realized_pnl": round(sum(c["pnl"] for c in closes), 2),
        "total_fees": round(sum(float(t.get("fee") or 0) for t in ordered), 2),
        "avg_hold_days": round(sum(holds) / len(holds), 1) if holds else None,
        "trades_per_week": round(len(ordered) / span_weeks, 1) if span_weeks else None,
        "most_traded": {"instrument_id": top[0][0], "trades": top[0][1]} if top else None,
        "first_date": min(days).isoformat() if days else None,
        "last_date": max(days).isoformat() if days else None,
        "trade_pnl": {c["id"]: round(c["pnl"], 2) for c in closes if c["id"]},
    }


async def get_trading_insights(trades: list[dict], stats: dict | None = None) -> str:
    """Review a list of trades for behavioral patterns.

    Looks for: revenge trading, FOMO buying, panic selling, overtrading.
    """
    if not trades:
        return "No trades provided for analysis."

    stats = stats or compute_trade_stats(trades)
    pnl_by_id = stats.get("trade_pnl", {})
    ordered = sorted(trades, key=lambda t: (t.get("date", ""), t.get("created_at", 0)))
    # Summarize trades for Claude (keep payload manageable)
    summary_lines: list[str] = []
    for t in ordered[-50:]:  # last 50 trades max
        pnl = pnl_by_id.get(t.get("id"))
        summary_lines.append(
            f"  {t.get('date', '?')} | {t.get('side', t.get('type', '?'))} "
            f"{t.get('instrument_id', t.get('coin', '?'))} | "
            f"price={t.get('price', '?')} qty={t.get('quantity', t.get('amount', '?'))} "
            f"realized_pnl={'n/a' if pnl is None else f'{pnl:.2f}'}"
        )
    trades_text = "\n".join(summary_lines)
    stats_text = json.dumps({k: v for k, v in stats.items() if k != "trade_pnl"}, default=str)

    prompt = (
        "You are a trading coach (instrument ids look like stock:AAPL, commodity:GC, crypto:BTC).\n"
        f"Computed statistics: {stats_text}\n\n"
        f"Review this trade history and identify behavioral patterns:\n{trades_text}\n\n"
        "Look specifically for:\n"
        "- Revenge trading (rapid trades after a loss)\n"
        "- FOMO buying (buying after large price spikes)\n"
        "- Panic selling (selling during sharp dips)\n"
        "- Overtrading (excessive frequency)\n\n"
        "Provide specific examples from the data and actionable coaching advice."
    )
    return await ask_claude(prompt)
