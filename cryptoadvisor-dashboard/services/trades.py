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


def get_trades(username: str) -> list[dict]:
    raw = load_user_data(username, NAMESPACE)
    return [normalize_trade(t) for t in raw] if isinstance(raw, list) else []


def save_trades(username: str, trades: list[dict]) -> None:
    save_user_data(username, NAMESPACE, [normalize_trade(t) for t in trades])


def add_trade(username: str, instrument_id: str, side: str, price: float, quantity: float,
              date: str = "", fee: float = 0, notes: str = "", source: str = "manual") -> dict:
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
    trades.append(entry)
    save_trades(username, trades)
    return entry


def remove_trade(username: str, trade_id: str) -> bool:
    trades = get_trades(username)
    kept = [t for t in trades if t["id"] != trade_id]
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
        p = pos.setdefault(iid, {"instrument_id": iid, "qty": 0.0, "avg": 0.0, "realized": 0.0, "fees": 0.0,
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
        p["realized"] += (px - p["avg"]) * closing * m * (1 if q > 0 else -1)
        p["qty"] = q + direction * closing
        rest = qty - closing
        if abs(p["qty"]) < EPS:
            p["qty"], p["avg"] = 0.0, 0.0
        if rest > EPS:  # flipped: the remainder opens the other side at this price
            p["qty"], p["avg"] = direction * rest, px
            p["opened"] = t.get("date")
    for p in pos.values():
        p["realized"] -= p["fees"]
    return pos


def value_positions(positions: dict[str, dict], prices: dict[str, dict], instruments: dict[str, dict],
                    today: str | None = None) -> dict:
    """Attach prices/P&L to replayed positions and total them per asset class and overall.

    Day P&L is measured from the previous close, except for a position opened today, whose day
    P&L is its move since entry (otherwise a buy at today's price would show the whole day's move).
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
        row = {
            "instrument_id": iid, "coin_id": iid, "symbol": info.get("symbol") or iid.split(":", 1)[-1],
            "name": info.get("name") or iid, "asset_class": cls, "multiplier": m,
            "quantity": round(p["qty"], 10), "side": "long" if p["qty"] > 0 else "short" if p["qty"] < 0 else "flat",
            "avg_price": p["avg"], "realized_pnl": round(p["realized"], 2), "fees": round(p["fees"], 2),
            "trades": p["trades"], "first_date": p["first_date"], "last_date": p["last_date"],
        }
        c = by_class.setdefault(cls, {"market_value": 0.0, "unrealized_pnl": 0.0, "realized_pnl": 0.0, "positions": 0})
        c["realized_pnl"] += p["realized"]
        totals["realized_pnl"] += p["realized"]
        totals["fees"] += p["fees"]
        if p["qty"] == 0:
            closed_rows.append(row)
            continue
        q = prices.get(iid)
        price = q.get("price") if q else None
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


async def portfolio(username: str) -> dict:
    """Positions with live prices, P&L by asset class, totals."""
    from services import market

    await registry.ensure_loaded()
    trades = get_trades(username)
    ids = sorted({t["instrument_id"] for t in trades})
    instruments = {i: (registry.get(i).to_dict() if registry.get(i) else {}) for i in ids}
    positions = replay(trades, {i: float(d.get("multiplier") or 1.0) for i, d in instruments.items()})
    open_ids = [i for i, p in positions.items() if p["qty"] != 0]
    quotes = {k: q.to_dict() for k, q in (await market.quotes(open_ids)).items()} if open_ids else {}
    out = value_positions(positions, quotes, instruments)
    out["as_of"] = time.time()
    out["trade_count"] = len(trades)
    return out


async def calculate_pnl(username: str) -> list[dict]:
    """Open positions only (legacy shape used by risk, net worth and history snapshots)."""
    return (await portfolio(username))["positions"]
