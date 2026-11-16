"""Target allocations, drift and rebalancing for a portfolio.

Targets are percentages of the portfolio's NAV, either per instrument ("stock:AAPL": 30) or per asset
class ("class:crypto": 20) — one style per portfolio. Whatever the targets don't cover is the cash
target. Weights use exposure: a futures position counts its notional, so a 2x levered book shows up.

Suggestions are just that: rounded orders (whole shares and contracts) at the current price that the
user can review and log. Nothing trades on its own.
"""

import math
import time

from services import cash as cash_ledger
from services import market, portfolios
from services.market import registry
from services.market.models import ASSET_CLASSES
from services.notifications import add_notification
from services.performance import nav_series
from services.trades import get_trades, portfolio
from services.user_data import load_user_data, save_user_data

DEFAULT_THRESHOLD = 5.0  # percentage points
WHOLE_UNITS = ("stock", "etf", "commodity", "bond")


def validate_targets(targets: list[dict]) -> list[dict]:
    clean, seen, styles = [], set(), set()
    for row in targets or []:
        key = str(row.get("key") or "").strip()
        try:
            w = float(row.get("weight"))
        except (TypeError, ValueError):
            raise ValueError(f"Target weight for {key or '?'} must be a number")
        if not 0 <= w <= 100:
            raise ValueError(f"Target weight for {key} must be between 0 and 100")
        if key.startswith("class:"):
            if key[6:] not in ASSET_CLASSES:
                raise ValueError(f"Unknown asset class '{key[6:]}'")
            styles.add("class")
        else:
            inst = registry.get(key)
            if not inst:
                raise ValueError(f"Unknown instrument '{key}'")
            if not inst.tradable:
                raise ValueError(f"{inst.name} can't be held (it's a reference series)")
            styles.add("instrument")
        if key in seen:
            raise ValueError(f"{key} is listed twice")
        seen.add(key)
        clean.append({"key": key, "weight": round(w, 4)})
    if len(styles) > 1:
        raise ValueError("Use either asset-class targets or instrument targets in one portfolio, not both")
    if sum(r["weight"] for r in clean) > 100.0001:
        raise ValueError("Targets add up to more than 100%")
    return clean


async def set_targets(owner: str, pid: str, targets: list[dict], threshold: float | None = None) -> dict:
    await registry.ensure_loaded()
    clean = validate_targets(targets)
    th = DEFAULT_THRESHOLD if threshold is None else float(threshold)
    if not 0.5 <= th <= 50:
        raise ValueError("Drift threshold must be between 0.5 and 50 percentage points")
    return portfolios.update(owner, pid, {"targets": clean, "drift_threshold": th})


def current_cash(owner: str, pids, instruments: dict, fx_usd: dict) -> float:
    """Cash from the ledger and trades (no prices needed)."""
    from datetime import datetime, timezone

    trades = get_trades(owner, pids)
    entries = cash_ledger.get_entries(owner, pids)
    total = 0.0
    for pid in pids:
        s = nav_series([t for t in trades if t["portfolio_id"] == pid], [e for e in entries if e["portfolio_id"] == pid],
                       {}, instruments, fx_usd, datetime.now(timezone.utc).date())
        total += s["cash"]
    return total


def _round_qty(qty: float, cls: str) -> float:
    if cls in WHOLE_UNITS:
        return float(math.trunc(qty))
    if cls == "fx":
        return float(round(qty, -3))  # 1,000-unit steps (micro lot)
    return float(round(qty, 6))


async def analyze(owner: str, pid: str) -> dict:
    await registry.ensure_loaded()
    rec = portfolios.get_own(owner, pid)
    if not rec:
        raise portfolios.AccessError("Portfolio not found", 404)
    targets = rec.get("targets") or []
    threshold = float(rec.get("drift_threshold") or DEFAULT_THRESHOLD)
    pf = await portfolio(owner, [pid])
    positions = [p for p in pf["positions"] if p.get("market_value") is not None]
    instruments = {p["instrument_id"]: (registry.get(p["instrument_id"]).to_dict() if registry.get(p["instrument_id"]) else {})
                   for p in pf["positions"] + pf["closed"]}
    target_ids = [t["key"] for t in targets if not t["key"].startswith("class:")]
    for iid in target_ids:
        if iid not in instruments and registry.get(iid):
            instruments[iid] = registry.get(iid).to_dict()
    currencies = {d.get("currency") for d in instruments.values() if d.get("currency") not in (None, "USD")}
    fx_usd = {"USD": 1.0, **(await market.usd_per_unit(currencies) if currencies else {})}
    cash = current_cash(owner, [pid], instruments, fx_usd)
    # NAV: spot at market value, futures at open P&L only
    nav = cash + sum(p["market_value"] if not _is_margin(p) else p["unrealized_pnl"] for p in positions)
    quotes = {}
    missing = [i for i in target_ids if i not in {p["instrument_id"] for p in positions}]
    if missing:
        quotes = {k: q.price for k, q in (await market.quotes(missing)).items()}
    out = {"portfolio_id": pid, "nav": round(nav, 2), "cash": round(cash, 2), "threshold": threshold,
           "targets": targets, "rows": [], "orders": [], "breaches": 0, "style": None, "unpriced": pf["totals"].get("unpriced", 0)}
    if nav <= 0:
        out["error"] = "The portfolio has no value to allocate. Record a deposit under Performance → Cash first."
        return out
    if not targets:
        return out
    style = "class" if targets[0]["key"].startswith("class:") else "instrument"
    out["style"] = style
    tmap = {t["key"]: t["weight"] for t in targets}

    def weight(v):
        return v / nav * 100

    if style == "instrument":
        held = {p["instrument_id"]: p for p in positions}
        for iid in dict.fromkeys(list(tmap) + list(held)):
            p, info = held.get(iid), instruments.get(iid, {})
            mv = p["market_value"] if p else 0.0
            tgt = tmap.get(iid, 0.0)
            price = p["price"] if p else quotes.get(iid)
            out["rows"].append(_row(iid, info.get("symbol") or iid, info.get("name") or iid, tgt, weight(mv), mv, nav,
                                    threshold, untargeted=iid not in tmap))
            _order(out, iid, info, price, nav * tgt / 100 - mv, fx_usd)
    else:
        by_cls = {}
        for p in positions:
            by_cls.setdefault(p["asset_class"], []).append(p)
        for cls in dict.fromkeys([k[6:] for k in tmap] + list(by_cls)):
            held = by_cls.get(cls, [])
            mv = sum(p["market_value"] for p in held)
            tgt = tmap.get(f"class:{cls}", 0.0)
            out["rows"].append(_row(f"class:{cls}", cls, cls, tgt, weight(mv), mv, nav, threshold,
                                    untargeted=f"class:{cls}" not in tmap))
            delta = nav * tgt / 100 - mv
            if held and abs(mv) > 0:  # scale what's held in the class proportionally
                for p in held:
                    _order(out, p["instrument_id"], instruments.get(p["instrument_id"], {}), p["price"], delta * p["market_value"] / mv, fx_usd)
            elif abs(delta) > 1:
                out["rows"][-1]["note"] = "Nothing held in this class yet; pick instruments to buy."
    cash_target = 100 - sum(tmap.values())
    out["rows"].append(_row("cash", "Cash", "Cash", cash_target, weight(cash), cash, nav, threshold))
    out["breaches"] = sum(1 for r in out["rows"] if r["breach"])
    out["orders"] = [o for o in out["orders"] if o["quantity"]]
    return out


