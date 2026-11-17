"""Broker connections: import trades and cash movements automatically (replaces CSV uploads).

Providers
  * Alpaca     — the user's own read-only API key (paper or live). No account needed on our side.
  * Plaid      — Investments product; one integration for most US brokers. Needs PLAID_CLIENT_ID,
                 PLAID_SECRET and PLAID_ENV (sandbox | production) from a Plaid account.
  * SnapTrade  — brokerage aggregator. Needs SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY.

A connection belongs to one portfolio. Syncs run every 6 hours and on demand; each broker
transaction is imported once (trades and cash entries carry external_id "<provider>:<id>").
Credentials and access tokens are encrypted (Fernet) before they're stored.

Plaid and SnapTrade request/response handling follows their public API documentation and is
covered by tests with recorded-shape responses; it has not yet run against the live services.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import uuid
from datetime import date, datetime, timedelta, timezone

import httpx

from services import audit_events, db, store
from services.crypto_utils import decrypt, encrypt
from services.market import registry

PROVIDERS = ("alpaca", "plaid", "snaptrade")
FIRST_SYNC_DAYS = 730


class BrokerError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def configured() -> dict:
    return {"alpaca": True,
            "plaid": bool(os.getenv("PLAID_CLIENT_ID") and os.getenv("PLAID_SECRET")),
            "snaptrade": bool(os.getenv("SNAPTRADE_CLIENT_ID") and os.getenv("SNAPTRADE_CONSUMER_KEY"))}


# ── Records ────────────────────────────────────────────────────────────────

COLS = "id, owner, portfolio_id, provider, label, meta, status, created_by, created_at, last_sync_at, last_sync_ok, last_sync_msg"


def _row(r) -> dict:
    return {"id": r[0], "owner": r[1], "portfolio_id": r[2], "provider": r[3], "label": r[4], "meta": r[5] or {},
            "status": r[6], "created_by": r[7], "created_at": r[8].isoformat(),
            "last_sync_at": r[9].isoformat() if r[9] else None, "last_sync_ok": r[10], "last_sync_msg": r[11]}


def list_for(owner: str, portfolio_ids=None) -> list[dict]:
    if not db.available():
        return []
    with db.conn() as c:
        rows = c.execute(f"SELECT {COLS} FROM broker_connections WHERE owner = %s ORDER BY created_at", (owner,)).fetchall()
    out = [_row(r) for r in rows]
    for o in out:
        o["meta"] = {k: v for k, v in o["meta"].items() if k in ("paper", "accounts", "institution", "cursor_date")}
    return [o for o in out if portfolio_ids is None or o["portfolio_id"] in portfolio_ids]


def _get(cid: str) -> tuple[dict, dict]:
    with db.conn() as c:
        r = c.execute(f"SELECT {COLS}, secret_enc FROM broker_connections WHERE id = %s", (cid,)).fetchone()
    if not r:
        raise BrokerError("Connection not found", 404)
    return _row(r[:-1]), json.loads(decrypt(r[-1]))


def _create(owner: str, portfolio_id: str, provider: str, label: str, secret: dict, meta: dict, by: str) -> dict:
    cid = "bc" + secrets.token_hex(8)
    with db.conn() as c:
        c.execute("INSERT INTO broker_connections (id, owner, portfolio_id, provider, label, secret_enc, meta, created_by) "
                  "VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb,%s)",
                  (cid, owner, portfolio_id, provider, label[:80], encrypt(json.dumps(secret)), json.dumps(meta), by))
        c.commit()
    from services.firms import firm_of_owner
    audit_events.record(by, "broker.connect", firm_id=firm_of_owner(owner), target=portfolio_id,
                        detail={"provider": provider, "label": label, "connection": cid})
    return next(x for x in list_for(owner) if x["id"] == cid)


def _update(cid: str, *, meta: dict | None = None, secret: dict | None = None, sync: tuple | None = None, status: str | None = None):
    sets, args = [], []
    if meta is not None:
        sets.append("meta = %s::jsonb"); args.append(json.dumps(meta))
    if secret is not None:
        sets.append("secret_enc = %s"); args.append(encrypt(json.dumps(secret)))
    if sync is not None:
        sets.append("last_sync_at = now(), last_sync_ok = %s, last_sync_msg = %s"); args += [sync[0], sync[1][:300]]
    if status is not None:
        sets.append("status = %s"); args.append(status)
    with db.conn() as c:
        c.execute(f"UPDATE broker_connections SET {', '.join(sets)} WHERE id = %s", (*args, cid))
        c.commit()


def remove(owner: str, cid: str, by: str, delete_imported: bool = False) -> dict:
    conn, secret = _get(cid)
    if conn["owner"] != owner:
        raise BrokerError("Connection not found", 404)
    try:  # tell the provider to revoke access where it supports that
        if conn["provider"] == "plaid":
            _plaid_post("/item/remove", {"access_token": secret["access_token"]})
        elif conn["provider"] == "snaptrade":
            _snap("DELETE", "/api/v1/snapTrade/deleteUser", query={"userId": secret["user_id"]})
    except Exception as exc:  # noqa: BLE001 — removing locally must still work
        print(f"[brokers] provider revoke failed for {cid}: {exc}")
    removed = 0
    if delete_imported:
        tag = f"conn:{cid}"

        def drop(rows):
            nonlocal removed
            kept = [r for r in rows or [] if r.get("connection") != tag]
            removed += len(rows or []) - len(kept)
            return kept
        store.update("trades", owner, drop, [])
        store.update("cash", owner, drop, [])
    with db.conn() as c:
        c.execute("DELETE FROM broker_connections WHERE id = %s", (cid,))
        c.commit()
    from services.firms import firm_of_owner
    audit_events.record(by, "broker.disconnect", firm_id=firm_of_owner(owner), target=conn["portfolio_id"],
                        detail={"provider": conn["provider"], "connection": cid, "deleted_imported": delete_imported})
    return {"removed": cid, "imported_records_deleted": removed}


# ── Mapping broker records to journal entries ──────────────────────────────

def instrument_for(symbol: str, kind: str = "") -> str | None:
    """Ticker (+ broker's security type) -> instrument id, or None if we don't know it."""
    s = (symbol or "").strip().upper()
    if not s:
        return None
    k = (kind or "").lower()
    if k in ("crypto", "cryptocurrency") or "/" in s:
        base = s.split("/")[0].replace("-USD", "").replace("USD", "") if "/" in s or s.endswith("USD") else s
        iid = f"crypto:{base}"
        return iid if registry.get(iid) else None
    order = ("etf:", "stock:") if k in ("etf", "et") else ("stock:", "etf:")
    for prefix in order:
        if registry.get(prefix + s.replace(".", "-")):
            return prefix + s.replace(".", "-")
        if registry.get(prefix + s):
            return prefix + s
    return None


def apply(owner: str, portfolio_id: str, cid: str, trades: list[dict], cash: list[dict]) -> tuple[int, int, list[str]]:
    """Add new trades/cash entries (deduplicated by external_id). Returns (trades added, cash added, skipped notes)."""
    from services.cash import TYPES

    skipped, added_t, added_c = [], 0, 0
    tag = f"conn:{cid}"
    clean_t = []
    for t in trades:
        iid = instrument_for(t["symbol"], t.get("kind", ""))
        if not iid:
            skipped.append(f"{t['symbol']}: not an instrument AssetAdvisor knows")
            continue
        if t["side"] not in ("buy", "sell") or t["quantity"] <= 0 or t["price"] <= 0:
            continue
        clean_t.append({"id": uuid.uuid4().hex[:8], "instrument_id": iid, "side": t["side"], "quantity": float(t["quantity"]),
                        "price": float(t["price"]), "fee": float(t.get("fee") or 0), "date": t["date"][:19],
                        "notes": "", "source": t["external_id"].split(":")[0], "external_id": t["external_id"],
                        "connection": tag, "portfolio_id": portfolio_id, "created_at": time.time()})

    def add_trades(rows):
        nonlocal added_t
        rows = rows or []
        have = {r.get("external_id") for r in rows if r.get("external_id")}
        new = [t for t in clean_t if t["external_id"] not in have]
        added_t = len(new)
        return rows + new
    if clean_t:
        store.update("trades", owner, add_trades, [])

    clean_c = [{"id": uuid.uuid4().hex[:8], "portfolio_id": portfolio_id, "type": e["type"], "amount": round(abs(float(e["amount"])), 2),
                "date": e["date"][:10], "notes": e.get("notes", "")[:300], "instrument_id": "", "external_id": e["external_id"],
                "connection": tag, "created_at": time.time()} for e in cash if e["type"] in TYPES and abs(float(e["amount"])) > 0]

    def add_cash(rows):
        nonlocal added_c
        rows = rows or []
        have = {r.get("external_id") for r in rows if r.get("external_id")}
        new = [e for e in clean_c if e["external_id"] not in have]
        added_c = len(new)
        return rows + new
    if clean_c:
        store.update("cash", owner, add_cash, [])
    return added_t, added_c, skipped


# ── Alpaca ─────────────────────────────────────────────────────────────────

def _alpaca_base(paper: bool) -> str:
    return "https://paper-api.alpaca.markets" if paper else "https://api.alpaca.markets"


async def connect_alpaca(owner: str, portfolio_id: str, key_id: str, secret_key: str, paper: bool, label: str, by: str) -> dict:
    if not key_id.strip() or not secret_key.strip():
        raise BrokerError("Enter the API key ID and secret")
    headers = {"APCA-API-KEY-ID": key_id.strip(), "APCA-API-SECRET-KEY": secret_key.strip()}
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{_alpaca_base(paper)}/v2/account", headers=headers)
    if r.status_code in (401, 403):
        raise BrokerError("Alpaca didn't accept those keys" + (" (are they paper-trading keys?)" if not paper else ""))
    if r.status_code != 200:
        raise BrokerError(f"Couldn't reach Alpaca ({r.status_code})")
    acct = r.json()
    return _create(owner, portfolio_id, "alpaca", label or f"Alpaca {'paper' if paper else 'live'} {acct.get('account_number', '')[-4:]}",
                   {"key_id": key_id.strip(), "secret_key": secret_key.strip()}, {"paper": paper}, by)


ALPACA_CASH = {"CSD": "deposit", "CSW": "withdrawal", "DIV": "dividend", "DIVCGL": "dividend", "DIVCGS": "dividend",
               "DIVNRA": "fee", "DIVROC": "dividend", "DIVTXEX": "dividend", "INT": "interest", "FEE": "fee", "CFEE": "fee"}


def map_alpaca(activities: list[dict]) -> tuple[list[dict], list[dict]]:
    trades, cash = [], []
    for a in activities:
        at = a.get("activity_type")
        if at == "FILL":
            side = "buy" if a.get("side") == "buy" else "sell"
            trades.append({"symbol": a.get("symbol", ""), "kind": "crypto" if "/" in a.get("symbol", "") else "",
                           "side": side, "quantity": float(a.get("qty") or 0), "price": float(a.get("price") or 0),
                           "fee": 0.0, "date": (a.get("transaction_time") or "")[:19].replace("T", " "),
                           "external_id": f"alpaca:{a['id']}"})
        elif at in ALPACA_CASH:
            amt = float(a.get("net_amount") or 0)
            kind = ALPACA_CASH[at]
            if kind == "dividend" and amt < 0:
                kind = "fee"  # e.g. withholding on a dividend
            cash.append({"type": kind, "amount": abs(amt), "date": a.get("date") or (a.get("transaction_time") or "")[:10],
                         "notes": f"{at} {a.get('symbol') or ''}".strip(), "external_id": f"alpaca:{a['id']}"})
    return trades, cash


async def _sync_alpaca(conn: dict, secret: dict) -> tuple[list, list, dict]:
    headers = {"APCA-API-KEY-ID": secret["key_id"], "APCA-API-SECRET-KEY": secret["secret_key"]}
    params = {"activity_types": "FILL," + ",".join(ALPACA_CASH), "direction": "asc", "page_size": 100}
    meta = dict(conn["meta"])
    if meta.get("cursor"):
        params["page_token"] = meta["cursor"]
    else:
        params["after"] = (datetime.now(timezone.utc) - timedelta(days=FIRST_SYNC_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    acts = []
    async with httpx.AsyncClient(timeout=20) as c:
        for _ in range(100):  # pages
            r = await c.get(f"{_alpaca_base(meta.get('paper', False))}/v2/account/activities", headers=headers, params=params)
            if r.status_code in (401, 403):
                raise BrokerError("Alpaca no longer accepts this key; reconnect with a new one.")
            r.raise_for_status()
            page = r.json()
            acts += page
            if len(page) < params["page_size"]:
                break
            params["page_token"] = page[-1]["id"]
            params.pop("after", None)
    if acts:
        meta["cursor"] = acts[-1]["id"]
    t, cs = map_alpaca(acts)
    return t, cs, meta


# ── Plaid ──────────────────────────────────────────────────────────────────

def _plaid_url() -> str:
    env = os.getenv("PLAID_ENV", "sandbox")
    return {"sandbox": "https://sandbox.plaid.com", "production": "https://production.plaid.com"}.get(env, "https://sandbox.plaid.com")


def _plaid_post(path: str, body: dict) -> dict:
    payload = {"client_id": os.getenv("PLAID_CLIENT_ID"), "secret": os.getenv("PLAID_SECRET"), **body}
    r = httpx.post(_plaid_url() + path, json=payload, timeout=20)
    data = r.json()
    if r.status_code != 200:
        raise BrokerError(f"Plaid: {data.get('display_message') or data.get('error_message') or r.status_code}")
    return data


def plaid_link_token(username: str) -> str:
    if not configured()["plaid"]:
        raise BrokerError("Plaid isn't set up on this server.")
    return _plaid_post("/link/token/create", {
        "user": {"client_user_id": hashlib.sha256(username.encode()).hexdigest()[:32]}, "client_name": "AssetAdvisor",
        "products": ["investments"], "country_codes": ["US"], "language": "en"})["link_token"]


def connect_plaid(owner: str, portfolio_id: str, public_token: str, institution: str, by: str) -> dict:
    ex = _plaid_post("/item/public_token/exchange", {"public_token": public_token})
    return _create(owner, portfolio_id, "plaid", f"{institution or 'Brokerage'} (Plaid)",
                   {"access_token": ex["access_token"], "item_id": ex["item_id"]}, {"institution": institution}, by)


PLAID_CASH = {"deposit": "deposit", "contribution": "deposit", "withdrawal": "withdrawal", "distribution": "withdrawal",
              "dividend": "dividend", "qualified dividend": "dividend", "non-qualified dividend": "dividend",
              "interest": "interest", "account fee": "fee", "management fee": "fee", "fee": "fee", "tax withheld": "fee"}


def map_plaid(txs: list[dict], securities: list[dict]) -> tuple[list[dict], list[dict]]:
    sec = {s["security_id"]: s for s in securities}
    trades, cash = [], []
    for t in txs:
        s = sec.get(t.get("security_id")) or {}
        typ, sub = (t.get("type") or "").lower(), (t.get("subtype") or "").lower()
        ext = f"plaid:{t['investment_transaction_id']}"
        if typ in ("buy", "sell") and s.get("ticker_symbol"):
            trades.append({"symbol": s["ticker_symbol"], "kind": s.get("type", ""), "side": typ,
                           "quantity": abs(float(t.get("quantity") or 0)), "price": float(t.get("price") or 0),
                           "fee": float(t.get("fees") or 0), "date": t["date"], "external_id": ext})
        elif sub in PLAID_CASH:
            cash.append({"type": PLAID_CASH[sub], "amount": abs(float(t.get("amount") or 0)), "date": t["date"],
                         "notes": t.get("name", ""), "external_id": ext})
    return trades, cash


async def _sync_plaid(conn: dict, secret: dict) -> tuple[list, list, dict]:
    meta = dict(conn["meta"])
    start = (date.fromisoformat(meta["cursor_date"]) - timedelta(days=7)) if meta.get("cursor_date") else date.today() - timedelta(days=FIRST_SYNC_DAYS)
    end = date.today()
    txs, secs, offset = [], [], 0
    while True:
        d = _plaid_post("/investments/transactions/get", {"access_token": secret["access_token"], "start_date": start.isoformat(),
                                                          "end_date": end.isoformat(), "options": {"count": 500, "offset": offset}})
        txs += d.get("investment_transactions", [])
        secs += d.get("securities", [])
        offset += len(d.get("investment_transactions", []))
        if offset >= d.get("total_investment_transactions", 0) or not d.get("investment_transactions"):
            break
    meta["cursor_date"] = end.isoformat()
    t, cs = map_plaid(txs, secs)
    return t, cs, meta


# ── SnapTrade ──────────────────────────────────────────────────────────────

SNAP_BASE = "https://api.snaptrade.com"


def snap_signature(consumer_key: str, path: str, query: str, content) -> str:
    """HMAC-SHA256 request signature as described in SnapTrade's API docs."""
    sig_obj = {"content": content, "path": path, "query": query}
    msg = json.dumps(sig_obj, separators=(",", ":"), sort_keys=True)
    return base64.b64encode(hmac.new(consumer_key.encode(), msg.encode(), hashlib.sha256).digest()).decode()


def _snap(method: str, path: str, query: dict | None = None, body: dict | None = None):
    from urllib.parse import urlencode

    q = {"clientId": os.getenv("SNAPTRADE_CLIENT_ID"), "timestamp": str(int(time.time())), **(query or {})}
    qs = urlencode(q)
    sig = snap_signature(os.getenv("SNAPTRADE_CONSUMER_KEY", ""), path, qs, body)
    r = httpx.request(method, f"{SNAP_BASE}{path}?{qs}", json=body, headers={"Signature": sig}, timeout=20)
    if r.status_code >= 400:
        raise BrokerError(f"SnapTrade: {(r.json() or {}).get('detail') if r.headers.get('content-type', '').startswith('application/json') else r.status_code}")
    return r.json() if r.content else {}


def snaptrade_portal(owner: str, portfolio_id: str, by: str) -> dict:
    """Register a SnapTrade user for this connection and return the URL where they link their broker."""
    if not configured()["snaptrade"]:
        raise BrokerError("SnapTrade isn't set up on this server.")
    user_id = "aa-" + secrets.token_hex(10)
    reg = _snap("POST", "/api/v1/snapTrade/registerUser", body={"userId": user_id})
    secret = {"user_id": user_id, "user_secret": reg["userSecret"]}
    conn = _create(owner, portfolio_id, "snaptrade", "Brokerage (SnapTrade)", secret, {"pending": True}, by)
    login = _snap("POST", "/api/v1/snapTrade/login", query={"userId": user_id, "userSecret": reg["userSecret"]})
    return {"connection": conn, "url": login.get("redirectURI") or login.get("loginRedirectURI")}


SNAP_CASH = {"CONTRIBUTION": "deposit", "DEPOSIT": "deposit", "WITHDRAWAL": "withdrawal", "DIVIDEND": "dividend",
             "INTEREST": "interest", "FEE": "fee", "TAX": "fee"}


def map_snaptrade(acts: list[dict]) -> tuple[list[dict], list[dict]]:
    trades, cash = [], []
    for a in acts:
        typ = (a.get("type") or "").upper()
        sym = ((a.get("symbol") or {}).get("symbol") or "") if isinstance(a.get("symbol"), dict) else (a.get("symbol") or "")
        kind = (((a.get("symbol") or {}).get("type") or {}).get("code") or "") if isinstance(a.get("symbol"), dict) else ""
        d = (a.get("trade_date") or a.get("settlement_date") or "")[:10]
        ext = f"snaptrade:{a['id']}"
        if typ in ("BUY", "SELL") and sym:
            trades.append({"symbol": sym, "kind": {"et": "etf", "crypto": "crypto"}.get(kind, ""), "side": typ.lower(),
                           "quantity": abs(float(a.get("units") or 0)), "price": float(a.get("price") or 0),
                           "fee": abs(float(a.get("fee") or 0)), "date": d, "external_id": ext})
        elif typ in SNAP_CASH:
            cash.append({"type": SNAP_CASH[typ], "amount": abs(float(a.get("amount") or 0)), "date": d,
                         "notes": a.get("description", "")[:200], "external_id": ext})
    return trades, cash


async def _sync_snaptrade(conn: dict, secret: dict) -> tuple[list, list, dict]:
    meta = dict(conn["meta"])
    start = (date.fromisoformat(meta["cursor_date"]) - timedelta(days=7)) if meta.get("cursor_date") else date.today() - timedelta(days=FIRST_SYNC_DAYS)
    acts = _snap("GET", "/api/v1/activities", query={"userId": secret["user_id"], "userSecret": secret["user_secret"],
                                                     "startDate": start.isoformat(), "endDate": date.today().isoformat()})
    meta["cursor_date"] = date.today().isoformat()
    meta.pop("pending", None)
    t, cs = map_snaptrade(acts if isinstance(acts, list) else acts.get("data", []))
    return t, cs, meta


# ── Sync ───────────────────────────────────────────────────────────────────

SYNCERS = {"alpaca": _sync_alpaca, "plaid": _sync_plaid, "snaptrade": _sync_snaptrade}


async def sync(cid: str, by: str = "scheduler") -> dict:
    await registry.ensure_loaded()
    conn, secret = _get(cid)
    with db.conn() as c:
        run_id = c.execute("INSERT INTO broker_sync_runs (connection_id) VALUES (%s) RETURNING id", (cid,)).fetchone()[0]
        c.commit()
    try:
        trades, cash, meta = await SYNCERS[conn["provider"]](conn, secret)
        nt, nc, skipped = apply(conn["owner"], conn["portfolio_id"], cid, trades, cash)
        msg = f"{nt} new trade(s), {nc} cash movement(s)" + (f"; skipped {len(skipped)}: {'; '.join(sorted(set(skipped))[:3])}" if skipped else "")
        _update(cid, meta=meta, sync=(True, msg))
        ok = True
    except Exception as exc:  # noqa: BLE001 — record the failure on the connection
        nt = nc = 0
        msg = str(exc) if isinstance(exc, BrokerError) else f"Sync failed: {exc.__class__.__name__}"
        _update(cid, sync=(False, msg))
        ok = False
    with db.conn() as c:
        c.execute("UPDATE broker_sync_runs SET finished_at = now(), ok = %s, trades_added = %s, cash_added = %s, message = %s WHERE id = %s",
                  (ok, nt, nc, msg[:500], run_id))
        c.commit()
    from services.firms import firm_of_owner
    audit_events.record(by, "broker.sync", firm_id=firm_of_owner(conn["owner"]), target=conn["portfolio_id"],
                        detail={"connection": cid, "ok": ok, "trades": nt, "cash": nc})
    return {"ok": ok, "message": msg, "trades_added": nt, "cash_added": nc}


async def sync_all() -> None:
    """Scheduler: sync every active connection."""
    if not db.available():
        return
    with db.conn() as c:
        ids = [r[0] for r in c.execute("SELECT id FROM broker_connections WHERE status = 'active'")]
    for cid in ids:
        try:
            await sync(cid)
        except Exception as exc:  # noqa: BLE001
            print(f"[brokers] sync {cid}: {exc}")


def forget(owner: str, portfolio_id: str | None = None) -> int:
    """Portfolio, firm or account deleted: revoke and drop its connections (imported records go with the data)."""
    if not db.available():
        return 0
    with db.conn() as c:
        ids = [r[0] for r in c.execute("SELECT id FROM broker_connections WHERE owner = %s" + (" AND portfolio_id = %s" if portfolio_id else ""),
                                       (owner, portfolio_id) if portfolio_id else (owner,))]
    for cid in ids:
        try:
            remove(owner, cid, "system")
        except Exception as exc:  # noqa: BLE001
            print(f"[brokers] forget {cid}: {exc}")
    return len(ids)
