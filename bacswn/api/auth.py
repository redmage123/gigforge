"""BACSWN — Auth API router (login, register, logout, me)."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from services.auth import (
    authenticate, create_token, create_user, get_user,
    check_lockout, record_failed_attempt, clear_attempts,
)

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    confirm_password: str
    first_name: str
    last_name: str
    title: str = ""
    department: str = ""


@router.post("/login")
async def login(req: LoginRequest):
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


@router.post("/register")
async def register(req: RegisterRequest):
    if req.password != req.confirm_password:
        return JSONResponse(status_code=400, content={"error": "Passwords do not match"})
    if len(req.password) < 6:
        return JSONResponse(status_code=400, content={"error": "Password must be at least 6 characters"})
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
    token = create_token(req.username, "user")
    response = JSONResponse(status_code=201, content={
        "token": token,
        "username": req.username,
        "role": "user",
        "first_name": req.first_name,
        "last_name": req.last_name,
    })
    response.set_cookie(key="access_token", value=token, httponly=True, samesite="lax", max_age=86400)
    return response


@router.post("/logout")
async def logout():
    response = JSONResponse(content={"message": "Logged out"})
    response.delete_cookie("access_token")
    return response


@router.get("/me")
async def me(request: Request):
    user_data = request.state.user
    user = await get_user(user_data["sub"])
    if not user:
        return JSONResponse(status_code=404, content={"error": "User not found"})
    return user
