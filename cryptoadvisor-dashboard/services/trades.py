"""Trade journal and P&L for any asset class.

A trade is {instrument_id, side (buy|sell), quantity, price, fee, date}. Positions are derived by
replaying trades in date order with the average-cost method:

  * buys add to a long (or cover a short), sells reduce a long (or open/add to a short);
  * closing part of a position realizes (exit - avg) x qty x multiplier (reversed for shorts);
  * a trade larger than the open position closes it and opens the other side with the remainder.

Unrealized P&L = (price - avg) x signed qty x multiplier. Futures use the instrument's contract
multiplier; spot assets use 1. Fees are tracked and subtracted from realized P&L.

Old trades stored CoinGecko ids ("coin_id": "bitcoin"); they are converted to instrument ids when
read and saved back in the new form on the next write.
"""

import time
import uuid

from services.market import registry
from services.market.models import split_id
from services.user_data import load_user_data, save_user_data

NAMESPACE = "trades"
EPS = 1e-12


# ── Records ─────────────────────────────────────────────────────────────────

def normalize_trade(t: dict) -> dict:
    """Any stored trade -> current schema. `coin_id` mirrors instrument_id for older readers (tax, AI)."""
    t = dict(t)
    iid = t.get("instrument_id")
    if not iid:
        legacy = t.get("coin_id") or t.get("coin") or ""
        iid = registry.from_coingecko_id(legacy) if legacy and ":" not in legacy else legacy
        if not iid:
            sym = (t.get("symbol") or legacy or "UNKNOWN").upper()
            iid = f"crypto:{sym}"
    t["instrument_id"] = iid
    t["coin_id"] = iid
    t["side"] = str(t.get("side") or t.get("type") or "buy").lower()
    t["quantity"] = float(t.get("quantity", t.get("amount", 0)) or 0)
    t["price"] = float(t.get("price") or 0)
    t["fee"] = float(t.get("fee") or 0)
    t.setdefault("date", time.strftime("%Y-%m-%d", time.gmtime(t.get("created_at") or time.time())))
    t.setdefault("id", str(uuid.uuid4())[:8])
    return t


def get_trades(username: str, portfolio_ids=None) -> list[dict]:
    """The user's trades, optionally only those in `portfolio_ids`. Trades from before portfolios
    existed belong to the default portfolio."""
    from services.portfolios import default_id

    raw = load_user_data(username, NAMESPACE)
    rows = [normalize_trade(t) for t in raw] if isinstance(raw, list) else []
    if any(not t.get("portfolio_id") for t in rows):
        default = default_id(username)
        for t in rows:
            t["portfolio_id"] = t.get("portfolio_id") or default
    if portfolio_ids is not None:
        rows = [t for t in rows if t["portfolio_id"] in portfolio_ids]
    return rows


def save_trades(username: str, trades: list[dict]) -> None:
    save_user_data(username, NAMESPACE, [normalize_trade(t) for t in trades])


def add_trade(username: str, instrument_id: str, side: str, price: float, quantity: float,
              date: str = "", fee: float = 0, notes: str = "", source: str = "manual",
              portfolio_id: str | None = None) -> dict:
    split_id(instrument_id)  # raises ValueError on a malformed id
    if side not in ("buy", "sell"):
        raise ValueError("side must be buy or sell")
    if quantity <= 0 or price <= 0 or fee < 0:
        raise ValueError("quantity and price must be positive, fee not negative")
    trades = get_trades(username)
    entry = normalize_trade({
        "id": str(uuid.uuid4())[:8], "instrument_id": instrument_id, "side": side, "price": price,
        "quantity": quantity, "date": date or time.strftime("%Y-%m-%d"), "fee": fee, "notes": notes[:500],
        "source": source, "created_at": time.time(),
    })
    if portfolio_id:
        entry["portfolio_id"] = portfolio_id
    else:
        from services.portfolios import default_id

        entry["portfolio_id"] = default_id(username)
    trades.append(entry)
    save_trades(username, trades)
    return entry


