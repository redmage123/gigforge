"""Auth API router — JSON-based register, login, logout, change password."""

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from middleware.client_ip import is_https

from services.auth import (
    authenticate, create_token, load_users, save_users, hash_password, verify_password,
    check_lockout, record_failed_attempt, clear_attempts, MIN_PASSWORD,
)


router = APIRouter()


def _audit(request: Request, action: str, actor: str, **kw) -> None:
    from middleware.client_ip import client_ip
    from services import audit_events

    audit_events.record(actor, action, ip=client_ip(request.scope), **kw)


def _enrollment_hint(payload: dict) -> bool:
    """For the frontend only (the middleware enforces the firm policy): must this session enroll first?"""
    from services import mfa

    try:
        return mfa.enrollment_required(payload)
    except Exception:  # noqa: BLE001
        return False


def issue_session(request: Request, user: dict, status_code: int = 200, extra: dict | None = None,
                  response=None, method: str = "password", claims: dict | None = None):
    """Signed session cookie for a verified user. Lifetime: the shortest of the user's firms' session
    lengths (24h otherwise). Each call starts a server-side session (Active Sessions) that can be
    revoked. Also records the sign-in time for access reviews. Callers must have completed the
    two-factor step when the user has it (services.mfa). `claims`: facts about the sign-in."""
    from middleware.client_ip import client_ip
    from services import firms
    from services.user_data import update_shared_data

    hours = firms.session_hours(user["username"])
    token = create_token(user["username"], user.get("role", "user"), hours=hours, ip=client_ip(request.scope),
                         user_agent=request.headers.get("user-agent", ""), method=method, claims=claims)
    now = datetime.now(timezone.utc).isoformat()

    def touch(users):
        for u in users or []:
            if u.get("username") == user["username"]:
                u["last_login_at"] = now
        return users
    update_shared_data("users", touch, [])
    body = {"token": token, "username": user["username"], "first_name": user.get("first_name", ""),
            "last_name": user.get("last_name", ""), "role": user.get("role", "user"),
            "mfa_enrollment_required": _enrollment_hint({**(claims or {}), "sub": user["username"]}),
            **(extra or {})}
    response = response or JSONResponse(status_code=status_code, content=body)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=is_https(request.scope),  # HTTPS visitors only send it back over HTTPS
        max_age=int(hours * 3600),
    )
    return response


class RegisterRequest(BaseModel):
    first_name: str
    last_name: str
    username: str
    password: str
    confirm_password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str | None = None  # older frontends omit it; the form already checks the match


