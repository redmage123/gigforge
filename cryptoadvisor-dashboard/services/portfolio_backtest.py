"""Buy-and-hold backtester over daily candles from the market layer.

"What if I had bought X instead of Y on <date>" and an N-instrument comparison (each instrument on
its own plus an equal-weight basket). Entry is the open of the first daily bar on or after the start
date; values are marked at each daily close. No fees, slippage, dividends or rebalancing.
"""

import math
from datetime import date, datetime, timezone

import httpx

from services import market
from services.market import registry
from services.market.models import Instrument, make_id

# Binance serves at most 1000 daily klines per request; Yahoo daily history goes back much further
MAX_CRYPTO_DAYS = 1000
MAX_OTHER_DAYS = 3650


class BacktestError(Exception):
    """A request we can't run, with a message fit to show the user."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


async def resolve(ref: str) -> Instrument:
    """Instrument id ("crypto:BTC", "stock:AAPL"), legacy CoinGecko id ("bitcoin") or crypto ticker ("BTC")."""
    await registry.ensure_loaded()
    ref = (ref or "").strip()
    if not ref:
        raise BacktestError("Pick an instrument")
    if ":" in ref:
        inst = registry.get(ref)
    else:
        inst = registry.get(registry.from_coingecko_id(ref.lower()) or make_id("crypto", ref))
    if not inst:
        raise BacktestError(f"Unknown instrument: {ref}")
    if inst.currency != "USD":
        raise BacktestError(f"{inst.symbol} is priced in {inst.currency}; backtests support USD-priced instruments only")
    return inst


def _day(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


async def history(inst: Instrument, start: date, today: date | None = None) -> list[tuple[str, float, float]]:
    """(date, open, close) daily rows from `start` (or as far back as the provider goes) to today."""
    today = today or datetime.now(timezone.utc).date()
    span = (today - start).days + 1
    if span < 2:
        raise BacktestError("Start date must be in the past (at least one full day ago)")
    cap = MAX_CRYPTO_DAYS if inst.asset_class == "crypto" else MAX_OTHER_DAYS
    try:
        candles = await market.candles(inst.id, "1d", min(span + 5, cap))
    except LookupError:
        raise BacktestError(f"No daily price history is available for {inst.symbol}")
    except (httpx.HTTPError, RuntimeError, ValueError) as exc:
        raise BacktestError(f"Price history for {inst.symbol} is unavailable right now ({type(exc).__name__}). Try again shortly.", 502)
    first = start.isoformat()
    rows = [(_day(c.open_time), c.open, c.close) for c in candles if c.close > 0 and c.open > 0]
    rows = [r for r in rows if r[0] >= first]
    if len(rows) < 2:
        raise BacktestError(f"Not enough price history for {inst.symbol} since {first}")
    return rows


def stats(rows: list[tuple[str, float, float]], amount: float, periods_per_year: int) -> dict:
    """Buy `amount` at the first open, hold. Value series and summary statistics."""
    entry = rows[0][1]
    units = amount / entry
    series = [{"date": d, "price": c, "value": round(units * c, 2)} for d, _, c in rows]
    values = [units * c for _, _, c in rows]
    peak, mdd = amount, 0.0
    for v in values:
        peak = max(peak, v)
        mdd = max(mdd, (peak - v) / peak if peak else 0.0)
    final = values[-1]
    days = (date.fromisoformat(rows[-1][0]) - date.fromisoformat(rows[0][0])).days
    cagr = ((final / amount) ** (365.0 / days) - 1) * 100 if days >= 365 and final > 0 else None
    rets = [math.log(values[i] / values[i - 1]) for i in range(1, len(values)) if values[i - 1] > 0 and values[i] > 0]
    vol = None
    if len(rets) >= 2:
        mean = sum(rets) / len(rets)
        vol = math.sqrt(sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)) * math.sqrt(periods_per_year) * 100
    return {
        "start_date": rows[0][0], "end_date": rows[-1][0], "entry_price": entry, "end_price": rows[-1][2],
        "units": units, "invested": round(amount, 2), "final_value": round(final, 2),
        "profit_usd": round(final - amount, 2), "total_return_pct": round((final / amount - 1) * 100, 2),
        "max_drawdown_pct": round(mdd * 100, 2), "cagr_pct": round(cagr, 2) if cagr is not None else None,
        "volatility_pct": round(vol, 2) if vol is not None else None, "series": series,
    }


def _ppy(inst: Instrument) -> int:
    return 365 if inst.sessions == "24/7" else 252


def _label(inst: Instrument) -> dict:
    return {"instrument_id": inst.id, "symbol": inst.symbol, "name": inst.name, "asset_class": inst.asset_class}


def _notes(requested: str, effective: str) -> list[str]:
    notes = ["Buy and hold from the first daily open on or after the start date. Fees, slippage, "
             "dividends and taxes are not included."]
    if effective > requested:
        notes.append(f"Price history for the selection starts on {effective}, so the backtest starts there "
                     f"instead of {requested}.")
    return notes


def _validate(amount: float) -> float:
    amount = float(amount)
    if not math.isfinite(amount) or amount <= 0:
        raise BacktestError("Amount must be greater than zero")
    return amount


async def backtest_portfolio(original: str, alternative: str, start: date, amount: float,
                             today: date | None = None) -> dict:
    """What if `amount` had gone into `alternative` instead of `original` on `start`."""
    amount = _validate(amount)
    a, b = await resolve(original), await resolve(alternative)
    ra, rb = await history(a, start, today), await history(b, start, today)
    common = max(ra[0][0], rb[0][0])  # both legs start the same day for a fair comparison
    ra, rb = [r for r in ra if r[0] >= common], [r for r in rb if r[0] >= common]
    if len(ra) < 2 or len(rb) < 2:
        raise BacktestError("The two instruments do not have enough overlapping price history")
    sa, sb = {**_label(a), **stats(ra, amount, _ppy(a))}, {**_label(b), **stats(rb, amount, _ppy(b))}
    diff = sb["final_value"] - sa["final_value"]
    return {
        "start_date": start.isoformat(), "effective_start": common, "amount_usd": amount,
        "original": sa, "alternative": sb,
        "difference_usd": round(diff, 2),
        "difference_pct": round(diff / sa["final_value"] * 100, 2) if sa["final_value"] else None,
        "winner": b.id if diff > 0 else a.id if diff < 0 else None,
        "notes": _notes(start.isoformat(), common),
    }


async def compare(refs: list[str], start: date, amount: float, today: date | None = None) -> dict:
    """Each instrument bought with the full amount, plus an equal-weight basket (bought once, never rebalanced)."""
    amount = _validate(amount)
    insts: list[Instrument] = []
    for ref in refs:
        inst = await resolve(ref)
        if inst.id not in {i.id for i in insts}:
            insts.append(inst)
    if not 2 <= len(insts) <= 10:
        raise BacktestError("Pick between 2 and 10 different instruments to compare")
    rows = {i.id: await history(i, start, today) for i in insts}
    common = max(r[0][0] for r in rows.values())
    rows = {k: [r for r in v if r[0] >= common] for k, v in rows.items()}
    if any(len(v) < 2 for v in rows.values()):
        raise BacktestError("The selected instruments do not have enough overlapping price history")

    results = [{**_label(i), **stats(rows[i.id], amount, _ppy(i))} for i in insts]

    # Basket: amount / N in each, valued on every date any leg trades; a leg that is closed that day
    # (weekend for stocks) carries its last close forward.
    per = amount / len(insts)
    units = {i.id: per / rows[i.id][0][1] for i in insts}
    closes = {k: {d: c for d, _, c in v} for k, v in rows.items()}
    last: dict[str, float] = {k: v[0][1] for k, v in rows.items()}  # entry price until the first close
    basket_rows = []
    for d in sorted({d for v in closes.values() for d in v}):
        for k in closes:
            if d in closes[k]:
                last[k] = closes[k][d]
        nav = sum(units[k] * last[k] for k in units)
        basket_rows.append((d, nav / amount, nav / amount))  # price index starting near 1.0
    basket_rows[0] = (basket_rows[0][0], 1.0, basket_rows[0][2])  # bought at the entry opens: index 1.0
    ppy = 365 if all(i.sessions == "24/7" for i in insts) else 252
    basket = {"instrument_id": None, "symbol": "Equal weight", "name": f"Equal-weight basket of {len(insts)}",
              **stats(basket_rows, amount, ppy)}
    basket.pop("entry_price"), basket.pop("end_price"), basket.pop("units")

    best = max(results, key=lambda r: r["total_return_pct"])
    worst = min(results, key=lambda r: r["total_return_pct"])
    return {
        "start_date": start.isoformat(), "effective_start": common, "amount_usd": amount,
        "results": results, "portfolio": basket,
        "best_performer": best["instrument_id"], "worst_performer": worst["instrument_id"],
        "notes": _notes(start.isoformat(), common) + [
            "Each instrument row invests the full amount. The equal-weight basket splits it evenly "
            "and is not rebalanced."],
    }
