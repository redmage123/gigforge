"""Portfolios API: manage portfolios, share them, and record cash movements.

The app sends the selected portfolio in the X-Portfolio header ("all" = the user's own portfolios
combined); `scope_of` turns it into a services.portfolios.Scope for any endpoint.
"""

import re

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from services import cash, portfolios
from services.portfolios import AccessError, Scope
from services.user_data import get_username

router = APIRouter()


def scope_of(request: Request, ref: str | None = None) -> Scope:
    username = get_username(request)
    try:
        return portfolios.resolve(username, ref) if ref else portfolios.request_scope(request, username)
    except AccessError as exc:
        raise HTTPException(exc.status, str(exc))


def writable(scope: Scope, requested: str | None = None) -> str:
    try:
        return portfolios.write_target(scope, requested)
    except AccessError as exc:
        raise HTTPException(exc.status, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


def _owner_only(request: Request, pid: str) -> str:
    """Owner key of a portfolio the user may manage (their own, or a firm one as admin/PM)."""
    owner = portfolios.manage_owner(get_username(request), pid)
    if not owner:
        raise HTTPException(404, "Portfolio not found (only its owner or the firm's admins and PMs can change this)")
    return owner


def _audit(request: Request, action: str, owner: str, target: str | None = None, **detail) -> None:
    from services import audit_events, firms

    audit_events.from_request(request, action, firm_id=firms.firm_of_owner(owner), target=target, detail=detail)


class PortfolioBody(BaseModel):
    name: str | None = None
    kind: str | None = None
    client_name: str | None = None
    benchmark: str | None = None
    notes: str | None = None


@router.get("/")
async def list_portfolios(request: Request):
    from services.trades import get_trades

    username = get_username(request)
    own = portfolios.list_own(username)
    counts = {}
    for t in get_trades(username):
        counts[t["portfolio_id"]] = counts.get(t["portfolio_id"], 0) + 1
    shared = portfolios.shared_with(username)
    for p in shared:
        p["trade_count"] = sum(1 for t in get_trades(p["owner"], [p["id"]]))
    from services import firms

    firm_list = []
    for f in firms.my_firms(username):
        fk = firms.owner_key(f["id"])
        fcounts = {}
        for t in get_trades(fk):
            fcounts[t["portfolio_id"]] = fcounts.get(t["portfolio_id"], 0) + 1
        write = f["role"] in portfolios.FIRM_WRITE_ROLES
        firm_list.append({"id": f["id"], "name": f["name"], "slug": f["slug"], "role": f["role"], "portfolios": [
            {**p, "owner": fk, "firm_id": f["id"], "firm_name": f["name"], "role": "manager" if write else "viewer",
             "can_manage": write, "trade_count": fcounts.get(p["id"], 0),
             "shared_with": len(portfolios.members(fk, p["id"])["members"])} for p in firms.firm_portfolios(f["id"])]})
    return {"own": [{**p, "role": "owner", "owner": username, "trade_count": counts.get(p["id"], 0),
                     "shared_with": len(portfolios.members(username, p["id"])["members"])} for p in own],
            "shared": shared, "firms": firm_list}


@router.post("/")
async def create_portfolio(request: Request, body: PortfolioBody):
    try:
        out = portfolios.create(get_username(request), body.name or "", body.kind or "personal",
                                body.client_name or "", body.benchmark or "index:SPX", body.notes or "")
        _audit(request, "portfolio.create", get_username(request), out["id"], name=out["name"])
        return out
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.put("/{pid}")
async def update_portfolio(request: Request, pid: str, body: PortfolioBody):
    username = _owner_only(request, pid)
    try:
        out = portfolios.update(username, pid, body.model_dump(exclude_none=True))
        _audit(request, "portfolio.update", username, pid, **body.model_dump(exclude_none=True))
        return out
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.delete("/{pid}")
async def delete_portfolio(request: Request, pid: str, move_to: str | None = None):
    username = _owner_only(request, pid)
    try:
        out = portfolios.delete(username, pid, move_to)
        _audit(request, "portfolio.delete", username, pid, move_to=move_to)
        return out
    except ValueError as exc:
        raise HTTPException(400, str(exc))


class MoveBody(BaseModel):
    trade_ids: list[str]
    to: str


@router.post("/move-trades")
async def move_trades(request: Request, body: MoveBody):
    """Move trades between the user's own portfolios."""
    from services.trades import get_trades, save_trades

    username = get_username(request)
    if not portfolios.get_own(username, body.to):
        raise HTTPException(404, "Target portfolio not found")
    rows, moved = get_trades(username), 0
    wanted = set(body.trade_ids)
    for t in rows:
        if t["id"] in wanted:
            t["portfolio_id"], moved = body.to, moved + 1
    save_trades(username, rows)
    return {"moved": moved}


# ── Sharing ────────────────────────────────────────────────────────────────

class GrantBody(BaseModel):
    username: str
    role: str


@router.get("/{pid}/members")
async def list_members(request: Request, pid: str):
    return portfolios.members(_owner_only(request, pid), pid)


@router.post("/{pid}/members")
async def add_member(request: Request, pid: str, body: GrantBody):
    username = _owner_only(request, pid)
    try:
        out = portfolios.grant(username, pid, body.username, body.role)
        _audit(request, "portfolio.share", username, pid, grantee=body.username, role=body.role)
        return out
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.delete("/{pid}/members/{member}")
async def remove_member(request: Request, pid: str, member: str):
    owner = _owner_only(request, pid)
    _audit(request, "portfolio.unshare", owner, pid, grantee=member)
    return portfolios.revoke(owner, pid, member)


@router.post("/{pid}/leave")
async def leave_portfolio(request: Request, pid: str):
    portfolios.leave(get_username(request), pid)
    return {"left": pid}


# ── Cash ledger ────────────────────────────────────────────────────────────

class CashBody(BaseModel):
    type: str
    amount: float
    date: str = ""
    notes: str = ""
    portfolio_id: str | None = None


@router.get("/cash")
async def list_cash(request: Request):
    scope = scope_of(request)
    return cash.get_entries(scope.owner, scope.portfolio_ids)


@router.post("/cash")
async def add_cash(request: Request, body: CashBody):
    scope = scope_of(request)
    pid = writable(scope, body.portfolio_id)
    try:
        out = cash.add_entry(scope.owner, pid, body.type, body.amount, body.date, body.notes)
        _audit(request, "cash.add", scope.owner, pid, type=body.type, amount=body.amount, date=body.date)
        return out
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.delete("/cash/{entry_id}")
async def remove_cash(request: Request, entry_id: str):
    scope = scope_of(request)
    writable(scope, None if scope.combined else scope.single)
    if not cash.remove_entry(scope.owner, entry_id, scope.portfolio_ids):
        raise HTTPException(404, "Entry not found")
    _audit(request, "cash.delete", scope.owner, entry_id)
    return {"status": "removed"}


# ── Performance, allocation, statements (one portfolio, or own combined for performance) ──

def _single(request: Request) -> Scope:
    scope = scope_of(request)
    if scope.combined:
        raise HTTPException(400, "Pick one portfolio in the switcher for this")
    return scope


@router.get("/performance")
async def get_performance(request: Request, period: str = "all", benchmark: str | None = None):
    from services.performance import performance

    if period not in ("1m", "3m", "ytd", "1y", "all"):
        raise HTTPException(400, "period must be 1m, 3m, ytd, 1y or all")
    scope = scope_of(request)
    rec = portfolios.get_own(scope.owner, scope.single or portfolios.default_id(scope.owner)) or {}
    return await performance(scope.owner, scope.portfolio_ids, benchmark or rec.get("benchmark") or "index:SPX", period)


class TargetsBody(BaseModel):
    targets: list[dict]
    drift_threshold: float | None = None


@router.get("/allocation")
async def get_allocation(request: Request):
    from services.allocation import analyze

    scope = _single(request)
    return await analyze(scope.owner, scope.single)


@router.put("/allocation")
async def put_targets(request: Request, body: TargetsBody):
    from services.allocation import analyze, set_targets

    scope = _single(request)
    writable(scope)
    try:
        await set_targets(scope.owner, scope.single, body.targets, body.drift_threshold)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    _audit(request, "allocation.targets", scope.owner, scope.single, targets=body.targets, threshold=body.drift_threshold)
    return await analyze(scope.owner, scope.single)


class OrdersBody(BaseModel):
    orders: list[dict]


@router.post("/allocation/log-orders")
async def log_rebalance(request: Request, body: OrdersBody):
    from services.allocation import log_orders

    scope = _single(request)
    writable(scope)
    clean = []
    for o in body.orders[:100]:
        try:
            clean.append({"instrument_id": str(o["instrument_id"]), "side": "buy" if o["side"] == "buy" else "sell",
                          "quantity": float(o["quantity"])})
        except (KeyError, TypeError, ValueError):
            raise HTTPException(400, "Each order needs instrument_id, side and quantity")
        if clean[-1]["quantity"] <= 0:
            raise HTTPException(400, "Quantities must be positive")
    try:
        done = await log_orders(scope.owner, scope.single, clean, get_username(request))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    _audit(request, "trade.rebalance", scope.owner, scope.single, orders=clean)
    return {"logged": len(done), "trades": done}


@router.get("/statements")
async def list_statements(request: Request):
    from services import statements

    scope = _single(request)
    return {"statements": statements.list_stored(scope.owner, scope.single)}


def _pdf(data: bytes, name: str):
    from fastapi.responses import Response

    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", name)[:80]
    return Response(data, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{safe}"',
                                                                 "Cache-Control": "private, no-store"})