@router.post("/register")
async def register(req: RegisterRequest, request: Request):
    if req.password != req.confirm_password:
        return JSONResponse(status_code=400, content={"error": "Passwords do not match"})

    if len(req.password) < MIN_PASSWORD:
        return JSONResponse(status_code=400, content={"error": f"Password must be at least {MIN_PASSWORD} characters"})

    if len(req.username) < 3:
        return JSONResponse(status_code=400, content={"error": "Username must be at least 3 characters"})

    if not re.match(r'^[a-zA-Z0-9_-]+$', req.username):
        return JSONResponse(status_code=400, content={"error": "Username can only contain letters, numbers, hyphens, and underscores"})

    first = req.first_name.strip()
    last = req.last_name.strip()
    if not first or not last:
        return JSONResponse(status_code=400, content={"error": "First and last name are required"})

    from services.user_data import update_shared_data

    rec = {
        "username": req.username,
        "first_name": first,
        "last_name": last,
        "password_hash": hash_password(req.password),
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    taken = False

    def add(users):  # atomic: two sign-ups can't both take the same name
        nonlocal taken
        users = users or []
        if any(u["username"] == req.username for u in users):
            taken = True
            return users
        return users + [rec]
    update_shared_data("users", add, [])
    if taken:
        return JSONResponse(status_code=409, content={"error": "Username already taken"})
    _audit(request, "account.register", req.username, target=req.username)
    return issue_session(request, rec, status_code=201, extra={"is_new": True}, method="register")


@router.post("/login")
async def login(req: LoginRequest, request: Request):
    if check_lockout(req.username):
        return JSONResponse(
            status_code=429,
            content={"error": "Too many failed attempts. Try again in 5 minutes."},
        )

    user = authenticate(req.username, req.password)
    if not user:
        _audit(request, "auth.login_failed", req.username[:64], detail={"method": "password"})
        return JSONResponse(
            status_code=401,
            content={"error": "Invalid username or password"},
        )
    from services import firms

    blocked = firms.password_blocked_by(user["username"])
    if blocked:
        _audit(request, "auth.login_refused", user["username"], detail={"reason": "sso_required", "firm": blocked})
        return JSONResponse(status_code=403, content={
            "error": f"{blocked} requires single sign-on. Use \"Sign in with your company\" instead."})
    from services import mfa

    if mfa.is_enabled(user["username"]):
        # Second factor: no session yet, a single-use challenge for the code step (POST /login/mfa)
        challenge = mfa.start_challenge(user["username"], method="password")
        response = JSONResponse(content={"mfa_required": True, "challenge": challenge,
                                         "expires_in": mfa.CHALLENGE_SECONDS})
        mfa.set_challenge_cookie(response, challenge, request)
        return response
    _audit(request, "auth.login", user["username"], detail={"method": "password"})
    return issue_session(request, user)


class MfaLoginRequest(BaseModel):
    code: str
    challenge: str | None = None  # else the mfa_challenge cookie (set by password and SSO sign-in)


@router.post("/login/mfa")
async def login_mfa(req: MfaLoginRequest, request: Request):
    """Second sign-in step: a code from the authenticator app (or a recovery code) for a challenge."""
    from middleware.client_ip import client_ip
    from services import mfa

    token = req.challenge or request.cookies.get(mfa.CHALLENGE_COOKIE) or ""
    try:
        out = mfa.complete_challenge(token, req.code, ip=client_ip(request.scope))
    except mfa.MfaError as exc:
        response = JSONResponse(status_code=exc.status, content={"error": str(exc), "code": exc.code})
        if exc.code == "expired":
            mfa.clear_challenge_cookie(response)
        return response
    user = next((u for u in load_users() if u["username"] == out["username"]), None)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Your account no longer exists.", "code": "expired"})
    _audit(request, "auth.login", user["username"], firm_id=out.get("firm_id"),
           detail={"method": out["method"], "mfa": out["factor"]})
    response = issue_session(request, user, method=out["method"], claims={"amr": [out["factor"]]},
                             extra={"next": out["next"]})
    mfa.clear_challenge_cookie(response)
    return response


@router.get("/me")
async def me(request: Request):
    user = getattr(request.state, "user", None)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    username = user.get("sub", "")
    # Look up full name from users store
    users = load_users()
    u = next((u for u in users if u["username"] == username), None)
    return {
        "username": username,
        "first_name": u.get("first_name", "") if u else "",
        "last_name": u.get("last_name", "") if u else "",
        "role": user.get("role", "user"),
        "mfa_enrollment_required": _enrollment_hint(user),
    }


@router.post("/logout")
async def logout(request: Request):
    from services import sessions

    state = getattr(request.state, "user", None) or {}
    user = state.get("sub")
    if user:
        # End the session server-side too: a copy of the token stops working at once
        if state.get("sid"):
            sessions.revoke(user, state["sid"], reason="logout")
        _audit(request, "auth.logout", user)
    response = JSONResponse(content={"message": "Logged out"})
    response.delete_cookie("access_token")
    return response


@router.post("/change-password")
async def change_password(req: ChangePasswordRequest, request: Request):
    user = getattr(request.state, "user", {})
    username = user.get("sub", "")

    if not username:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    if req.confirm_password is not None and req.new_password != req.confirm_password:
        return JSONResponse(status_code=400, content={"error": "New passwords do not match"})

    if len(req.new_password) < MIN_PASSWORD:
        return JSONResponse(status_code=400, content={"error": f"Password must be at least {MIN_PASSWORD} characters"})

    users = load_users()
    for u in users:
        if u["username"] == username:
            if not u.get("sso_only") and not verify_password(req.current_password, u["password_hash"]):
                return JSONResponse(status_code=400, content={"error": "Current password is incorrect"})
            u["password_hash"] = hash_password(req.new_password)
            u.pop("sso_only", None)
            save_users(users)
            # Anyone else signed in as this user (e.g. with the old password) is signed out
            from services import sessions

            ended = sessions.revoke_all(username, keep=user.get("sid"), reason="password_change")
            _audit(request, "auth.password_change", username, detail={"other_sessions_ended": ended})
            return {"message": "Password changed successfully"
                    + (f". Signed out {ended} other session{'s' if ended != 1 else ''}." if ended else ""),
                    "other_sessions_ended": ended}

    return JSONResponse(status_code=404, content={"error": "User not found"})


class DeleteAccountRequest(BaseModel):
    password: str
    confirm: str  # must be "DELETE"


@router.post("/delete-account")
async def delete_account_route(req: DeleteAccountRequest, request: Request):
    """Permanently delete the signed-in user's account and all their data (GDPR erasure)."""
    from services.account import delete_account

    username = getattr(request.state, "user", {}).get("sub", "")
    if not username:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    if req.confirm != "DELETE":
        return JSONResponse(status_code=400, content={"error": 'Type DELETE to confirm'})
    users = load_users()
    me = next((u for u in users if u["username"] == username), None)
    # Accounts created through company sign-in have no usable password: retyping the username confirms
    sso_ok = bool(me and me.get("sso_only") and req.password == username)
    if not me or not (sso_ok or verify_password(req.password, me["password_hash"])):
        return JSONResponse(status_code=400, content={"error": "Password is incorrect"})
    if me.get("role") == "admin" and sum(1 for u in users if u.get("role") == "admin") <= 1:
        return JSONResponse(status_code=400, content={"error": "This is the only admin account; make another admin first."})
    from services import firms

    sole = firms.sole_admin_of(username)
    if sole:
        return JSONResponse(status_code=400, content={
            "error": f"You're the only admin of {', '.join(sole)}. Make someone else admin or delete the firm first."})
    _audit(request, "account.delete", username, target=username)
    removed = await delete_account(username)
    response = JSONResponse(content={"message": "Your account and data have been deleted.", "removed": removed})
    response.delete_cookie("access_token")
    return response
