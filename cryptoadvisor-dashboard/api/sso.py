"""Single sign-on routes (Google, Microsoft, per-firm SAML) and linked identities.

Public (no session): providers, OIDC start/callback, SAML metadata/start/ACS, firm lookup.
The SAML ACS receives a cross-site POST from the identity provider, so it is exempt from CSRF;
it is protected by the signed assertion, the one-time RelayState and InResponseTo.
"""

import urllib.parse

from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response

from services import audit_events, firms, sso
from services.auth import decode_token, load_users
from services.db import Unavailable
from services.user_data import get_username

router = APIRouter()


def _session_user(request: Request) -> str | None:
    payload = decode_token(request.cookies.get("access_token") or "")
    return payload.get("sub") if payload else None


def _fail(message: str, next_path: str = "/login") -> RedirectResponse:
    sep = "&" if "?" in next_path else "?"
    return RedirectResponse(f"{next_path}{sep}sso_error={urllib.parse.quote(message[:300])}", status_code=303)


def _finish(request: Request, out: dict, method: str) -> Response:
    """Linked → back to settings; signed in → session cookie and redirect."""
    from middleware.client_ip import client_ip
    from routers.auth import issue_session

    if "linked" in out:
        return RedirectResponse(f"/settings?sso_linked={urllib.parse.quote(out['linked'])}", status_code=303)
    user = next((u for u in load_users() if u["username"] == out["username"]), None)
    if not user:
        return _fail("Your account no longer exists.")
    audit_events.record(user["username"], "auth.login", ip=client_ip(request.scope), firm_id=out.get("firm_id"),
                        detail={"method": method})
    return issue_session(request, user, response=RedirectResponse(out.get("next") or "/", status_code=303))


@router.get("/providers")
async def providers():
    return {"oidc": sso.enabled_providers()}


@router.get("/firm-login")
async def firm_login(q: str):
    """Find a firm's SAML sign-in by email address or firm short name; returns the URL to go to."""
    q = q.strip().lower()
    try:
        firm = firms.by_slug(q) if "@" not in q else sso._firm_for_domain(q)
        if not firm:
            raise HTTPException(404, "No firm with company sign-in matches that. Check the spelling or ask your admin.")
        return {"url": f"/api/sso/saml/{firm['slug']}/start", "firm": firm["name"]}
    except Unavailable:
        raise HTTPException(503, "Company sign-in isn't available right now.")


@router.get("/oidc/{provider}/start")
async def oidc_start(request: Request, provider: str, intent: str = "login", next: str = "/"):
    user = None
    if intent == "link":
        user = _session_user(request)
        if not user:
            return _fail("Sign in first, then connect the account under Settings.")
    try:
        return RedirectResponse(await sso.oidc_start(provider, "link" if user else "login", user, next), status_code=303)
    except (sso.SSOError, Unavailable) as exc:
        return _fail(str(exc), "/settings" if user else "/login")


@router.get("/oidc/{provider}/callback")
async def oidc_callback(request: Request, provider: str, code: str = "", state: str = "", error: str = ""):
    if error or not code:
        return _fail("Sign-in was cancelled." if error == "access_denied" else f"Sign-in failed ({error or 'no code'}).")
    try:
        out = await sso.oidc_callback(provider, code, state)
    except (sso.SSOError, Unavailable) as exc:
        audit_events.record("anonymous", "auth.login_failed", detail={"method": provider, "reason": str(exc)[:200]})
        return _fail(str(exc))
    return _finish(request, out, provider)


@router.get("/saml/{slug}/metadata")
async def saml_metadata(slug: str):
    if not firms.by_slug(slug):
        raise HTTPException(404, "Unknown firm")
    return Response(sso.sp_metadata(slug), media_type="application/samlmetadata+xml")


@router.get("/saml/{slug}/start")
async def saml_start(request: Request, slug: str, intent: str = "login", next: str = "/"):
    user = _session_user(request) if intent == "link" else None
    if intent == "link" and not user:
        return _fail("Sign in first, then link your company sign-in.")
    try:
        return RedirectResponse(sso.saml_start(slug, "link" if user else "login", user, next), status_code=303)
    except (sso.SSOError, Unavailable) as exc:
        return _fail(str(exc))


@router.post("/saml/{slug}/acs")
async def saml_acs(request: Request, slug: str, SAMLResponse: str = Form(...), RelayState: str = Form("")):
    try:
        out = sso.saml_acs(slug, SAMLResponse, RelayState)
    except (sso.SSOError, Unavailable) as exc:
        audit_events.record("anonymous", "auth.login_failed", detail={"method": f"saml:{slug}", "reason": str(exc)[:200]})
        return _fail(str(exc))
    return _finish(request, out, "saml")


# ── Linked identities (signed-in user) ─────────────────────────────────────

@router.get("/identities")
async def my_identities(request: Request):
    return {"identities": sso.identities_of(get_username(request)), "providers": sso.enabled_providers()}


@router.delete("/identities/{provider}")
async def unlink_identity(request: Request, provider: str):
    user = get_username(request)
    me = next((u for u in load_users() if u["username"] == user), {})
    if me.get("sso_only") and len(sso.identities_of(user)) <= 1:
        return JSONResponse(status_code=400, content={
            "error": "This is your only way to sign in. Set a password under Change Password first."})
    sso.unlink(user, provider)
    return {"identities": sso.identities_of(user)}
