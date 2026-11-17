"""Portfolios: several books per user (own, client, model), combined views, and access control.

Records live in the owner's per-user data ("portfolios"). Every trade carries a portfolio_id; trades
from before portfolios existed belong to the owner's default portfolio. Ids are globally unique, so a
portfolio shared with another user (manager: can trade; viewer: read-only, e.g. the client) is found
through the grants index without knowing its owner.

A Scope is what an API request works on: one portfolio, or all of the requester's own portfolios
combined. Shared portfolios are never mixed into "all" — another person's book stays separate.
"""

import json
import re
import threading
import time
import uuid
from dataclasses import dataclass

from services.user_data import load_user_data, save_user_data
from services import store

NAMESPACE = "portfolios"
KINDS = ("personal", "client", "model")
ROLES = ("manager", "viewer")  # granted roles; the owner is implicit
MAX_PORTFOLIOS = 50
_lock = threading.Lock()


class AccessError(Exception):
    """The requester can't see (404) or can't change (403) this portfolio."""

    def __init__(self, message: str, status: int):
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class Scope:
    owner: str                    # whose data files hold the trades
    portfolio_ids: tuple          # one id, or every own portfolio when combined
    role: str                     # owner | manager | viewer
    combined: bool = False

    @property
    def can_write(self) -> bool:
        return self.role in ("owner", "manager")

    @property
    def single(self) -> str | None:
        return None if self.combined else self.portfolio_ids[0]


# ── Records ────────────────────────────────────────────────────────────────

def _new_id() -> str:
    return "p" + uuid.uuid4().hex[:11]


def _clean(text, limit: int) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()[:limit]


def list_own(username: str) -> list[dict]:
    """The owner's portfolios; a person (not a firm) gets a default one on first use."""
    with _lock:
        rows = load_user_data(username, NAMESPACE)
        rows = rows if isinstance(rows, list) else []
        if not username.startswith("firm-") and not any(r.get("default") for r in rows):
            rows.insert(0, {"id": _new_id(), "name": "My portfolio", "kind": "personal", "client_name": "",
                            "benchmark": "index:SPX", "notes": "", "default": True, "created_at": time.time()})
            save_user_data(username, NAMESPACE, rows)
        return rows


def default_id(username: str) -> str:
    return next(r["id"] for r in list_own(username) if r.get("default"))


def get_own(username: str, pid: str) -> dict | None:
    return next((r for r in list_own(username) if r["id"] == pid), None)


def _validate(fields: dict) -> dict:
    out = {}
    if "name" in fields:
        out["name"] = _clean(fields["name"], 60)
        if not out["name"]:
            raise ValueError("Give the portfolio a name")
    if "kind" in fields:
        if fields["kind"] not in KINDS:
            raise ValueError(f"Type must be one of {', '.join(KINDS)}")
        out["kind"] = fields["kind"]
    if "client_name" in fields:
        out["client_name"] = _clean(fields["client_name"], 80)
    if "notes" in fields:
        out["notes"] = str(fields["notes"] or "")[:1000]
    if "benchmark" in fields:
        b = str(fields["benchmark"] or "").strip()
        if b and not re.fullmatch(r"[a-z]+:[A-Za-z0-9.^=_-]+", b):
            raise ValueError("Benchmark must be an instrument id like index:SPX")
        out["benchmark"] = b or "index:SPX"
    for key in ("targets", "drift_threshold", "target_cash_pct"):  # set through services.allocation
        if key in fields:
            out[key] = fields[key]
    return out


def create(username: str, name: str, kind: str = "personal", client_name: str = "", benchmark: str = "index:SPX",
           notes: str = "") -> dict:
    rows = list_own(username)
    if len(rows) >= MAX_PORTFOLIOS:
        raise ValueError(f"You can have up to {MAX_PORTFOLIOS} portfolios")
    rec = {"id": _new_id(), "kind": "personal", "client_name": "", "benchmark": "index:SPX", "notes": "",
           "default": False, "created_at": time.time(),
           **_validate({"name": name, "kind": kind, "client_name": client_name, "benchmark": benchmark, "notes": notes})}
    if any(r["name"].lower() == rec["name"].lower() for r in rows):
        raise ValueError(f"You already have a portfolio called '{rec['name']}'")
    with _lock:
        save_user_data(username, NAMESPACE, rows + [rec])
    return rec


