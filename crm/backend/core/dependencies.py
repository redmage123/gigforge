"""FastAPI dependency factories for auth and tenant isolation."""
import uuid
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from core.security import decode_token
from database import get_db
from models import User
from repositories.token_repo import TokenRepository
from repositories.user_repo import UserRepository

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_token(token)
    user_id_str = payload.get("sub")
    jti = payload.get("jti")

    if not user_id_str or not jti:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token payload")

    # Check blacklist via DAO
    if await TokenRepository(db).is_blacklisted(jti):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token has been revoked")

    user = await UserRepository(db).get_by_id(uuid.UUID(user_id_str))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")

    return user


def get_tenant_id(
    current_user: User = Depends(get_current_user),
) -> uuid.UUID:
    return current_user.tenant_id