def remove_trade(username: str, trade_id: str, portfolio_ids=None) -> bool:
    trades = get_trades(username)
    kept = [t for t in trades if not (t["id"] == trade_id and (portfolio_ids is None or t["portfolio_id"] in portfolio_ids))]
    save_trades(username, kept)
    return len(kept) != len(trades)


# ── Positions (pure; unit-tested) ───────────────────────────────────────────

def replay(trades: list[dict], multipliers: dict[str, float] | None = None) -> dict[str, dict]:
    """Replay trades (any order; sorted by date then entry time) into per-instrument positions."""
    mult = multipliers or {}
    pos: dict[str, dict] = {}
    for t in sorted(trades, key=lambda t: (t.get("date", ""), t.get("created_at", 0))):
        iid, qty, px = t["instrument_id"], float(t["quantity"]), float(t["price"])
        m = mult.get(iid, 1.0)
        p = pos.setdefault(iid, {"instrument_id": iid, "qty": 0.0, "avg": 0.0, "gross": 0.0, "fees": 0.0,
                                 "trades": 0, "bought": 0.0, "sold": 0.0, "first_date": t.get("date"), "last_date": None})
        p["trades"] += 1
        p["fees"] += float(t.get("fee") or 0)
        p["last_date"] = t.get("date")
        direction = 1 if t["side"] == "buy" else -1
        p["bought" if direction > 0 else "sold"] += qty
        q = p["qty"]
        if q == 0:
            p["opened"] = t.get("date")  # the current position's open date (day P&L reference)
        if q == 0 or (q > 0) == (direction > 0):  # opening or adding in the same direction
            new_q = q + direction * qty
            p["avg"] = (abs(q) * p["avg"] + qty * px) / abs(new_q)
            p["qty"] = new_q
            continue
        closing = min(qty, abs(q))  # reducing the opposite side
        p["gross"] += (px - p["avg"]) * closing * m * (1 if q > 0 else -1)  # in the quote currency
        p["qty"] = q + direction * closing
        rest = qty - closing
        if abs(p["qty"]) < EPS:
            p["qty"], p["avg"] = 0.0, 0.0
        if rest > EPS:  # flipped: the remainder opens the other side at this price
            p["qty"], p["avg"] = direction * rest, px
            p["opened"] = t.get("date")
    for p in pos.values():
        p["realized"] = p["gross"] - p["fees"]  # fees are entered in USD; equal to gross for USD instruments
    return pos


