"""Portfolio performance: daily NAV rebuilt from trades, cash entries and daily closes; time-weighted
return (TWR), money-weighted return, benchmark comparison, monthly returns.

NAV (net asset value) each day = cash + spot holdings at that day's close + open futures P&L.
  * Spot (stocks, ETFs, crypto, forex): buying moves cash into the holding; selling back.
  * Futures (commodity and bond classes, contract multipliers): no cash for the notional; realized
    P&L and fees move cash, open contracts add (close - avg) x qty x multiplier.
  * Cash entries: deposits/withdrawals are external flows; dividends/interest/fees are returns.

Funding: a portfolio with no recorded deposits is "auto-funded" — whenever trades would take cash
below zero, the shortfall counts as a deposit that day. That gives correct returns for a journal
that only records trades. Once deposits are recorded, cash can go negative (margin) as entered.

TWR chains daily returns r = NAV_t / (NAV_{t-1} + flow_t) - 1 (flows at the start of the day), so
deposits and withdrawals don't count as performance. Money-weighted return is the IRR of the flows.
"""

import math
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from services import cash as cash_ledger
from services import market
from services.market import registry
from services.trades import get_trades

MAX_DAYS = 1000          # daily history the providers serve (Binance's limit)
MARGIN_CLASSES = ("commodity", "bond")


def _d(s: str) -> date:
    return datetime.strptime(str(s)[:10], "%Y-%m-%d").date()


def is_margin(inst: dict) -> bool:
    return inst.get("asset_class") in MARGIN_CLASSES or float(inst.get("multiplier") or 1) != 1


def nav_series(trades: list[dict], entries: list[dict], closes: dict[str, dict[date, float]],
               instruments: dict[str, dict], fx_usd: dict[str, float], end: date) -> dict:
    """Pure: daily NAV and external flows for one portfolio. closes[iid][day] = close (gaps forward-filled)."""
    by_day_t, by_day_c = defaultdict(list), defaultdict(list)
    for t in sorted(trades, key=lambda t: (t["date"], t.get("created_at", 0))):
        by_day_t[_d(t["date"])].append(t)
    for e in entries:
        by_day_c[_d(e["date"])].append(e)
    days = sorted(set(by_day_t) | set(by_day_c))
    if not days:
        return {"days": [], "nav": [], "flows": [], "auto_funded": True, "cash": 0.0}
    end = max(end, days[-1])  # entries dated "today" in local time may be ahead of UTC today
    auto = not any(e["type"] in cash_ledger.EXTERNAL for e in entries)
    cash = 0.0
    spot = defaultdict(float)                      # iid -> qty
    fut = {}                                       # iid -> [qty, avg]
    last_px = {}                                   # iid -> last known price (close or trade)
    out_days, navs, flows, income = [], [], [], 0.0
    d = days[0] - timedelta(days=1)  # start from nothing, so the first day's move counts
    while d <= end:
        flow = 0.0
        for e in by_day_c.get(d, ()):
            amt = cash_ledger.signed(e)
            cash += amt
            if e["type"] in cash_ledger.EXTERNAL:
                flow += amt
            else:
                income += amt
        for t in by_day_t.get(d, ()):
            iid, info = t["instrument_id"], instruments.get(t["instrument_id"], {})
            conv = fx_usd.get(info.get("currency") or "USD", 1.0)
            m = float(info.get("multiplier") or 1)
            sgn = 1 if t["side"] == "buy" else -1
            qty, px = float(t["quantity"]), float(t["price"])
            last_px[iid] = px
            cash -= float(t.get("fee") or 0)
            if is_margin(info):
                q, avg = fut.get(iid, [0.0, 0.0])
                if q == 0 or (q > 0) == (sgn > 0):
                    nq = q + sgn * qty
                    fut[iid] = [nq, (abs(q) * avg + qty * px) / abs(nq)]
                else:
                    closing = min(qty, abs(q))
                    cash += (px - avg) * closing * m * conv * (1 if q > 0 else -1)
                    rest, nq = qty - closing, q + sgn * closing
                    fut[iid] = [sgn * rest, px] if rest > 1e-12 else [nq, avg if abs(nq) > 1e-12 else 0.0]
            else:
                spot[iid] += sgn * qty
                cash -= sgn * qty * px * m * conv
        if auto and cash < -1e-9:  # journal without deposits: fund the purchase
            flow += -cash
            cash = 0.0
        for iid, series in closes.items():
            if d in series:
                last_px[iid] = series[d]
        value = cash
        for iid, q in spot.items():
            if q and iid in last_px:
                info = instruments.get(iid, {})
                value += q * last_px[iid] * float(info.get("multiplier") or 1) * fx_usd.get(info.get("currency") or "USD", 1.0)
        for iid, (q, avg) in fut.items():
            if q and iid in last_px:
                info = instruments.get(iid, {})
                value += (last_px[iid] - avg) * q * float(info.get("multiplier") or 1) * fx_usd.get(info.get("currency") or "USD", 1.0)
        out_days.append(d)
        navs.append(value)
        flows.append(flow)
        d += timedelta(days=1)
    holdings = {}
    for iid, q in spot.items():
        if abs(q) > 1e-12:
            info = instruments.get(iid, {})
            px = last_px.get(iid)
            holdings[iid] = {"quantity": q, "price": px, "kind": "spot", "value": q * px * float(info.get("multiplier") or 1)
                             * fx_usd.get(info.get("currency") or "USD", 1.0) if px is not None else None}
    for iid, (q, avg) in fut.items():
        if abs(q) > 1e-12:
            info = instruments.get(iid, {})
            px = last_px.get(iid)
            mult = float(info.get("multiplier") or 1) * fx_usd.get(info.get("currency") or "USD", 1.0)
            holdings[iid] = {"quantity": q, "price": px, "kind": "futures", "avg": avg,
                             "value": q * px * mult if px is not None else None,  # notional exposure
                             "open_pnl": (px - avg) * q * mult if px is not None else None}
    return {"days": out_days, "nav": navs, "flows": flows, "auto_funded": auto, "cash": cash, "income": income,
            "holdings": holdings}


