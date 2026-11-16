"""Actions the chat assistant can propose; nothing runs until the user clicks Confirm.

The model never acts. When a request needs a change, it adds a fenced ```actions [...]``` block to
its reply. Each proposal is parsed and validated here: instruments are resolved to real
instruments, numbers checked, "market" prices quoted. The chat shows a summary card per action;
Confirm runs it through the same services the pages use (trades, alerts, watchlist, in-play rules).
"""

import json
import re
import time
import uuid
from dataclasses import asdict

from services import market
from services.market import registry

ACTION_TYPES = {
    "add_trade": "Log a trade",
    "create_alert": "Create a price alert",
    "add_watchlist": "Add to watchlist",
    "remove_watchlist": "Remove from watchlist",
    "set_inplay_rules": "Change In-Play scanner settings",
}
INPLAY_FIELDS = {"timeframe", "universes", "volume_lookback", "price_lookback", "retention_days", "volume_mult",
                 "range_mult", "max_wick_pct", "min_body_pct", "surgex_filter"}
MAX_ACTIONS = 5

ACTIONS_GUIDE = """\
ACTIONS. You cannot change anything yourself, but you can PROPOSE changes the user then confirms with a
button. When (and only when) the user asks you to do something you can do, end your reply with exactly one
fenced block:

```actions
[{"type": "...", ...}]
```

Available types (fields; instrument = ticker, name or id like "AAPL", "gold", "EUR/USD", "stock:AAPL"):
- add_trade: instrument, side ("buy"|"sell"), quantity (number; shares, coins, contracts, or base-currency
  units for forex), price (number or "market"), optional date (YYYY-MM-DD, default today), optional fee,
  optional portfolio (its name, when the user has several; default: their default portfolio)
- create_alert: instrument, direction ("above"|"below"), price (number; yields in percent)
- add_watchlist / remove_watchlist: instrument
- set_inplay_rules: any of timeframe ("1h","2h","3h","6h","12h","1d","3d","9d"), universes (list of
  "crypto","stocks","etfs","futures","fx"), volume_lookback, price_lookback, retention_days, volume_mult,
  range_mult, max_wick_pct, min_body_pct, surgex_filter ("off","velocity","acceleration")
Rules: at most 5 actions. Say in your text what you are proposing and that it needs their confirmation;
never say it is done. If something essential is missing (e.g. quantity), ask instead of guessing. Never
propose actions the user did not ask for. AssetAdvisor cannot place real orders with a broker; "log a
trade" only records it in their journal.
"""

_BLOCK = re.compile(r"```actions\s*(\[.*?\])\s*```", re.S)


def split_reply(text: str) -> tuple[str, list[dict]]:
    """(reply text without the actions block, raw proposals). Malformed blocks yield no proposals."""
    m = _BLOCK.search(text or "")
    if not m:
        return (text or "").strip(), []
    clean = (text[:m.start()] + text[m.end():]).strip()
    try:
        raw = json.loads(m.group(1))
    except ValueError:
        return clean, []
    return clean, [a for a in raw if isinstance(a, dict)][:MAX_ACTIONS] if isinstance(raw, list) else []


def _resolve(query, tradable: bool):
    q = str(query or "").strip()
    if not q:
        return None
    if ":" in q and registry.get(q):
        inst = registry.get(q)
        return inst if inst.tradable or not tradable else None  # yields/indices can't be traded
    hits = registry.search(q.replace("/", "") if "/" in q and len(q) <= 8 else q, tradable_only=tradable, limit=1)
    return hits[0] if hits else None


def _num(v, name: str, positive=True) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be a number")
    if positive and x <= 0:
        raise ValueError(f"{name} must be positive")
    return x


def _label(inst) -> str:
    """"AAPL (Apple Inc.)"; forex names already read "EUR/USD (Euro / US Dollar)"."""
    return inst.name if inst.asset_class == "fx" else f"{inst.symbol} ({inst.name})"


def _price_text(price: float, inst) -> str:
    if inst.asset_class == "rate":
        return f"{price:,.3f}%"
    d = inst.price_decimals
    return f"{price:,.{d}f}" if inst.asset_class in ("fx", "index") or inst.currency != "USD" else f"${price:,.{d}f}"


