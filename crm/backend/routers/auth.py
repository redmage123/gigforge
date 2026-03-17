"""Authentication endpoints: register, login, refresh, logout."""
from fastapi.responses import Response
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user
from core.security import decode_token
from database import get_db
from models import User
from schemas.auth import LoginRequest, RefreshRequest, RegisterRequest, TokenResponse
from services.auth_service import AuthService

router = APIRouter()

_oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    return await AuthService(db).register(req)


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    return await AuthService(db).login(req)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    return await AuthService(db).refresh_tokens(req)


@router.post("/logout", status_code=204, response_class=Response)
async def logout(
    current_user: User = Depends(get_current_user),
    raw_token: str = Depends(_oauth2),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(raw_token)
    jti = payload["jti"]
    exp = payload.get("exp")
    expires_at = (
        datetime.fromtimestamp(exp, tz=timezone.utc)
        if exp
        else datetime.now(timezone.utc) + timedelta(minutes=15)
    )
    await AuthService(db).logout(jti, current_user.id, expires_at)
