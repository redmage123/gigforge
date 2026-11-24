"""DCA (Dollar-Cost Averaging) backtester using historical CoinGecko prices.

Buys are scheduled on real calendar intervals from the first day of the period (every day, every
7 days, or the same day each month), whatever the spacing of the price data: CoinGecko returns
hourly points for short periods and daily points beyond 90 days. Each buy uses the first price at
or after its scheduled time. The lump-sum comparison invests the same total on the first day.
"""

import bisect
import calendar
from datetime import datetime, timedelta, timezone

from services.coingecko import get_market_chart

FREQUENCIES = ("daily", "weekly", "monthly")
MAX_DAYS = 365  # CoinGecko's free API serves at most one year of history


class DcaError(Exception):
    pass


def _add_months(dt: datetime, months: int) -> datetime:
    m = dt.month - 1 + months
    year, month = dt.year + m // 12, m % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])  # Jan 31 + 1 month -> Feb 28/29
    return dt.replace(year=year, month=month, day=day)


def schedule(start_ms: int, end_ms: int, frequency: str) -> list[int]:
    """Scheduled buy times (epoch ms) from start to end inclusive, on calendar intervals."""
    start = datetime.fromtimestamp(start_ms / 1000, tz=timezone.utc)
    out, k = [], 0
    while True:
        if frequency == "monthly":
            t = _add_months(start, k)
        else:
            t = start + timedelta(days=k * (1 if frequency == "daily" else 7))
        ms = int(t.timestamp() * 1000)
        if ms > end_ms:
            return out
        out.append(ms)
        k += 1


def _day(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def simulate(prices: list, frequency: str, amount: float) -> dict:
    """Backtest on [[ts_ms, price], ...] (pure). Raises DcaError when there is nothing to work with."""
    pts = sorted((int(ts), float(p)) for ts, p in prices if p and float(p) > 0)
    if len(pts) < 2:
        raise DcaError("Not enough price history for this period")
    times = [ts for ts, _ in pts]

    buys = []  # (index into pts, coins bought)
    last_idx = -1
    for t in schedule(times[0], times[-1], frequency):
        i = bisect.bisect_left(times, t)
        if i >= len(pts) or i == last_idx:  # data gap: never buy twice at the same point
            continue
        buys.append((i, amount / pts[i][1]))
        last_idx = i
    if not buys:
        raise DcaError("No buy dates fall inside the price history")

    total_invested = amount * len(buys)
    total_coins = sum(c for _, c in buys)
    first_price, final_price = pts[0][1], pts[-1][1]
    lump_coins = total_invested / first_price

    # One chart point per day (the day's last price): DCA holdings vs the lump sum, both at market value
    chart, b, coins, invested = [], 0, 0.0, 0.0
    for j, (ts, price) in enumerate(pts):
        while b < len(buys) and buys[b][0] <= j:
            coins += buys[b][1]
            invested += amount
            b += 1
        if j + 1 < len(pts) and _day(pts[j + 1][0]) == _day(ts):
            continue
        chart.append({
            "date": _day(ts), "timestamp": ts, "invested": round(invested, 2),
            "value": round(coins * price, 2), "lump_sum_value": round(lump_coins * price, 2),
        })

    current_value = total_coins * final_price
    lump_sum_value = lump_coins * final_price
    return {
        "frequency": frequency,
        "amount_per_buy": amount,
        "num_buys": len(buys),
        "first_buy_date": _day(pts[buys[0][0]][0]),
        "last_buy_date": _day(pts[buys[-1][0]][0]),
        "total_invested": round(total_invested, 2),
        "total_coins": round(total_coins, 8),
        "current_value": round(current_value, 2),
        "avg_buy_price": round(total_invested / total_coins, 2),
        "current_price": round(final_price, 2),
        "pnl": round(current_value - total_invested, 2),
        "roi_percent": round((current_value - total_invested) / total_invested * 100, 2),
        "lump_sum_value": round(lump_sum_value, 2),
        "lump_sum_roi": round((lump_sum_value - total_invested) / total_invested * 100, 2),
        "chart_data": chart,
    }


async def backtest_dca(coin_id: str, days: int = 365, frequency: str = "weekly",
                       amount: float = 100) -> dict:
    """Backtest a DCA strategy for a CoinGecko coin id over the last `days` days."""
    if frequency not in FREQUENCIES:
        raise DcaError(f"Frequency must be one of: {', '.join(FREQUENCIES)}")
    if not 1 <= days <= MAX_DAYS:
        raise DcaError(f"Period must be between 1 and {MAX_DAYS} days (the free price history limit)")
    if amount <= 0:
        raise DcaError("Amount must be greater than zero")
    data = await get_market_chart(coin_id, days)
    return {"coin_id": coin_id, "days": days, **simulate(data.get("prices", []), frequency, amount)}