async def validate(proposal: dict, username: str) -> dict:
    """A proposal -> {id, type, params, summary, status: proposed|invalid, error?}."""
    from services import favorites, in_play

    await registry.ensure_loaded()
    kind = proposal.get("type")
    action = {"id": uuid.uuid4().hex[:10], "type": kind, "status": "proposed", "created_at": time.time()}
    try:
        if kind not in ACTION_TYPES:
            raise ValueError(f"unknown action '{kind}'")
        if kind == "add_trade":
            inst = _resolve(proposal.get("instrument"), tradable=True)
            if not inst:
                raise ValueError(f"couldn't find a tradable instrument for '{proposal.get('instrument')}'")
            side = str(proposal.get("side", "")).lower()
            if side not in ("buy", "sell"):
                raise ValueError("side must be buy or sell")
            qty = _num(proposal.get("quantity"), "quantity")
            fee = _num(proposal.get("fee", 0) or 0, "fee", positive=False)
            date = str(proposal.get("date") or time.strftime("%Y-%m-%d"))
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
                raise ValueError("date must be YYYY-MM-DD")
            at_market = str(proposal.get("price", "")).lower() == "market"
            if at_market:
                q = (await market.quotes([inst.id])).get(inst.id)
                if not q:
                    raise ValueError(f"no live price for {inst.symbol} right now; give a price")
                price = q.price
            else:
                price = _num(proposal.get("price"), "price")
            from services import portfolios

            own = portfolios.list_own(username)
            wanted = str(proposal.get("portfolio") or "").strip().lower()
            book = next((p for p in own if wanted and p["name"].lower() == wanted), None) if wanted else \
                next(p for p in own if p.get("default"))
            if not book:
                raise ValueError(f"no portfolio called '{proposal.get('portfolio')}' "
                                 f"(you have: {', '.join(p['name'] for p in own)})")
            action["params"] = {"instrument_id": inst.id, "side": side, "quantity": qty, "price": price,
                                "at_market": at_market, "date": date, "fee": fee, "portfolio_id": book["id"]}
            action["summary"] = (f"{side.upper()} {qty:g} {_label(inst)} at "
                                 f"{'market ≈ ' if at_market else ''}{_price_text(price, inst)} on {date}"
                                 + (f", fee ${fee:,.2f}" if fee else "")
                                 + (f", in {book['name']}" if len(own) > 1 else ""))
        elif kind == "create_alert":
            inst = _resolve(proposal.get("instrument"), tradable=False)
            if not inst:
                raise ValueError(f"couldn't find '{proposal.get('instrument')}'")
            direction = str(proposal.get("direction", "")).lower()
            if direction not in ("above", "below"):
                raise ValueError("direction must be above or below")
            target = _num(proposal.get("price"), "price")
            action["params"] = {"instrument_id": inst.id, "direction": direction, "target_price": target}
            action["summary"] = f"Alert when {_label(inst)} is {direction} {_price_text(target, inst)}"
        elif kind in ("add_watchlist", "remove_watchlist"):
            inst = _resolve(proposal.get("instrument"), tradable=False)
            if not inst:
                raise ValueError(f"couldn't find '{proposal.get('instrument')}'")
            if kind == "remove_watchlist" and inst.id not in favorites.get_favorites(username):
                raise ValueError(f"{inst.symbol} isn't on your watchlist")
            action["params"] = {"instrument_id": inst.id}
            action["summary"] = f"{'Add' if kind == 'add_watchlist' else 'Remove'} {_label(inst)} " \
                                f"{'to' if kind == 'add_watchlist' else 'from'} your watchlist"
        elif kind == "set_inplay_rules":
            changes = {k: v for k, v in proposal.items() if k in INPLAY_FIELDS}
            if not changes:
                raise ValueError("no In-Play settings given")
            current = in_play.get_rules(username)
            merged = in_play.Rules.from_dict({**asdict(current), "universes": list(current.universes), **changes})
            err = merged.validate()
            if err:
                raise ValueError(err)
            action["params"] = {"rules": {**asdict(merged), "universes": list(merged.universes)}}
            action["summary"] = "In-Play: " + ", ".join(
                f"{k.replace('_', ' ')} {', '.join(v) if isinstance(v, list) else v}" for k, v in changes.items())
    except ValueError as exc:
        action.update(status="invalid", error=str(exc), summary=f"{ACTION_TYPES.get(kind, 'Action')}: {exc}",
                      params=proposal)
    return action


async def execute(action: dict, username: str) -> str:
    """Run a confirmed action. Returns a short result line; raises ValueError on failure."""
    from services import alerts, favorites, in_play, trades

    p = action["params"]
    kind = action["type"]
    if kind == "add_trade":
        price = p["price"]
        if p.get("at_market"):  # use the price at confirmation time, not when it was proposed
            q = (await market.quotes([p["instrument_id"]])).get(p["instrument_id"])
            if q:
                price = q.price
        t = trades.add_trade(username, p["instrument_id"], p["side"], price, p["quantity"], p["date"], p["fee"],
                             notes="via chat", source="assistant", portfolio_id=p.get("portfolio_id"))
        inst = registry.get(p["instrument_id"])
        return f"Logged {p['side']} {p['quantity']:g} {inst.symbol if inst else p['instrument_id']} at {price:,.6g} (trade {t['id']})."
    if kind == "create_alert":
        a = alerts.add_alert(username, p["instrument_id"], p["direction"], p["target_price"], notes="via chat")
        return f"Alert created (id {a['id']})."
    if kind == "add_watchlist":
        favorites.add_favorite(username, p["instrument_id"])
        return "Added to your watchlist."
    if kind == "remove_watchlist":
        favorites.remove_favorite(username, p["instrument_id"])
        return "Removed from your watchlist."
    if kind == "set_inplay_rules":
        rules = in_play.Rules.from_dict(p["rules"])
        err = rules.validate()
        if err:
            raise ValueError(err)
        ready = in_play.update_rules(username, rules)
        if not ready:
            import asyncio

            asyncio.create_task(in_play.scan_in_play(only_profiles=rules.builds(), wait=True))
            return "In-Play settings saved; building history for the new setup (a few minutes)."
        return "In-Play settings saved."
    raise ValueError(f"unknown action {kind}")
