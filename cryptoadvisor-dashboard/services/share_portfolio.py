"""Shareable portfolio snapshots: generate, list, view publicly, and revoke share links.

A link is a frozen snapshot taken when it is generated. It holds only what the owner chose to show:
allocation weights always; dollar values and returns only when asked for. No username, account,
portfolio name, quantity, cost basis, trade or wallet data is stored in the snapshot. Tokens are
192-bit random values, so links can't be guessed or enumerated; a revoked token is deleted.
"""

import re
import secrets
from datetime import datetime, timezone

from services import store

KEY = "shared_portfolios"
MAX_LINKS_PER_USER = 20
MAX_TITLE = 60
_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{20,64}$")


class ShareError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _clean_title(title: str | None) -> str:
    t = re.sub(r"[\x00-\x1f<>]", "", (title or "").strip())[:MAX_TITLE].strip()
    return t or "Portfolio"


def build_snapshot(positions: list[dict], show_values: bool, show_returns: bool) -> dict:
    """Public snapshot from open positions (services.trades.portfolio rows). Unpriced positions are left out."""
    priced = [p for p in positions if p.get("market_value") is not None and p.get("quantity")]
    gross = sum(abs(p["market_value"]) for p in priced)
    if not priced or gross <= 0:
        raise ShareError("There are no open positions with a current price to share yet")
    holdings, by_class = [], {}
    for p in priced:
        w = abs(p["market_value"]) / gross * 100
        row = {"symbol": p.get("symbol"), "name": p.get("name"), "asset_class": p.get("asset_class"),
               "weight_pct": round(w, 2)}
        if p.get("side") == "short":
            row["side"] = "short"
        if show_values:
            row["value_usd"] = round(p["market_value"], 2)
        if show_returns:
            row["return_pct"] = p.get("unrealized_pct")
        holdings.append(row)
        by_class[row["asset_class"]] = by_class.get(row["asset_class"], 0.0) + w
    holdings.sort(key=lambda r: r["weight_pct"], reverse=True)
    snap = {"holdings": holdings,
            "allocation": [{"asset_class": k, "weight_pct": round(v, 2)} for k, v in sorted(by_class.items(), key=lambda kv: -kv[1])]}
    if show_values:
        snap["total_value"] = round(sum(p["market_value"] for p in priced), 2)
    if show_returns:
        cost = sum(p.get("cost_basis") or 0 for p in priced)
        upnl = sum(p.get("unrealized_pnl") or 0 for p in priced)
        snap["total_return_pct"] = round(upnl / cost * 100, 2) if cost else None
    return snap


def create_share(username: str, snapshot: dict, title: str | None, show_values: bool, show_returns: bool) -> dict:
    """Store a snapshot under a new random token. Returns the owner's view of the new link."""
    token = secrets.token_urlsafe(24)
    entry = {
        "username": username, "title": _clean_title(title), "show_values": bool(show_values),
        "show_returns": bool(show_returns), "created_at": _now(), **snapshot,
    }

    def add(shares: dict) -> dict:
        mine = sum(1 for e in shares.values() if isinstance(e, dict) and e.get("username") == username)
        if mine >= MAX_LINKS_PER_USER:
            raise ShareError(f"You can have up to {MAX_LINKS_PER_USER} active share links. Revoke one first.")
        shares[token] = entry
        return shares

    store.update(store.SHARED, KEY, add, {})
    return _owner_row(token, entry)


def _owner_row(token: str, e: dict) -> dict:
    return {"token": token, "title": e.get("title") or "Portfolio", "show_values": bool(e.get("show_values")),
            "show_returns": bool(e.get("show_returns")), "holdings_count": len(e.get("holdings") or []),
            "created_at": e.get("created_at")}


def get_user_shares(username: str) -> list[dict]:
    shares = store.get(store.SHARED, KEY, {}) or {}
    rows = [_owner_row(t, e) for t, e in shares.items() if isinstance(e, dict) and e.get("username") == username]
    return sorted(rows, key=lambda r: r["created_at"] or "", reverse=True)


def get_shared_portfolio(token: str) -> dict | None:
    """The public view of a link, or None if the token is unknown or revoked. Never includes the owner."""
    if not _TOKEN_RE.match(token or ""):
        return None
    e = (store.get(store.SHARED, KEY, {}) or {}).get(token)
    if not isinstance(e, dict) or "holdings" not in e:
        return None
    out = {"title": e.get("title") or "Portfolio", "created_at": e.get("created_at"),
           "show_values": bool(e.get("show_values")), "show_returns": bool(e.get("show_returns")),
           "allocation": e.get("allocation") or []}
    keep = {"symbol", "name", "asset_class", "weight_pct", "side"}
    if out["show_values"]:
        keep.add("value_usd")
        out["total_value"] = e.get("total_value")
    if out["show_returns"]:
        keep.add("return_pct")
        out["total_return_pct"] = e.get("total_return_pct")
    out["holdings"] = [{k: v for k, v in h.items() if k in keep} for h in e.get("holdings") or []]
    return out


def revoke_share(username: str, token: str) -> bool:
    """Delete a link the user owns. False if it doesn't exist or belongs to someone else."""
    done = []

    def drop(shares: dict) -> dict:
        e = shares.get(token)
        if isinstance(e, dict) and e.get("username") == username:
            del shares[token]
            done.append(True)
        return shares

    store.update(store.SHARED, KEY, drop, {})
    return bool(done)
