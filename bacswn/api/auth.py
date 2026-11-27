"""BACSWN — auth API router (login, register, logout, me).

What: ``POST /login``, ``POST /register`` (admin only), ``POST /logout`` and ``GET /me``.

Why: the browser client needs to sign in, sign out and learn who it is; admins need
to create accounts (there is no public self-registration).

How: thin handlers over ``services.auth``. Login enforces the per-username lockout and
returns the JWT both in the body and as an httponly ``access_token`` cookie. Errors are
returned as ``{"error": ...}`` JSON responses with the appropriate status.
"""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import secrets

from config import PUBLIC_DEMO
from services.auth import (
    authenticate, create_token, create_user, get_user,
    check_lockout, record_failed_attempt, clear_attempts,
)

router = APIRouter()


class LoginRequest(BaseModel):
    """Credentials posted to ``/login``."""

    username: str
    password: str


class RegisterRequest(BaseModel):
    """New account details posted to ``/register`` by an administrator."""

    username: str
    password: str
    confirm_password: str
    first_name: str
    last_name: str
    title: str = ""
    department: str = ""


@router.post("/login")
async def login(req: LoginRequest):
    """Check credentials and issue a JWT (body + cookie); 429 when locked out, 401 on failure."""
    if check_lockout(req.username):
        return JSONResponse(status_code=429, content={"error": "Too many failed attempts. Try again in 5 minutes."})

    user = await authenticate(req.username, req.password)
    if not user:
        record_failed_attempt(req.username)
        return JSONResponse(status_code=401, content={"error": "Invalid credentials"})

    clear_attempts(req.username)
    token = create_token(user["username"], user["role"])
    response = JSONResponse(content={
        "token": token,
        "username": user["username"],
        "role": user["role"],
        "first_name": user["first_name"],
        "last_name": user["last_name"],
    })
    response.set_cookie(key="access_token", value=token, httponly=True, samesite="lax", max_age=86400)
    return response


GUEST_USERNAME = "guest"


@router.post("/guest")
async def guest():
    """Public demo only: sign the visitor in as the shared guest (role ``user``); 404 elsewhere."""
    if not PUBLIC_DEMO:
        return JSONResponse(status_code=404, content={"error": "Not found"})
    user = await get_user(GUEST_USERNAME)
    if not user:
        # Nobody signs in as the guest with a password: it gets a random one nobody knows.
        await create_user(username=GUEST_USERNAME, password=secrets.token_urlsafe(24), role="user",
                          first_name="Public", last_name="demo", title="Visitor", department="")
        user = await get_user(GUEST_USERNAME)
    token = create_token(user["username"], user["role"])
    response = JSONResponse(content={"token": token, "username": user["username"], "role": user["role"],
                                     "first_name": user["first_name"], "last_name": user["last_name"],
                                     "public_demo": True})
    response.set_cookie(key="access_token", value=token, httponly=True, samesite="lax", max_age=86400)
    return response


MIN_PASSWORD_LENGTH = 12


@router.post("/register")
async def register(req: RegisterRequest, request: Request):
    """Create a user account. Admin-only — there is no public self-registration."""
    caller = getattr(request.state, "user", None) or {}
    if caller.get("role") != "admin":
        return JSONResponse(status_code=403, content={"error": "Only administrators can create accounts"})
    if req.password != req.confirm_password:
        return JSONResponse(status_code=400, content={"error": "Passwords do not match"})
    if len(req.password) < MIN_PASSWORD_LENGTH:
        return JSONResponse(status_code=400, content={"error": f"Password must be at least {MIN_PASSWORD_LENGTH} characters"})
    if len(req.username) < 3:
        return JSONResponse(status_code=400, content={"error": "Username must be at least 3 characters"})

    existing = await get_user(req.username)
    if existing:
        return JSONResponse(status_code=409, content={"error": "Username already taken"})

    await create_user(
        username=req.username,
        password=req.password,
        first_name=req.first_name,
        last_name=req.last_name,
        title=req.title,
        department=req.department,
    )
    # No token/cookie: the admin creating the account stays logged in as themselves.
    return JSONResponse(status_code=201, content={
        "username": req.username,
        "role": "user",
        "first_name": req.first_name,
        "last_name": req.last_name,
    })


@router.post("/logout")
async def logout():
    """Clear the ``access_token`` cookie (the JWT itself stays valid until it expires)."""
    response = JSONResponse(content={"message": "Logged out"})
    response.delete_cookie("access_token")
    return response


@router.get("/me")
async def me(request: Request):
    """Return the signed-in user's profile, or 404 if the account no longer exists."""
    user_data = request.state.user
    user = await get_user(user_data["sub"])
    if not user:
        return JSONResponse(status_code=404, content={"error": "User not found"})
    return user