def value_positions(positions: dict[str, dict], prices: dict[str, dict], instruments: dict[str, dict],
                    today: str | None = None, fx_usd: dict[str, float] | None = None) -> dict:
    """Attach prices/P&L to replayed positions and total them per asset class and overall.

    Day P&L is measured from the previous close, except for a position opened today, whose day
    P&L is its move since entry (otherwise a buy at today's price would show the whole day's move).

    Instruments quoted in another currency (forex pairs like USD/JPY) are converted to USD with
    `fx_usd` ({currency: USD per unit}); realized P&L converts at today's rate, a simplification.
    """
    today = today or time.strftime("%Y-%m-%d", time.gmtime())
    open_rows, closed_rows = [], []
    totals = {"market_value": 0.0, "long_exposure": 0.0, "short_exposure": 0.0, "cost_basis": 0.0,
              "unrealized_pnl": 0.0, "realized_pnl": 0.0, "day_pnl": 0.0, "fees": 0.0, "unpriced": 0}
    by_class: dict[str, dict] = {}
    for iid, p in positions.items():
        info = instruments.get(iid) or {}
        cls = info.get("asset_class") or iid.split(":", 1)[0]
        m = float(info.get("multiplier") or 1.0)
        ccy = info.get("currency") or "USD"
        conv = 1.0 if ccy == "USD" else (fx_usd or {}).get(ccy)
        realized = (p["gross"] * conv - p["fees"]) if conv else None
        row = {
            "instrument_id": iid, "coin_id": iid, "symbol": info.get("symbol") or iid.split(":", 1)[-1],
            "name": info.get("name") or iid, "asset_class": cls, "multiplier": m,
            "quantity": round(p["qty"], 10), "side": "long" if p["qty"] > 0 else "short" if p["qty"] < 0 else "flat",
            "currency": ccy, "avg_price": p["avg"], "fees": round(p["fees"], 2),
            "realized_pnl": round(realized, 2) if realized is not None else None,
            "trades": p["trades"], "first_date": p["first_date"], "last_date": p["last_date"],
        }
        c = by_class.setdefault(cls, {"market_value": 0.0, "unrealized_pnl": 0.0, "realized_pnl": 0.0, "positions": 0})
        c["realized_pnl"] += realized or 0.0
        totals["realized_pnl"] += realized or 0.0
        totals["fees"] += p["fees"]
        if p["qty"] == 0:
            closed_rows.append(row)
            continue
        q = prices.get(iid)
        price = q.get("price") if q and conv else None  # no USD rate for its currency: can't value it
        m = m * (conv or 1.0)  # from here on, values are in USD
        cost = abs(p["qty"]) * p["avg"] * m
        row.update(cost_basis=round(cost, 2), price=price, change_pct=q.get("change_pct") if q else None,
                   price_available=price is not None, delayed=bool(q and q.get("delayed")), stale=bool(q and q.get("stale")))
        if price is None:
            # Unknown price: say so instead of valuing the position at 0 (which read as -100%)
            row.update(market_value=None, unrealized_pnl=None, unrealized_pct=None, day_pnl=None)
            totals["unpriced"] += 1
        else:
            mv = p["qty"] * price * m
            upnl = (price - p["avg"]) * p["qty"] * m
            chg = q.get("change_pct")
            if str(p.get("opened") or "")[:10] >= today:
                day = upnl
            else:
                day = p["qty"] * m * (price - price / (1 + chg / 100)) if chg not in (None, -100) else 0.0
            row.update(market_value=round(mv, 2), unrealized_pnl=round(upnl, 2),
                       unrealized_pct=round(upnl / cost * 100, 2) if cost else None, day_pnl=round(day, 2))
            totals["market_value"] += mv
            totals["long_exposure" if mv > 0 else "short_exposure"] += abs(mv)
            totals["cost_basis"] += cost
            totals["unrealized_pnl"] += upnl
            totals["day_pnl"] += day
            c["market_value"] += mv
            c["unrealized_pnl"] += upnl
        c["positions"] += 1
        # Legacy field for older readers (risk, net worth, history snapshots)
        row["current_value"] = row["market_value"]
        open_rows.append(row)
    totals["total_pnl"] = totals["unrealized_pnl"] + totals["realized_pnl"]
    open_rows.sort(key=lambda r: abs(r["market_value"] or r["cost_basis"]), reverse=True)
    closed_rows.sort(key=lambda r: r["last_date"] or "", reverse=True)
    rnd = lambda d: {k: round(v, 2) if isinstance(v, float) else v for k, v in d.items()}  # noqa: E731
    return {"positions": open_rows, "closed": closed_rows, "totals": rnd(totals),
            "by_class": {k: rnd(v) for k, v in sorted(by_class.items())}}


