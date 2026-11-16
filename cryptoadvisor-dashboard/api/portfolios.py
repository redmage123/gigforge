"""Portfolios API: manage portfolios, share them, and record cash movements.

The app sends the selected portfolio in the X-Portfolio header ("all" = the user's own portfolios
combined); `scope_of` turns it into a services.portfolios.Scope for any endpoint.
"""

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
    username = get_username(request)
    if not portfolios.get_own(username, pid):
        raise HTTPException(404, "Portfolio not found (only its owner can change this)")
    return username


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
    return {"own": [{**p, "role": "owner", "owner": username, "trade_count": counts.get(p["id"], 0),
                     "shared_with": len(portfolios.members(username, p["id"])["members"])} for p in own],
            "shared": shared}


@router.post("/")
async def create_portfolio(request: Request, body: PortfolioBody):
    try:
        return portfolios.create(get_username(request), body.name or "", body.kind or "personal",
                                 body.client_name or "", body.benchmark or "index:SPX", body.notes or "")
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.put("/{pid}")
async def update_portfolio(request: Request, pid: str, body: PortfolioBody):
    username = _owner_only(request, pid)
    try:
        return portfolios.update(username, pid, body.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.delete("/{pid}")
async def delete_portfolio(request: Request, pid: str, move_to: str | None = None):
    username = _owner_only(request, pid)
    try:
        return portfolios.delete(username, pid, move_to)
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
        return portfolios.grant(username, pid, body.username, body.role)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.delete("/{pid}/members/{member}")
async def remove_member(request: Request, pid: str, member: str):
    return portfolios.revoke(_owner_only(request, pid), pid, member)


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
        return cash.add_entry(scope.owner, pid, body.type, body.amount, body.date, body.notes)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.delete("/cash/{entry_id}")
async def remove_cash(request: Request, entry_id: str):
    scope = scope_of(request)
    writable(scope, None if scope.combined else scope.single)
    if not cash.remove_entry(scope.owner, entry_id, scope.portfolio_ids):
        raise HTTPException(404, "Entry not found")
    return {"status": "removed"}
