"""Tax reporting — realized gains calculation with FIFO/LIFO cost basis."""

import csv
import io
from services.user_data import load_user_data


def calculate_tax_report(username: str, method: str = "fifo", year: int = None) -> dict:
    """Calculate realized gains from trade history."""
    trades = load_user_data(username, "trades")
    if not trades:
        return {"events": [], "summary": {"total_gains": 0, "total_losses": 0, "net": 0}}

    # Filter by year if specified
    if year:
        trades = [t for t in trades if t.get("date", "").startswith(str(year))]

    # Separate buys and sells per coin
    buys: dict[str, list] = {}
    sells: dict[str, list] = {}
    for t in trades:
        coin = t["coin_id"]
        entry = {"price": t["price"], "quantity": t["quantity"], "date": t.get("date", ""), "fee": t.get("fee", 0)}
        if t["side"] == "buy":
            buys.setdefault(coin, []).append(entry)
        elif t["side"] == "sell":
            sells.setdefault(coin, []).append(entry)

    events = []
    total_gains = 0
    total_losses = 0

    for coin, sell_list in sells.items():
        buy_queue = list(buys.get(coin, []))
        if method == "lifo":
            buy_queue.reverse()

        for sell in sell_list:
            remaining = sell["quantity"]
            while remaining > 0 and buy_queue:
                buy = buy_queue[0]
                matched = min(remaining, buy["quantity"])

                cost_basis = matched * buy["price"] + (buy["fee"] * matched / max(buy["quantity"], 0.0001))
                proceeds = matched * sell["price"] - (sell["fee"] * matched / max(sell["quantity"], 0.0001))
                gain = proceeds - cost_basis

                events.append({
                    "coin_id": coin,
                    "sell_date": sell["date"],
                    "buy_date": buy["date"],
                    "quantity": round(matched, 8),
                    "cost_basis": round(cost_basis, 2),
                    "proceeds": round(proceeds, 2),
                    "gain_loss": round(gain, 2),
                    "method": method,
                })

                if gain >= 0:
                    total_gains += gain
                else:
                    total_losses += abs(gain)

                buy["quantity"] -= matched
                remaining -= matched
                if buy["quantity"] <= 0.00000001:
                    buy_queue.pop(0)

    return {
        "events": events,
        "summary": {
            "total_gains": round(total_gains, 2),
            "total_losses": round(total_losses, 2),
            "net": round(total_gains - total_losses, 2),
        }
    }


def export_csv(username: str, method: str = "fifo", year: int = None) -> str:
    """Export tax report as CSV string."""
    report = calculate_tax_report(username, method, year)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "coin_id", "sell_date", "buy_date", "quantity",
        "cost_basis", "proceeds", "gain_loss", "method"
    ])
    writer.writeheader()
    for event in report["events"]:
        writer.writerow(event)
    return output.getvalue()