def update(owner: str, pid: str, fields: dict) -> dict:
    rows = list_own(owner)
    rec = next((r for r in rows if r["id"] == pid), None)
    if not rec:
        raise AccessError("Portfolio not found", 404)
    changes = _validate(fields)
    if "name" in changes and any(r["id"] != pid and r["name"].lower() == changes["name"].lower() for r in rows):
        raise ValueError(f"You already have a portfolio called '{changes['name']}'")
    rec.update(changes)
    with _lock:
        save_user_data(owner, NAMESPACE, rows)
    return rec


def delete(owner: str, pid: str, move_to: str | None = None) -> dict:
    """Delete a portfolio. Its trades move to `move_to`, or are deleted if it is None."""
    from services import cash, trades

    rows = list_own(owner)
    rec = next((r for r in rows if r["id"] == pid), None)
    if not rec:
        raise AccessError("Portfolio not found", 404)
    if rec.get("default"):
        raise ValueError("The default portfolio can't be deleted (rename it instead)")
    if move_to and not any(r["id"] == move_to for r in rows if r["id"] != pid):
        raise ValueError("Pick one of your other portfolios to move the trades to")
    all_trades = trades.get_trades(owner)
    mine = [t for t in all_trades if t["portfolio_id"] == pid]
    if move_to:
        for t in mine:
            t["portfolio_id"] = move_to
        kept = all_trades
    else:
        kept = [t for t in all_trades if t["portfolio_id"] != pid]
    trades.save_trades(owner, kept)
    cash.reassign(owner, pid, move_to)
    from services import brokers
    brokers.forget(owner, pid)
    with _lock:
        save_user_data(owner, NAMESPACE, [r for r in rows if r["id"] != pid])
    _drop_grants(pid)
    return {"deleted": pid, "trades_moved" if move_to else "trades_deleted": len(mine)}


# ── Sharing ────────────────────────────────────────────────────────────────

def _load_grants() -> dict:
    return store.get(store.SHARED, "portfolio_grants", {})


def _save_grants(data: dict) -> None:
    store.put(store.SHARED, "portfolio_grants", data)


def grant(owner: str, pid: str, grantee: str, role: str) -> dict:
    from services.auth import load_users

    if role not in ROLES:
        raise ValueError(f"Role must be one of {', '.join(ROLES)}")
    if not get_own(owner, pid):
        raise AccessError("Portfolio not found", 404)
    grantee = grantee.strip()
    if grantee == owner:
        raise ValueError("You already own this portfolio")
    if not any(u["username"] == grantee for u in load_users()):
        raise ValueError(f"No AssetAdvisor user called '{grantee}'. They need to register first.")
    with _lock:
        data = _load_grants()
        entry = data.setdefault(pid, {"owner": owner, "members": {}})
        entry["members"][grantee] = {"role": role, "granted_at": time.time()}
        _save_grants(data)
    return members(owner, pid)


def revoke(owner: str, pid: str, grantee: str) -> dict:
    if not get_own(owner, pid):
        raise AccessError("Portfolio not found", 404)
    with _lock:
        data = _load_grants()
        data.get(pid, {}).get("members", {}).pop(grantee, None)
        _save_grants(data)
    return members(owner, pid)


def leave(username: str, pid: str) -> None:
    with _lock:
        data = _load_grants()
        data.get(pid, {}).get("members", {}).pop(username, None)
        _save_grants(data)


def members(owner: str, pid: str) -> dict:
    entry = _load_grants().get(pid, {})
    return {"portfolio_id": pid, "members": [{"username": u, **m} for u, m in sorted(entry.get("members", {}).items())]}