def _is_margin(p: dict) -> bool:
    return p.get("asset_class") in ("commodity", "bond") or float(p.get("multiplier") or 1) != 1


def _row(key, symbol, name, target, current, value, nav, threshold, untargeted=False) -> dict:
    drift = current - target
    return {"key": key, "symbol": symbol, "name": name, "target_pct": round(target, 2), "current_pct": round(current, 2),
            "drift_pct": round(drift, 2), "value": round(value, 2), "target_value": round(nav * target / 100, 2),
            "breach": abs(drift) > threshold, "untargeted": untargeted}


def _order(out: dict, iid: str, info: dict, price, delta_value: float, fx_usd: dict) -> None:
    if not price:
        if abs(delta_value) > 1:
            out.setdefault("notes", []).append(f"No live price for {info.get('symbol') or iid}; no order suggested.")
        return
    unit = price * float(info.get("multiplier") or 1) * fx_usd.get(info.get("currency") or "USD", 1.0)
    qty = _round_qty(abs(delta_value) / unit, info.get("asset_class") or iid.split(":")[0])
    out["orders"].append({"instrument_id": iid, "symbol": info.get("symbol") or iid, "side": "buy" if delta_value > 0 else "sell",
                          "quantity": qty, "price": price, "value": round(qty * unit, 2)})


async def log_orders(owner: str, pid: str, orders: list[dict], by: str) -> list[dict]:
    """Record reviewed rebalance orders as trades at the current price."""
    from services.trades import add_trade

    await registry.ensure_loaded()
    ids = [o["instrument_id"] for o in orders]
    live = {k: q.price for k, q in (await market.quotes(ids)).items()}
    done = []
    for o in orders:
        price = live.get(o["instrument_id"])
        if not price:
            raise ValueError(f"No live price for {o['instrument_id']} right now")
        inst = registry.get(o["instrument_id"])
        if not inst or not inst.tradable:
            raise ValueError(f"{o['instrument_id']} can't be traded")
        done.append(add_trade(owner, inst.id, o["side"], price, float(o["quantity"]), notes="rebalance",
                              source="rebalance" if by == owner else f"rebalance:{by}", portfolio_id=pid))
    return done


async def check_drift_all() -> None:
    """Daily: notify owners whose portfolios drifted past their threshold (once per day per portfolio)."""
    from services.user_data import DATA_DIR

    folder = DATA_DIR / portfolios.NAMESPACE
    if not folder.exists():
        return
    for f in folder.glob("*.json"):
        owner = f.stem
        state = load_user_data(owner, "drift_alerts")
        state = state if isinstance(state, dict) else {}
        for rec in portfolios.list_own(owner):
            if not rec.get("targets") or time.time() - state.get(rec["id"], 0) < 20 * 3600:
                continue
            try:
                a = await analyze(owner, rec["id"])
            except Exception as exc:  # noqa: BLE001 — one bad portfolio mustn't stop the rest
                print(f"[allocation] drift check {owner}/{rec['id']}: {exc}")
                continue
            if a["breaches"]:
                worst = max((r for r in a["rows"] if r["breach"]), key=lambda r: abs(r["drift_pct"]))
                add_notification(owner, f"{rec['name']} has drifted from its targets",
                                 f"{a['breaches']} allocation(s) beyond ±{a['threshold']:g} pts; largest: {worst['symbol']} "
                                 f"{worst['current_pct']:.1f}% vs {worst['target_pct']:.1f}% target. Open Allocation to rebalance.",
                                 category="portfolio")
                state[rec["id"]] = time.time()
        save_user_data(owner, "drift_alerts", state)