def merge_valued(parts: dict[str, dict]) -> dict:
    """Combine per-portfolio valuations into one view. Each portfolio is replayed on its own first:
    a sale in one client's account must never close (or set the cost basis of) another's position."""
    open_by, closed_by = {}, {}
    num = ("quantity", "market_value", "cost_basis", "unrealized_pnl", "day_pnl", "realized_pnl", "fees", "trades",
           "current_value")
    for pid, out in parts.items():
        for row in out["positions"] + out["closed"]:
            m = open_by.setdefault(row["instrument_id"], {**row, **{k: None if row.get(k) is None else 0 for k in num},
                                                          "holdings": [], "_cost_qty": 0.0})
            for k in num:
                if row.get(k) is not None:
                    m[k] = (m[k] or 0) + row[k]
            if row["quantity"]:
                m["holdings"].append({"portfolio_id": pid, "quantity": row["quantity"]})
                m["_cost_qty"] += abs(row["quantity"]) * row["avg_price"]
            m["first_date"] = min(filter(None, [m.get("first_date"), row.get("first_date")]), default=None)
            m["last_date"] = max(filter(None, [m.get("last_date"), row.get("last_date")]), default=None)
    positions, closed = [], []
    for m in open_by.values():
        q = m["quantity"] or 0
        sides = {h["quantity"] > 0 for h in m["holdings"]}
        m["avg_price"] = m.pop("_cost_qty") / sum(abs(h["quantity"]) for h in m["holdings"]) if len(sides) == 1 else None
        m["side"] = "long" if q > 1e-12 else "short" if q < -1e-12 else "flat"
        if m["unrealized_pnl"] is not None and m.get("cost_basis"):
            m["unrealized_pct"] = round(m["unrealized_pnl"] / m["cost_basis"] * 100, 2)
        for k in ("market_value", "cost_basis", "unrealized_pnl", "day_pnl", "realized_pnl", "fees", "current_value"):
            if isinstance(m.get(k), float):
                m[k] = round(m[k], 2)
        (positions if m["holdings"] else closed).append(m)
    totals, by_class = {}, {}
    for out in parts.values():
        for k, v in out["totals"].items():
            totals[k] = round(totals.get(k, 0) + v, 2)
        for cls, c in out["by_class"].items():
            b = by_class.setdefault(cls, {})
            for k, v in c.items():
                b[k] = round(b.get(k, 0) + v, 2)
    positions.sort(key=lambda r: abs(r["market_value"] or r.get("cost_basis") or 0), reverse=True)
    closed.sort(key=lambda r: r["last_date"] or "", reverse=True)
    return {"positions": positions, "closed": closed, "totals": totals, "by_class": dict(sorted(by_class.items()))}


async def portfolio(username: str, portfolio_ids=None) -> dict:
    """Positions with live prices, P&L by asset class, totals. Several portfolios -> combined view
    with a per-portfolio breakdown."""
    from services import market
    from services.portfolios import list_own

    await registry.ensure_loaded()
    trades = get_trades(username, portfolio_ids)
    ids = sorted({t["instrument_id"] for t in trades})
    instruments = {i: (registry.get(i).to_dict() if registry.get(i) else {}) for i in ids}
    mult = {i: float(d.get("multiplier") or 1.0) for i, d in instruments.items()}
    pids = list(portfolio_ids) if portfolio_ids is not None else sorted({t["portfolio_id"] for t in trades})
    replays = {pid: replay([t for t in trades if t["portfolio_id"] == pid], mult) for pid in pids}
    open_ids = sorted({i for pos in replays.values() for i, p in pos.items() if p["qty"] != 0})
    quotes = {k: q.to_dict() for k, q in (await market.quotes(open_ids)).items()} if open_ids else {}
    currencies = {d.get("currency") for d in instruments.values() if d.get("currency") not in (None, "USD")}
    fx_usd = await market.usd_per_unit(currencies) if currencies else {}
    parts = {pid: value_positions(pos, quotes, instruments, fx_usd=fx_usd) for pid, pos in replays.items()}
    if len(parts) == 1:
        out = next(iter(parts.values()))
    elif not parts:
        out = value_positions({}, {}, {})
    else:
        out = merge_valued(parts)
        names = {r["id"]: r["name"] for r in list_own(username)}
        out["portfolios"] = [{"id": pid, "name": names.get(pid, pid), "totals": p["totals"],
                              "positions": len(p["positions"])} for pid, p in parts.items()]
    out["as_of"] = time.time()
    out["trade_count"] = len(trades)
    return out


async def calculate_pnl(username: str, portfolio_ids=None) -> list[dict]:
    """Open positions only (legacy shape used by risk, net worth and history snapshots)."""
    return (await portfolio(username, portfolio_ids))["positions"]
