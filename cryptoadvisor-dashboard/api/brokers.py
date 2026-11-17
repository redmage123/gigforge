"""Broker connections API: Alpaca keys, Plaid Link, SnapTrade portal; sync and disconnect."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from api.portfolios import scope_of, writable
from services import brokers
from services.db import Unavailable
from services.user_data import get_username

router = APIRouter()


def _guard(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except brokers.BrokerError as exc:
        raise HTTPException(exc.status, str(exc))
    except Unavailable:
        raise HTTPException(503, "Broker connections need the database, which isn't available here.")


async def _aguard(coro):
    try:
        return await coro
    except brokers.BrokerError as exc:
        raise HTTPException(exc.status, str(exc))
    except Unavailable:
        raise HTTPException(503, "Broker connections need the database, which isn't available here.")


def _own_connection(request: Request, cid: str):
    """The connection, if it belongs to the selected scope and the user may change that portfolio."""
    scope = scope_of(request)
    conn = next((c for c in _guard(brokers.list_for, scope.owner) if c["id"] == cid), None)
    if not conn or conn["portfolio_id"] not in scope.portfolio_ids:
        raise HTTPException(404, "Connection not found")
    writable(scope, None if scope.combined else scope.single)
    return scope, conn


@router.get("/")
async def list_connections(request: Request):
    scope = scope_of(request)
    return {"configured": brokers.configured(), "connections": _guard(brokers.list_for, scope.owner, scope.portfolio_ids),
            "can_write": scope.can_write}


class AlpacaBody(BaseModel):
    key_id: str
    secret_key: str
    paper: bool = False
    label: str = ""
    portfolio_id: str | None = None


@router.post("/alpaca")
async def connect_alpaca(request: Request, body: AlpacaBody):
    scope = scope_of(request)
    pid = writable(scope, body.portfolio_id)
    conn = await _aguard(brokers.connect_alpaca(scope.owner, pid, body.key_id, body.secret_key, body.paper, body.label,
                                                get_username(request)))
    first = await _aguard(brokers.sync(conn["id"], get_username(request)))
    return {"connection": conn, "first_sync": first}


@router.post("/plaid/link-token")
async def plaid_link_token(request: Request):
    if not scope_of(request).can_write:
        raise HTTPException(403, "You have view-only access to this portfolio")
    return {"link_token": _guard(brokers.plaid_link_token, get_username(request))}


class PlaidBody(BaseModel):
    public_token: str
    institution: str = ""
    portfolio_id: str | None = None


@router.post("/plaid/exchange")
async def plaid_exchange(request: Request, body: PlaidBody):
    scope = scope_of(request)
    pid = writable(scope, body.portfolio_id)
    conn = _guard(brokers.connect_plaid, scope.owner, pid, body.public_token, body.institution, get_username(request))
    first = await _aguard(brokers.sync(conn["id"], get_username(request)))
    return {"connection": conn, "first_sync": first}


class PortalBody(BaseModel):
    portfolio_id: str | None = None


@router.post("/snaptrade/portal")
async def snaptrade_portal(request: Request, body: PortalBody):
    scope = scope_of(request)
    pid = writable(scope, body.portfolio_id)
    return _guard(brokers.snaptrade_portal, scope.owner, pid, get_username(request))


@router.post("/{cid}/sync")
async def sync_now(request: Request, cid: str):
    _own_connection(request, cid)
    return await _aguard(brokers.sync(cid, get_username(request)))


@router.delete("/{cid}")
async def disconnect(request: Request, cid: str, delete_imported: bool = False):
    scope, _ = _own_connection(request, cid)
    return _guard(brokers.remove, scope.owner, cid, get_username(request), delete_imported)


router.routes.sort(key=lambda r: "{cid}" in getattr(r, "path", ""))
