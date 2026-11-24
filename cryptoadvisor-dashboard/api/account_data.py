"""The user's own account data: the setup-wizard investor profile and the complete data export.

Profile (PUT /profile): experience level, interests and risk tolerance from the setup wizard. Stored
as a record, written into the investment profile's risk tolerance (used by recommendations), and
written as AI memory facts (source "setup_wizard") so the assistant's context includes them. The
facts show on the AI Memory page, where the user can edit or delete them.

Export (GET /export): everything held about the user (GDPR right of access). Every per-user record
in the document store is included, plus data kept elsewhere (saved wallets, AI memory, broker
connection metadata, stored statements, sessions, sign-ins, firm memberships, own audit events).
Passwords, password hashes, API keys, secrets and access tokens are never included.
"""

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from services import store, user_data
from services.sanitize import sanitize_filename

logger = logging.getLogger(__name__)
router = APIRouter()

EXPERIENCE_LEVELS = ("Beginner", "Intermediate", "Advanced")
RISK_LEVELS = ("Conservative", "Moderate", "Aggressive")
INTERESTS = {
    "portfolio": "portfolio tracking", "defi": "DeFi and yield", "trading": "trading", "nfts": "NFTs",
    "tax": "tax planning", "analysis": "market analysis", "whales": "whale watching",
}
PROFILE_NS = "investor_profile"
WIZARD_SOURCE = "setup_wizard"

# Record keys never exported (exact names, or names ending in one of SECRET_SUFFIXES)
SECRET_KEYS = {
    "password", "password_hash", "hashed_password", "totp_secret", "otp_secret", "mfa_secret", "secret",
    "secret_key", "secret_enc", "api_key", "api_secret", "apikey", "access_token", "refresh_token", "token",
    "bot_token", "private_key", "passphrase", "backup_codes", "recovery_codes",
}
SECRET_SUFFIXES = ("_secret", "_token", "_password", "_enc")
# Namespaces whose records are credentials: exported only as a description of what is configured
CREDENTIAL_NAMESPACES = {"api_keys", "exchanges"}


def _username(request: Request) -> str:
    return (getattr(request.state, "user", None) or {}).get("sub", "")


# ── Investor profile (setup wizard) ─────────────────────────────────────────

class ProfileBody(BaseModel):
    experience: str = ""
    interests: list[str] = Field(default_factory=list, max_length=len(INTERESTS))
    risk_tolerance: str = ""


def _profile_facts(p: dict) -> list[dict]:
    facts = []
    if p.get("experience"):
        facts.append({"fact": f"Investing experience level: {p['experience'].lower()}", "category": "personal"})
    if p.get("interests"):
        names = ", ".join(INTERESTS[i] for i in p["interests"])
        facts.append({"fact": f"Most interested in: {names}", "category": "goals"})
    if p.get("risk_tolerance"):
        facts.append({"fact": f"Risk tolerance: {p['risk_tolerance'].lower()}", "category": "risk_profile"})
    return facts


async def _sync_memory(username: str, facts: list[dict]) -> None:
    """Replace the wizard's earlier AI memory facts with the current answers."""
    from services.user_memory import add_fact, delete_fact, get_facts

    for f in await get_facts(username, limit=1000):
        if f.get("source") == WIZARD_SOURCE:
            await delete_fact(username, f["id"])
    for f in facts:
        await add_fact(username, f["fact"], f["category"], source=WIZARD_SOURCE)


@router.get("/profile")
async def get_profile(request: Request):
    username = _username(request)
    if not username:
        return JSONResponse({"error": "Not signed in"}, status_code=401)
    p = user_data.load_user_data(username, PROFILE_NS)
    return p if isinstance(p, dict) and p else {"experience": "", "interests": [], "risk_tolerance": ""}


