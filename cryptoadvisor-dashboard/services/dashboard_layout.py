"""The dashboard's tiles per user: which show, in what order, how wide, and the instruments in each Markets tile.

Layout: {"tiles": [{"id", "size", "hidden"}], "groups": [{"id", "title", "ids": [instrument ids]}]}
The order of `tiles` is the order on screen. A Markets tile's id is "group:<group id>".
Anything unknown or malformed is dropped, and tiles added in later releases are appended, so an old
saved layout keeps working.
"""

import re

from services import store

NAMESPACE = "dashboard_layout"
SIZES = ("s", "m", "l", "full")          # quarter, third, half, full width on a wide screen
MAX_GROUPS = 12
MAX_PER_GROUP = 12

BUILT_IN = {  # id -> (name, default size)
    "stats": ("Crypto market stats", "full"),
    "watchlist": ("Your watchlist", "full"),
    "top_coins": ("Top coins", "full"),
    "fear_greed": ("Fear & Greed index", "m"),
    "dominance": ("Market dominance", "m"),
    "volume": ("24h volume by coin", "m"),
    "alerts": ("Active alerts", "m"),
    "activity": ("Recent activity", "m"),
    "quick_actions": ("Quick actions", "m"),
}
DEFAULT_GROUPS = [
    {"id": "stocks", "title": "Stocks", "ids": ["index:SPX", "index:NDX", "index:DJI", "index:VIX"]},
    {"id": "rates", "title": "Rates & dollar", "ids": ["rate:US3M", "rate:US10Y", "rate:US30Y", "index:DXY"]},
    {"id": "commodities", "title": "Commodities", "ids": ["commodity:GC", "commodity:SI", "commodity:CL", "commodity:NG"]},
    {"id": "forex", "title": "Forex", "ids": ["fx:EURUSD", "fx:USDJPY", "fx:GBPUSD", "fx:USDCNH"]},
    {"id": "crypto", "title": "Crypto", "ids": ["crypto:BTC", "crypto:ETH", "crypto:SOL", "crypto:XRP"]},
]
# Where built-in tiles sit by default: Markets tiles first, then the rest
DEFAULT_ORDER = ["stats", "watchlist", "top_coins", "fear_greed", "dominance", "volume", "alerts", "activity", "quick_actions"]
# The old Settings > Dashboard widgets switches, mapped onto tiles
LEGACY_WIDGETS = {"market_overview": "stats", "price_cards": "top_coins", "favorites": "watchlist", "fear_greed": "fear_greed",
                  "dominance": "dominance", "volume": "volume", "alerts_summary": "alerts", "recent_trades": "activity",
                  "quick_actions": "quick_actions"}
_ID = re.compile(r"^[a-z0-9_-]{1,32}$")
_INSTRUMENT = re.compile(r"^[a-z]+:[A-Za-z0-9._=^-]{1,30}$")


def default_layout() -> dict:
    tiles = [{"id": f"group:{g['id']}", "size": "s", "hidden": False} for g in DEFAULT_GROUPS]
    tiles += [{"id": t, "size": BUILT_IN[t][1], "hidden": False} for t in DEFAULT_ORDER]
    return {"tiles": tiles, "groups": [dict(g, ids=list(g["ids"])) for g in DEFAULT_GROUPS]}


def sanitize(raw) -> dict:
    """A valid layout from whatever was sent or stored."""
    raw = raw if isinstance(raw, dict) else {}
    groups, seen_groups = [], set()
    for g in raw.get("groups") or []:
        if not isinstance(g, dict) or len(groups) >= MAX_GROUPS:
            continue
        gid = str(g.get("id") or "")
        if not _ID.match(gid) or gid in seen_groups:
            continue
        ids = []
        for iid in g.get("ids") or []:
            if isinstance(iid, str) and _INSTRUMENT.match(iid) and iid not in ids and len(ids) < MAX_PER_GROUP:
                ids.append(iid)
        title = " ".join(str(g.get("title") or "").split())[:40] or "My instruments"
        groups.append({"id": gid, "title": title, "ids": ids})
        seen_groups.add(gid)

    valid = set(BUILT_IN) | {f"group:{g['id']}" for g in groups}
    tiles, seen = [], set()
    for t in raw.get("tiles") or []:
        if not isinstance(t, dict) or t.get("id") not in valid or t["id"] in seen:
            continue
        size = t.get("size") if t.get("size") in SIZES else "m"
        tiles.append({"id": t["id"], "size": size, "hidden": bool(t.get("hidden"))})
        seen.add(t["id"])
    # Tiles the saved layout doesn't mention (new groups, tiles added since) go at the end
    for tid in [f"group:{g['id']}" for g in groups] + DEFAULT_ORDER:
        if tid not in seen:
            tiles.append({"id": tid, "size": "s" if tid.startswith("group:") else BUILT_IN[tid][1], "hidden": False})
            seen.add(tid)
    return {"tiles": tiles, "groups": groups}


def get(username: str) -> dict:
    saved = store.get(NAMESPACE, username)
    if isinstance(saved, dict):
        return sanitize(saved)
    layout = default_layout()
    # Carry over what the user switched off under the old Settings > Dashboard widgets
    old = store.get("widgets", username)
    if isinstance(old, list):
        off = {LEGACY_WIDGETS[w["id"]] for w in old if isinstance(w, dict) and w.get("id") in LEGACY_WIDGETS
               and w.get("enabled") is False}
        for t in layout["tiles"]:
            t["hidden"] = t["id"] in off
    return layout


def save(username: str, layout) -> dict:
    clean = sanitize(layout)
    store.put(NAMESPACE, username, clean)
    return clean


def reset(username: str) -> dict:
    store.put(NAMESPACE, username, default_layout())
    return default_layout()
