"""Authentication business logic."""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from repositories.token_repo import TokenRepository
from repositories.user_repo import UserRepository
from schemas.auth import LoginRequest, RefreshRequest, RegisterRequest, TokenResponse, UserResponse


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)
        self.token_repo = TokenRepository(db)

    async def register(self, req: RegisterRequest) -> TokenResponse:
        tenant = await self.user_repo.get_tenant_by_slug(req.tenant_slug)
        if not tenant:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid tenant")

        existing = await self.user_repo.get_by_email_and_tenant(req.email, tenant.id)
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

        user = await self.user_repo.create(
            email=req.email,
            username=req.username,
            password_hash=hash_password(req.password),
            tenant_id=tenant.id,
        )
        await self.db.commit()
        await self.db.refresh(user)
        return await self._issue_tokens(user)

    async def login(self, req: LoginRequest) -> TokenResponse:
        tenant = await self.user_repo.get_tenant_by_slug(req.tenant_slug)
        # Always 401 — no enumeration
        if not tenant:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

        user = await self.user_repo.get_by_email_and_tenant(req.email, tenant.id)
        if not user or not verify_password(req.password, user.password_hash):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

        return await self._issue_tokens(user)

    async def refresh_tokens(self, req: RefreshRequest) -> TokenResponse:
        payload = decode_token(req.refresh_token)
        jti = payload.get("jti")
        if not jti:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")

        rt = await self.token_repo.get_refresh_token(jti)
        if not rt or rt.is_revoked:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token expired or revoked")
        if rt.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token expired")

        # Rotate: revoke old, issue new
        await self.token_repo.revoke_refresh_token(jti)

        user = await self.user_repo.get_by_id(rt.user_id)
        if not user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")

        await self.db.commit()
        return await self._issue_tokens(user)

    async def logout(self, jti: str, user_id: uuid.UUID, expires_at: datetime) -> None:
        await self.token_repo.blacklist_token(jti, user_id, expires_at)
        await self.db.commit()

    async def _issue_tokens(self, user) -> TokenResponse:
        payload = {"sub": str(user.id), "tenant_id": str(user.tenant_id), "role": user.role}
        access_token, access_jti = create_access_token(payload)
        refresh_token_str, refresh_jti = create_refresh_token(payload)

        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        await self.token_repo.store_refresh_token(refresh_jti, user.id, expires_at)
        await self.db.flush()

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token_str,
            user=UserResponse.model_validate(user),
        )