def shared_with(username: str) -> list[dict]:
    """Portfolios other users have shared with this user: [{owner, role, ...record}]."""
    out = []
    for pid, entry in _load_grants().items():
        m = entry.get("members", {}).get(username)
        if m:
            rec = get_own(entry["owner"], pid)
            if rec:
                out.append({**rec, "owner": entry["owner"], "role": m["role"], "default": False})
    return out


def _drop_grants(pid: str) -> None:
    with _lock:
        data = _load_grants()
        if data.pop(pid, None) is not None:
            _save_grants(data)


def forget_user(username: str) -> None:
    """Account deletion: remove their grants and everything shared by them."""
    with _lock:
        data = _load_grants()
        data = {pid: e for pid, e in data.items() if e.get("owner") != username}
        for e in data.values():
            e.get("members", {}).pop(username, None)
        _save_grants(data)


# ── Scope resolution ───────────────────────────────────────────────────────

FIRM_WRITE_ROLES = ("admin", "pm")


def resolve(username: str, ref: str | None) -> Scope:
    """"all"/None -> every own portfolio combined; "firm:<id>" -> that firm's portfolios combined;
    an id -> that portfolio if owned, in one of the user's firms, or shared with them."""
    from services import firms

    own = list_own(username)
    if not ref or ref == "all":
        return Scope(username, tuple(r["id"] for r in own), "owner", combined=len(own) > 1)
    if any(r["id"] == ref for r in own):
        return Scope(username, (ref,), "owner")
    if ref.startswith("firm:"):
        fid = ref[5:]
        role = firms.membership(username, fid) if firms.db.available() else None
        if not role:
            raise AccessError("Portfolio not found", 404)
        pids = tuple(r["id"] for r in firms.firm_portfolios(fid))
        if not pids:
            raise AccessError("This firm has no portfolios yet", 404)
        return Scope(firms.owner_key(fid), pids, "manager" if role in FIRM_WRITE_ROLES else "viewer", combined=True)
    fid = firms.portfolio_firm(ref)
    if fid:
        role = firms.membership(username, fid)
        if role:
            return Scope(firms.owner_key(fid), (ref,), "manager" if role in FIRM_WRITE_ROLES else "viewer")
    entry = _load_grants().get(ref)
    m = entry and entry.get("members", {}).get(username)
    if m and get_own(entry["owner"], ref):
        return Scope(entry["owner"], (ref,), m["role"])
    raise AccessError("Portfolio not found", 404)


def write_target(scope: Scope, requested: str | None = None) -> str:
    """The portfolio a new trade goes into. In a combined view the caller must name one (default otherwise)."""
    if not scope.can_write:
        raise AccessError("You have view-only access to this portfolio", 403)
    if scope.single:
        if requested and requested != scope.single:
            raise ValueError("That trade belongs to a different portfolio than the one selected")
        return scope.single
    if requested:
        if requested not in scope.portfolio_ids:
            raise AccessError("Portfolio not found", 404)
        return requested
    if scope.owner.startswith("firm-"):
        raise ValueError("Pick which firm portfolio this goes into")
    return default_id(scope.owner)


def manage_owner(username: str, pid: str) -> str | None:
    """Owner key whose portfolio record the user may edit, delete or share: their own, or a firm
    portfolio where they are admin or PM."""
    from services import firms

    if get_own(username, pid):
        return username
    fid = firms.portfolio_firm(pid)
    if fid and firms.membership(username, fid) in FIRM_WRITE_ROLES:
        return firms.owner_key(fid)
    return None


def rehome_grants(pid: str, new_owner: str) -> None:
    """A portfolio moved to another owner (e.g. into a firm): keep its sharing grants pointing at it."""
    def fix(data):
        if isinstance(data, dict) and pid in data:
            data[pid]["owner"] = new_owner
        return data
    store.update(store.SHARED, "portfolio_grants", fix, {})


def request_scope(request, username: str) -> Scope:
    """Scope from the X-Portfolio header (set by the app's portfolio switcher) or ?portfolio=."""
    ref = request.headers.get("x-portfolio") or request.query_params.get("portfolio") or "all"
    return resolve(username, ref)