@router.put("/profile")
async def save_profile(request: Request, body: ProfileBody):
    username = _username(request)
    if not username:
        return JSONResponse({"error": "Not signed in"}, status_code=401)
    if body.experience and body.experience not in EXPERIENCE_LEVELS:
        return JSONResponse({"error": f"Experience must be one of: {', '.join(EXPERIENCE_LEVELS)}"}, status_code=400)
    if body.risk_tolerance and body.risk_tolerance not in RISK_LEVELS:
        return JSONResponse({"error": f"Risk tolerance must be one of: {', '.join(RISK_LEVELS)}"}, status_code=400)
    unknown = [i for i in body.interests if i not in INTERESTS]
    if unknown:
        return JSONResponse({"error": f"Unknown interest: {unknown[0]}"}, status_code=400)

    profile = {"experience": body.experience, "interests": list(dict.fromkeys(body.interests)),
               "risk_tolerance": body.risk_tolerance, "updated_at": datetime.now(timezone.utc).isoformat()}
    user_data.save_user_data(username, PROFILE_NS, profile)

    if body.risk_tolerance:  # recommendations read the investment profile's risk tolerance
        from services.investment_profile import NAMESPACE as INVESTMENT_NS

        def set_risk(cur):
            cur = cur if isinstance(cur, dict) else {}
            return {**cur, "risk_tolerance": body.risk_tolerance.lower()}
        user_data.update_user_data(username, INVESTMENT_NS, set_risk, default={})

    memory_saved = True
    try:
        await _sync_memory(username, _profile_facts(profile))
    except Exception as exc:  # noqa: BLE001 — the profile is saved; the assistant just won't see it yet
        logger.warning("wizard profile memory sync failed for %s: %s", username, exc)
        memory_saved = False
    return {**profile, "memory_saved": memory_saved}


# ── Complete data export ────────────────────────────────────────────────────

def _redact(value):
    """Drop secret fields at any depth."""
    if isinstance(value, dict):
        return {k: _redact(v) for k, v in value.items()
                if not (isinstance(k, str) and (k.lower() in SECRET_KEYS or k.lower().endswith(SECRET_SUFFIXES)))}
    if isinstance(value, list):
        return [_redact(v) for v in value]
    return value


def _owner_records(username: str) -> dict:
    """{namespace: record} for every per-user record in the document store."""
    key = sanitize_filename(username)
    if store.using_postgres():
        with store.pool().connection() as conn:
            rows = conn.execute("SELECT ns, data FROM documents WHERE key = %s AND ns <> %s ORDER BY ns",
                                (key, store.SHARED)).fetchall()
        return {ns: data for ns, data in rows}
    out = {}
    base = user_data.DATA_DIR
    for d in sorted(base.iterdir()) if base.is_dir() else []:
        f = d / f"{key}.json"
        if d.is_dir() and f.is_file():
            try:
                out[d.name] = json.loads(f.read_text())
            except (OSError, ValueError):
                out[d.name] = None
    return out


def _credential_summary(ns: str, data):
    if ns == "api_keys" and isinstance(data, dict):
        return {iid: sorted(fields) for iid, fields in data.items() if isinstance(fields, dict)}
    if ns == "exchanges" and isinstance(data, list):
        return [{"name": e.get("name"), "label": e.get("label"), "added_at": e.get("added_at")}
                for e in data if isinstance(e, dict)]
    return None


def _legacy_files(username: str) -> dict:
    """Older per-user files (data/memory/<user>/, data/users/<user>/)."""
    out = {}
    key = sanitize_filename(username)
    for sub in ("memory", "users"):
        d = user_data.DATA_DIR / sub / key
        for f in sorted(d.glob("*")) if d.is_dir() else []:
            if f.is_file() and f.suffix in (".json", ".md", ".txt"):
                text = f.read_text(errors="replace")
                if f.suffix == ".json":
                    try:
                        out[f"{sub}/{f.name}"] = _redact(json.loads(text))
                        continue
                    except ValueError:
                        pass
                out[f"{sub}/{f.name}"] = text
    return out


