"""Two-factor authentication (authenticator app) for the signed-in user, mounted at /api/2fa.

GET  /status          on/off, recovery codes left, firms that require it
POST /setup           new key + otpauth:// URI for the app (not active yet)
POST /confirm         {code}: turn on; returns 10 recovery codes, shown once
POST /recovery-codes  {code}: replace the recovery codes
POST /disable         {password, code}: turn off (password not needed for company-sign-in-only accounts)

While a firm requires MFA and the user has none, the session may use only these endpoints
(services.mfa.ENROLL_PATHS). Logic lives in services.mfa.
"""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from services import mfa
from services.auth import check_lockout, load_users, record_failed_attempt, verify_password

router = APIRouter()


class CodeBody(BaseModel):
    code: str = Field(max_length=64)


class DisableBody(BaseModel):
    code: str = Field(max_length=64)
    password: str = ""


def _user(request: Request) -> dict:
    return getattr(request.state, "user", None) or {}


def _ip(request: Request) -> str:
    from middleware.client_ip import client_ip

    return client_ip(request.scope)


def _err(exc: mfa.MfaError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={"error": str(exc), "code": exc.code})


def _account(username: str) -> dict:
    return next((u for u in load_users() if u["username"] == username), {})


@router.get("/status")
async def totp_status(request: Request):
    username = _user(request).get("sub", "")
    required = mfa.required_by(username)
    return {**mfa.status(username), "required_by": [f["name"] for f in required],
            "enrollment_required": mfa.enrollment_required(_user(request)),
            "password_required": not _account(username).get("sso_only")}


@router.post("/setup")
async def setup(request: Request):
    try:
        return mfa.begin_setup(_user(request).get("sub", ""))
    except mfa.MfaError as exc:
        return _err(exc)


@router.post("/confirm")
async def confirm(request: Request, body: CodeBody):
    try:
        codes = mfa.confirm_setup(_user(request).get("sub", ""), body.code, ip=_ip(request))
    except mfa.MfaError as exc:
        return _err(exc)
    return {"enabled": True, "recovery_codes": codes}


@router.post("/recovery-codes")
async def regenerate(request: Request, body: CodeBody):
    try:
        codes = mfa.regenerate_recovery_codes(_user(request).get("sub", ""), body.code, ip=_ip(request))
    except mfa.MfaError as exc:
        return _err(exc)
    return {"recovery_codes": codes}


@router.post("/disable")
async def disable(request: Request, body: DisableBody):
    username = _user(request).get("sub", "")
    if not mfa.is_enabled(username):
        return JSONResponse(status_code=400, content={"error": "Two-factor authentication is already off.",
                                                      "code": "not_enabled"})
    required = mfa.required_by(username)
    if required:
        return JSONResponse(status_code=403, content={
            "error": f"{required[0]['name']} requires two-factor authentication, so it can't be turned off.",
            "code": "required"})
    me = _account(username)
    if not me.get("sso_only"):  # company-sign-in-only accounts have no usable password: the code alone
        if check_lockout(username):
            return JSONResponse(status_code=429, content={"error": "Too many failed attempts. Try again in 5 minutes."})
        if not me.get("password_hash") or not verify_password(body.password or "", me["password_hash"]):
            record_failed_attempt(username)
            return JSONResponse(status_code=400, content={"error": "Password is incorrect", "code": "bad_password"})
    try:
        mfa.disable(username, body.code, ip=_ip(request))
    except mfa.MfaError as exc:
        return _err(exc)
    return {"enabled": False}
