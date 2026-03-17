"""Auth API router — JSON-based register, login, logout, change password."""

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services.auth import (
    authenticate, create_token, load_users, save_users, hash_password, verify_password,
    check_lockout, record_failed_attempt, clear_attempts,
)


router = APIRouter()


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
    confirm_password: str


@router.post("/register")
async def register(req: RegisterRequest):
    if req.password != req.confirm_password:
        return JSONResponse(status_code=400, content={"error": "Passwords do not match"})

    if len(req.password) < 6:
        return JSONResponse(status_code=400, content={"error": "Password must be at least 6 characters"})

    if len(req.username) < 3:
        return JSONResponse(status_code=400, content={"error": "Username must be at least 3 characters"})

    if not re.match(r'^[a-zA-Z0-9_-]+$', req.username):
        return JSONResponse(status_code=400, content={"error": "Username can only contain letters, numbers, hyphens, and underscores"})

    first = req.first_name.strip()
    last = req.last_name.strip()
    if not first or not last:
        return JSONResponse(status_code=400, content={"error": "First and last name are required"})

    users = load_users()
    if any(u["username"] == req.username for u in users):
        return JSONResponse(status_code=409, content={"error": "Username already taken"})

    users.append({
        "username": req.username,
        "first_name": first,
        "last_name": last,
        "password_hash": hash_password(req.password),
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    save_users(users)

    token = create_token(req.username, "user")
    response = JSONResponse(
        status_code=201,
        content={
            "token": token,
            "username": req.username,
            "first_name": first,
            "last_name": last,
            "role": "user",
            "is_new": True,
        },
    )
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=86400,
    )
    return response


@router.post("/login")
async def login(req: LoginRequest):
    if check_lockout(req.username):
        return JSONResponse(
            status_code=429,
            content={"error": "Too many failed attempts. Try again in 5 minutes."},
        )

    user = authenticate(req.username, req.password)
    if not user:
        return JSONResponse(
            status_code=401,
            content={"error": "Invalid username or password"},
        )

    token = create_token(user["username"], user["role"])
    response = JSONResponse(content={
        "token": token,
        "username": user["username"],
        "first_name": user.get("first_name", ""),
        "last_name": user.get("last_name", ""),
        "role": user["role"],
    })
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=86400,  # 24 hours
    )
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
    }


@router.post("/logout")
async def logout():
    response = JSONResponse(content={"message": "Logged out"})
    response.delete_cookie("access_token")
    return response


@router.post("/change-password")
async def change_password(req: ChangePasswordRequest, request: Request):
    user = getattr(request.state, "user", {})
    username = user.get("sub", "")

    if not username:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    if req.new_password != req.confirm_password:
        return JSONResponse(status_code=400, content={"error": "New passwords do not match"})

    if len(req.new_password) < 6:
        return JSONResponse(status_code=400, content={"error": "Password must be at least 6 characters"})

    users = load_users()
    for u in users:
        if u["username"] == username:
            if not verify_password(req.current_password, u["password_hash"]):
                return JSONResponse(status_code=400, content={"error": "Current password is incorrect"})
            u["password_hash"] = hash_password(req.new_password)
            save_users(users)
            return {"message": "Password changed successfully"}

    return JSONResponse(status_code=404, content={"error": "User not found"})