def daily_returns(navs: list[float], flows: list[float]) -> list[float]:
    """r_t = NAV_t / (NAV_{t-1} + flow_t) - 1; 0 when nothing was invested."""
    out = [0.0]
    for i in range(1, len(navs)):
        base = navs[i - 1] + flows[i]
        out.append(navs[i] / base - 1 if base > 1e-9 else 0.0)
    return out


def chain(returns) -> float:
    g = 1.0
    for r in returns:
        g *= 1 + r
    return g - 1


def xirr(cashflows: list[tuple[date, float]]) -> float | None:
    """Annual IRR of dated flows (investor's view: deposits negative, ending value positive)."""
    if len(cashflows) < 2 or not any(c < 0 for _, c in cashflows) or not any(c > 0 for _, c in cashflows):
        return None
    t0 = cashflows[0][0]

    def npv(rate):
        return sum(c / (1 + rate) ** ((d - t0).days / 365.0) for d, c in cashflows)

    lo, hi = -0.9999, 10.0
    f_lo, f_hi = npv(lo), npv(hi)
    if f_lo * f_hi > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2
        f_mid = npv(mid)
        if abs(f_mid) < 1e-7:
            break
        if f_lo * f_mid < 0:
            hi = mid
        else:
            lo, f_lo = mid, f_mid
    return (lo + hi) / 2


def period_start(end: date, period: str, first: date) -> date:
    if period == "1m":
        s = end - timedelta(days=30)
    elif period == "3m":
        s = end - timedelta(days=91)
    elif period == "ytd":
        s = date(end.year, 1, 1) - timedelta(days=1)  # measured from the last close of the prior year
    elif period == "1y":
        s = end - timedelta(days=365)
    else:
        s = first
    return max(s, first)


