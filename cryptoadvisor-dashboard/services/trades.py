"""Trade tracking and P&L calculation."""

import time
import uuid
from services.user_data import load_user_data, save_user_data
from services.binance_prices import get_usd_prices
from services.coingecko import get_prices


def get_trades(username: str) -> list[dict]:
    return load_user_data(username, "trades")


def add_trade(username: str, coin_id: str, side: str, price: float,
              quantity: float, date: str = "", fee: float = 0) -> dict:
    trades = get_trades(username)
    entry = {
        "id": str(uuid.uuid4())[:8],
        "coin_id": coin_id,
        "side": side,  # "buy" or "sell"
        "price": price,
        "quantity": quantity,
        "date": date or time.strftime("%Y-%m-%d"),
        "fee": fee,
        "created_at": time.time(),
    }
    trades.append(entry)
    save_user_data(username, "trades", trades)
    return entry


def remove_trade(username: str, trade_id: str) -> bool:
    trades = get_trades(username)
    trades = [t for t in trades if t["id"] != trade_id]
    save_user_data(username, "trades", trades)
    return True


async def calculate_pnl(username: str) -> list[dict]:
    """Calculate P&L per position using current prices."""
    trades = get_trades(username)
    if not trades:
        return []

    # Aggregate positions
    positions: dict[str, dict] = {}
    for t in trades:
        coin = t["coin_id"]
        if coin not in positions:
            positions[coin] = {"coin_id": coin, "total_qty": 0, "bought_qty": 0, "total_cost": 0,
                               "total_fees": 0, "sells": 0}
        if t["side"] == "buy":
            positions[coin]["total_qty"] += t["quantity"]
            positions[coin]["bought_qty"] += t["quantity"]
            positions[coin]["total_cost"] += t["price"] * t["quantity"]
            positions[coin]["total_fees"] += t.get("fee", 0)
        elif t["side"] == "sell":
            positions[coin]["total_qty"] -= t["quantity"]
            positions[coin]["sells"] += t["price"] * t["quantity"]

    # Current prices: Binance first (one cached call), CoinGecko for anything Binance lacks
    coin_ids = tuple(positions.keys())
    try:
        prices = await get_usd_prices(coin_ids)
    except Exception:
        prices = {}
    missing = tuple(c for c in coin_ids if c not in prices)
    if missing:
        try:
            cg = await get_prices(missing)
            prices.update({c: v["usd"] for c, v in cg.items() if v.get("usd")})
        except Exception:
            pass

    results = []
    for coin, pos in positions.items():
        avg_buy = pos["total_cost"] / pos["bought_qty"] if pos["bought_qty"] else 0
        cost_basis = pos["total_cost"] - pos["sells"]
        current_price = prices.get(coin)
        if current_price:
            current_value = pos["total_qty"] * current_price
            unrealized_pnl = current_value - cost_basis
            roi = (unrealized_pnl / cost_basis) * 100 if cost_basis > 0 else 0
        else:
            # Unknown price: say so instead of valuing the position at 0 (which read as -100%)
            current_value = unrealized_pnl = roi = None

        results.append({
            "coin_id": coin,
            "quantity": round(pos["total_qty"], 8),
            "avg_buy_price": round(avg_buy, 6),
            "cost_basis": round(cost_basis, 2),
            "current_price": current_price,
            "current_value": None if current_value is None else round(current_value, 2),
            "unrealized_pnl": None if unrealized_pnl is None else round(unrealized_pnl, 2),
            "roi_percent": None if roi is None else round(roi, 2),
            "total_fees": round(pos["total_fees"], 2),
            "price_available": current_price is not None,
        })

    return sorted(results, key=lambda x: abs(x["current_value"] or x["cost_basis"]), reverse=True)