async def build_export(username: str) -> dict:
    export = {
        "format": "AssetAdvisor data export, version 2",
        "username": username,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "not_included": "Passwords and password hashes, API keys and exchange keys, broker credentials and access "
                        "tokens, and two-factor secrets are never exported.",
    }
    incomplete = []

    def section(name, fn):
        try:
            export[name] = fn()
        except Exception as exc:  # noqa: BLE001 — export what we can and say what is missing
            logger.warning("export %s failed for %s: %s", name, username, exc)
            incomplete.append(name)

    def account():
        from services.auth import load_users

        rec = next((u for u in load_users() if u.get("username") == username), None)
        return _redact(rec) if rec else None
    section("account", account)

    def records():
        out = {}
        for ns, data in _owner_records(username).items():
            if ns in CREDENTIAL_NAMESPACES:
                out[ns + "_configured"] = _credential_summary(ns, data)
            else:
                out[ns] = _redact(data)
        return out
    section("records", records)

    def saved_wallets():
        from api.wallet import _load_wallets
        return _load_wallets(username)
    section("saved_wallets", saved_wallets)

    def statements():
        from services import statements as st

        rows = []
        for p in export.get("records", {}).get("portfolios") or []:
            if isinstance(p, dict) and p.get("id"):
                try:
                    rows += [{"portfolio_id": p["id"], "portfolio": p.get("name"), **s} for s in st.list_stored(username, p["id"])]
                except ValueError:
                    continue
        return rows
    section("statements", statements)

    def broker_connections():
        from services import brokers
        return _redact(brokers.list_for(username))
    section("broker_connections", broker_connections)

    def shared_with_you():
        from services import portfolios
        return [{"portfolio_id": p.get("id"), "name": p.get("name"), "owner": p.get("owner"), "role": p.get("role")}
                for p in portfolios.shared_with(username)]
    section("portfolios_shared_with_you", shared_with_you)

    def shared_by_you():
        from services import portfolios
        out = []
        for p in export.get("records", {}).get("portfolios") or []:
            if isinstance(p, dict) and p.get("id"):
                members = portfolios.members(username, p["id"])["members"]
                if members:
                    out.append({"portfolio_id": p["id"], "name": p.get("name"), "members": members})
        return out
    section("portfolio_access_you_granted", shared_by_you)

    def firm_memberships():
        from services import firms
        return [{"firm_id": f.get("id"), "name": f.get("name"), "role": f.get("role")} for f in firms.my_firms(username)]
    section("firm_memberships", firm_memberships)

    def connected_sign_ins():
        from services import sso
        return sso.identities_of(username)
    section("connected_sign_ins", connected_sign_ins)

    def active_sessions():
        from services import sessions
        return [{k: v for k, v in s.items() if k not in ("id", "current")} for s in sessions.list_active(username)]
    section("active_sessions", active_sessions)

    def push_subscriptions():
        from services.push_notifications import get_subscriptions
        return [{"subscribed_at": s.get("subscribed_at")} for s in get_subscriptions(username)]
    section("browser_push_subscriptions", push_subscriptions)

    def audit():
        from services import audit_events, db
        from services.audit import get_audit_log

        if db.available():
            return [{k: e[k] for k in ("at", "action", "target", "ip", "detail")}
                    for e in audit_events.query(actor=username, limit=5000)]
        return get_audit_log(username=username, limit=5000)
    section("audit_log", audit)

    section("legacy_files", lambda: _legacy_files(username))

    try:
        from services.user_memory import get_facts
        export["ai_memory"] = [{k: f.get(k) for k in ("fact", "category", "source", "created_at", "updated_at")}
                               for f in await get_facts(username, limit=100_000)]
    except Exception as exc:  # noqa: BLE001
        logger.warning("export ai_memory failed for %s: %s", username, exc)
        incomplete.append("ai_memory")

    if incomplete:
        export["incomplete_sections"] = incomplete
    return export


@router.get("/export")
async def export_my_data(request: Request):
    username = _username(request)
    if not username:
        return JSONResponse({"error": "Not signed in"}, status_code=401)
    try:
        data = await build_export(username)
    except Exception as exc:  # noqa: BLE001
        logger.error("export failed for %s: %s", username, exc)
        return JSONResponse({"error": "Could not build your export. Please try again."}, status_code=503)
    return JSONResponse(json.loads(json.dumps(data, default=str)), headers={"Cache-Control": "no-store"})