async def _closes(iid: str, start: date, end: date) -> dict[date, float]:
    n = min(MAX_DAYS, (end - start).days + 10)
    try:
        rows = await market.candles(iid, "1d", n)
    except Exception:  # noqa: BLE001 — valued at trade prices instead
        return {}
    return {datetime.fromtimestamp(c.open_time / 1000, timezone.utc).date(): c.close for c in rows}


async def performance(owner: str, portfolio_ids, benchmark: str = "index:SPX", period: str = "all",
                      today: date | None = None, start: date | None = None) -> dict:
    """Performance over a named period ending today, or from `start` to `today` (statements)."""
    await registry.ensure_loaded()
    end = today or datetime.now(timezone.utc).date()
    trades = get_trades(owner, portfolio_ids)
    entries = cash_ledger.get_entries(owner, portfolio_ids)
    if not trades and not entries:
        return {"empty": True}
    ids = sorted({t["instrument_id"] for t in trades})
    instruments = {i: (registry.get(i).to_dict() if registry.get(i) else {}) for i in ids}
    first = min([_d(t["date"]) for t in trades] + [_d(e["date"]) for e in entries])
    closes = {iid: await _closes(iid, first, end) for iid in ids}
    currencies = {d.get("currency") for d in instruments.values() if d.get("currency") not in (None, "USD")}
    fx_usd = {"USD": 1.0, **(await market.usd_per_unit(currencies) if currencies else {})}

    # Each portfolio on its own (funding, futures state), then summed
    pids = sorted({t["portfolio_id"] for t in trades} | {e["portfolio_id"] for e in entries})
    parts = [nav_series([t for t in trades if t["portfolio_id"] == p], [e for e in entries if e["portfolio_id"] == p],
                        closes, instruments, fx_usd, end) for p in pids]
    nav, flows = defaultdict(float), defaultdict(float)
    for s in parts:
        for d, v, f in zip(s["days"], s["nav"], s["flows"]):
            nav[d] += v
            flows[d] += f
    days = sorted(nav)
    navs, fl = [nav[d] for d in days], [flows[d] for d in days]
    rets = daily_returns(navs, fl)

    start = max(start, days[0]) if start else period_start(end, period, days[0])
    i0 = next(i for i, d in enumerate(days) if d >= start)
    window = rets[i0 + 1:]
    twr = chain(window)
    span = (days[-1] - days[i0]).days
    bench_closes = await _closes(benchmark, days[i0], end) if benchmark else {}
    bench_idx, last_b, b0 = [], None, None
    for d in days[i0:]:
        last_b = bench_closes.get(d, last_b)
        if b0 is None and last_b is not None:
            b0 = last_b
        bench_idx.append(round(last_b / b0 * 100, 3) if (last_b is not None and b0) else None)
    bench_ret = (bench_idx[-1] / 100 - 1) if bench_idx and bench_idx[-1] else None

    growth, g = [], 1.0
    for r in window:
        g *= 1 + r
        growth.append(g)
    series = [{"date": days[i0].isoformat(), "nav": round(navs[i0], 2), "flow": 0.0, "index": 100.0, "benchmark": bench_idx[0] if bench_idx else None}]
    for k, d in enumerate(days[i0 + 1:], start=1):
        series.append({"date": d.isoformat(), "nav": round(navs[i0 + k], 2), "flow": round(fl[i0 + k], 2),
                       "index": round(growth[k - 1] * 100, 3), "benchmark": bench_idx[k]})

    # Monthly returns (whole history, newest first) with the benchmark's
    monthly, months = [], defaultdict(list)
    for d, r in zip(days[1:], rets[1:]):
        months[d.strftime("%Y-%m")].append(r)
    all_bench = await _closes(benchmark, days[0], end) if benchmark else {}
    for mth in sorted(months, reverse=True):
        y, mo = map(int, mth.split("-"))
        m_start = date(y, mo, 1) - timedelta(days=1)
        m_end = (date(y + mo // 12, mo % 12 + 1, 1) - timedelta(days=1))
        b_a = next((all_bench[x] for x in sorted(all_bench, reverse=True) if x <= m_start), None)
        b_b = next((all_bench[x] for x in sorted(all_bench, reverse=True) if x <= m_end), None)
        monthly.append({"month": mth, "return_pct": round(chain(months[mth]) * 100, 2),
                        "benchmark_pct": round((b_b / b_a - 1) * 100, 2) if b_a and b_b else None})

    # Money-weighted: deposits in, withdrawals out, ending NAV out
    cfs = [(days[i0], -navs[i0])] if navs[i0] > 0 else []
    cfs += [(d, -f) for d, f in zip(days[i0 + 1:], fl[i0 + 1:]) if abs(f) > 1e-9]
    cfs.append((days[-1], navs[-1]))
    mwr = xirr(cfs) if span >= 30 else None

    net_flows = sum(fl[i0 + 1:])  # external flows inside the period
    cash_now = sum(s["cash"] for s in parts)
    holdings = {}
    for s in parts:
        for iid, h in s["holdings"].items():
            m = holdings.setdefault(iid, {**h, "quantity": 0.0, "value": 0.0, "open_pnl": 0.0 if h["kind"] == "futures" else None})
            m["quantity"] += h["quantity"]
            m["value"] = (m["value"] or 0) + (h["value"] or 0)
            if h["kind"] == "futures":
                m["open_pnl"] += h.get("open_pnl") or 0
    notes = []
    if any(s["auto_funded"] for s in parts):
        notes.append("No deposits recorded, so purchases are treated as funded by deposits on the day they were made. "
                     "Record deposits and withdrawals under Cash for exact returns.")
    if currencies:
        notes.append("Positions quoted in other currencies are converted to USD at today's exchange rate.")
    if any(not closes[i] for i in ids):
        notes.append("Some instruments have no daily price history; they are valued at their last trade price.")
    if (end - first).days > MAX_DAYS:
        notes.append(f"Before the last {MAX_DAYS} days, some prices may fall back to trade prices.")
    return {
        "empty": False, "period": period, "start": days[i0].isoformat(), "end": days[-1].isoformat(),
        "benchmark": benchmark, "benchmark_name": (registry.get(benchmark).name if registry.get(benchmark) else benchmark),
        "nav": round(navs[-1], 2), "start_nav": round(navs[i0], 2), "cash": round(cash_now, 2),
        "net_deposits": round(net_flows, 2), "income": round(sum(s.get("income", 0) for s in parts), 2),
        "twr_pct": round(twr * 100, 2),
        "twr_annualized_pct": round(((1 + twr) ** (365 / span) - 1) * 100, 2) if span > 365 and twr > -1 else None,
        "mwr_annual_pct": round(mwr * 100, 2) if mwr is not None else None,
        "benchmark_pct": round(bench_ret * 100, 2) if bench_ret is not None else None,
        "excess_pct": round((twr - bench_ret) * 100, 2) if bench_ret is not None else None,
        "auto_funded": any(s["auto_funded"] for s in parts),
        "series": series, "monthly": monthly[:36], "notes": notes, "as_of": time.time(),
        "income_in_period": round(sum(cash_ledger.signed(e) for e in entries
                                      if e["type"] not in cash_ledger.EXTERNAL and days[i0] < _d(e["date"]) <= days[-1]), 2),
        "holdings": [{"instrument_id": iid, **{k: (round(v, 6) if isinstance(v, float) else v) for k, v in h.items()},
                      "symbol": instruments.get(iid, {}).get("symbol") or iid.split(":", 1)[-1],
                      "name": instruments.get(iid, {}).get("name") or iid,
                      "asset_class": instruments.get(iid, {}).get("asset_class") or iid.split(":", 1)[0]}
                     for iid, h in sorted(holdings.items(), key=lambda kv: -abs(kv[1]["value"] or 0))],
    }