@router.get("/statements/{month}.pdf")
async def stored_statement(request: Request, month: str):
    from services import statements

    scope = _single(request)
    data = statements.read_stored(scope.owner, scope.single, month)
    if not data:
        raise HTTPException(404, "No statement for that month")
    rec = portfolios.get_own(scope.owner, scope.single)
    return _pdf(data, f"{rec['name']}-{month}.pdf")


@router.get("/statement.pdf")
async def statement_on_demand(request: Request, start: str, end: str):
    from datetime import date as _date

    from services import statements
    from services.auth import load_users

    scope = _single(request)
    try:
        s, e = _date.fromisoformat(start), _date.fromisoformat(end)
    except ValueError:
        raise HTTPException(400, "Dates must be YYYY-MM-DD")
    if s > e:
        raise HTTPException(400, "Start must be before end")
    if (e - s).days > 3700:
        raise HTTPException(400, "Pick a period of up to 10 years")
    names = {u["username"]: " ".join(filter(None, [u.get("first_name"), u.get("last_name")])) for u in load_users()}
    data = await statements.build_pdf(scope.owner, scope.single, s, e, names.get(scope.owner) or scope.owner)
    rec = portfolios.get_own(scope.owner, scope.single)
    return _pdf(data, f"{rec['name']}-{start}-to-{end}.pdf")


# Static paths (/allocation, /cash, /statements…) must win over /{pid}: FastAPI matches in order
router.routes.sort(key=lambda r: "{pid}" in getattr(r, "path", ""))
