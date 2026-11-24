"""Tax reporting: realized gains with FIFO/LIFO lot matching, longs and shorts.

Trades are replayed in date order across the whole history, so a sale's cost basis comes from the
buys that preceded it, even in earlier years. The `year` filter applies only to which realized
events are reported (by the date the position was closed).

  * a buy covers open short lots first, the remainder opens a long lot;
  * a sell closes open long lots first, the remainder opens a short lot (proceeds fixed at the sell).

Like the trades service (services/trades.py), each portfolio is replayed on its own and prices are
scaled by the instrument's contract multiplier, so over a fully closed history the net realized
gain here equals the realized P&L there. Fees are spread per unit: buy fees add to cost, sell fees
reduce proceeds.
"""

import csv
import io
from datetime import date as _date

METHODS = ("fifo", "lifo")
_EPS = 1e-9


def _days(start: str, end: str) -> int | None:
    try:
        return (_date.fromisoformat(end[:10]) - _date.fromisoformat(start[:10])).days
    except (TypeError, ValueError):
        return None


def calculate_tax_report(trades: list[dict], method: str = "fifo", year: int | None = None,
                         multipliers: dict[str, float] | None = None) -> dict:
    """Realized gains from trades ({instrument_id|coin_id, side, quantity, price, fee, date, portfolio_id})."""
    if method not in METHODS:
        raise ValueError(f"method must be one of {', '.join(METHODS)}")
    mult = multipliers or {}

    # (portfolio, instrument) -> {"long": [...], "short": [...]}, each list oldest first
    books: dict[tuple, dict[str, list[dict]]] = {}
    events = []
    skipped = 0  # trades that can't be replayed (no instrument, bad side, non-positive quantity or price)
    ordered = sorted(trades or [], key=lambda t: (str(t.get("date", "")), t.get("created_at", 0)))
    for t in ordered:
        iid = t.get("instrument_id") or t.get("coin_id")
        side = t.get("side")
        try:
            qty, price, fee = float(t.get("quantity") or 0), float(t.get("price") or 0), float(t.get("fee") or 0)
        except (TypeError, ValueError):
            qty = price = 0.0
        if not iid or side not in ("buy", "sell") or qty <= 0 or price <= 0:
            skipped += 1
            continue
        date = str(t.get("date", ""))
        m = float(mult.get(iid, 1.0) or 1.0)
        book = books.setdefault((t.get("portfolio_id"), iid), {"long": [], "short": []})
        # Per-unit value of this trade, fee included: cost of a buy, proceeds of a sell
        unit = price * m + fee / qty if side == "buy" else price * m - fee / qty
        closing, opening = ("short", "long") if side == "buy" else ("long", "short")
        queue = book[closing]
        remaining = qty
        reported = year is None or date.startswith(str(year))
        while remaining > _EPS and queue:
            lot = queue[0] if method == "fifo" else queue[-1]
            matched = min(remaining, lot["qty"])
            if closing == "long":
                cost_basis, proceeds = matched * lot["unit"], matched * unit
                buy_date, sell_date = lot["date"], date
            else:  # covering a short: proceeds came at the opening sell, cost is this buy
                cost_basis, proceeds = matched * unit, matched * lot["unit"]
                buy_date, sell_date = date, lot["date"]
            if reported:
                events.append({
                    "coin_id": iid,
                    "symbol": iid.split(":", 1)[-1],
                    "type": closing,
                    "sell_date": sell_date,
                    "buy_date": buy_date,
                    "open_date": lot["date"],
                    "close_date": date,
                    "holding_days": _days(lot["date"], date),
                    "quantity": round(matched, 8),
                    "cost_basis": round(cost_basis, 2),
                    "proceeds": round(proceeds, 2),
                    "gain_loss": round(proceeds - cost_basis, 2),
                    "method": method,
                })
            lot["qty"] -= matched
            remaining -= matched
            if lot["qty"] <= _EPS:
                queue.pop(0 if method == "fifo" else -1)
        if remaining > _EPS:
            book[opening].append({"qty": remaining, "unit": unit, "date": date})

    total_gains = sum(e["gain_loss"] for e in events if e["gain_loss"] >= 0)
    total_losses = sum(-e["gain_loss"] for e in events if e["gain_loss"] < 0)
    open_short = sum(lot["qty"] for b in books.values() for lot in b["short"])
    return {
        "events": events,
        "summary": {
            "total_gains": round(total_gains, 2),
            "total_losses": round(total_losses, 2),
            "net": round(total_gains - total_losses, 2),
            "proceeds": round(sum(e["proceeds"] for e in events), 2),
            "cost_basis": round(sum(e["cost_basis"] for e in events), 2),
            "count": len(events),
            "short_count": sum(1 for e in events if e["type"] == "short"),
            "open_short_quantity": round(open_short, 8),
            "skipped_trades": skipped,
        },
        "method": method,
        "year": year,
    }


CSV_FIELDS = ["coin_id", "sell_date", "buy_date", "quantity", "cost_basis", "proceeds", "gain_loss", "method",
              "type", "open_date", "close_date", "holding_days"]


def export_csv(report: dict) -> str:
    """A tax report as CSV text."""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_FIELDS, extrasaction="ignore")
    writer.writeheader()
    for event in report["events"]:
        writer.writerow(event)
    return output.getvalue()
