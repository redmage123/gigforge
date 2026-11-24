"""Tax reporting: realized gains with FIFO/LIFO lot matching.

Trades are replayed in date order across the whole history, so a sale's cost basis comes from the
buys that preceded it, even in earlier years. The `year` filter applies only to which realized
events (sales) are reported.
"""

import csv
import io

METHODS = ("fifo", "lifo")
_EPS = 1e-9


def calculate_tax_report(trades: list[dict], method: str = "fifo", year: int | None = None) -> dict:
    """Realized gains from trades ({instrument_id|coin_id, side, quantity, price, fee, date})."""
    if method not in METHODS:
        raise ValueError(f"method must be one of {', '.join(METHODS)}")

    lots: dict[str, list[dict]] = {}  # instrument -> open buy lots, oldest first
    events = []
    unmatched = 0.0  # sold quantity with no earlier buy on record (cost basis unknown)
    ordered = sorted(trades or [], key=lambda t: (str(t.get("date", "")), t.get("created_at", 0)))
    for t in ordered:
        iid = t.get("instrument_id") or t.get("coin_id")
        qty, price, fee = float(t.get("quantity") or 0), float(t.get("price") or 0), float(t.get("fee") or 0)
        if not iid or qty <= 0:
            continue
        date = str(t.get("date", ""))
        if t.get("side") == "buy":
            # Buy fees are part of the cost basis, spread per unit
            lots.setdefault(iid, []).append({"qty": qty, "unit_cost": price + fee / qty, "date": date})
            continue
        if t.get("side") != "sell":
            continue
        queue = lots.get(iid, [])
        remaining = qty
        reported = year is None or date.startswith(str(year))
        while remaining > _EPS and queue:
            lot = queue[0] if method == "fifo" else queue[-1]
            matched = min(remaining, lot["qty"])
            cost_basis = matched * lot["unit_cost"]
            proceeds = matched * price - fee * matched / qty  # sell fee reduces proceeds pro rata
            if reported:
                events.append({
                    "coin_id": iid,
                    "symbol": iid.split(":", 1)[-1],
                    "sell_date": date,
                    "buy_date": lot["date"],
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
        if remaining > _EPS and reported:
            unmatched += remaining

    total_gains = sum(e["gain_loss"] for e in events if e["gain_loss"] >= 0)
    total_losses = sum(-e["gain_loss"] for e in events if e["gain_loss"] < 0)
    return {
        "events": events,
        "summary": {
            "total_gains": round(total_gains, 2),
            "total_losses": round(total_losses, 2),
            "net": round(total_gains - total_losses, 2),
            "proceeds": round(sum(e["proceeds"] for e in events), 2),
            "cost_basis": round(sum(e["cost_basis"] for e in events), 2),
            "count": len(events),
            "unmatched_quantity": round(unmatched, 8),
        },
        "method": method,
        "year": year,
    }


def export_csv(report: dict) -> str:
    """A tax report as CSV text."""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "coin_id", "sell_date", "buy_date", "quantity",
        "cost_basis", "proceeds", "gain_loss", "method"
    ], extrasaction="ignore")
    writer.writeheader()
    for event in report["events"]:
        writer.writerow(event)
    return output.getvalue()
