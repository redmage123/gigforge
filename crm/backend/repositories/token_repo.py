"""Repository for token blacklist and refresh token management."""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.refresh_token import RefreshToken
from models.token_blacklist import TokenBlacklist


class TokenRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Token blacklist
    # ------------------------------------------------------------------

    async def is_blacklisted(self, jti: str) -> bool:
        result = await self.db.execute(
            select(TokenBlacklist.jti).where(TokenBlacklist.jti == jti)
        )
        return result.scalar_one_or_none() is not None

    async def blacklist_token(
        self, jti: str, user_id: uuid.UUID, expires_at: datetime
    ) -> None:
        entry = TokenBlacklist(jti=jti, user_id=user_id, expires_at=expires_at)
        self.db.add(entry)
        await self.db.flush()

    # ------------------------------------------------------------------
    # Refresh tokens
    # ------------------------------------------------------------------

    async def store_refresh_token(
        self, jti: str, user_id: uuid.UUID, expires_at: datetime
    ) -> RefreshToken:
        rt = RefreshToken(jti=jti, user_id=user_id, expires_at=expires_at)
        self.db.add(rt)
        await self.db.flush()
        return rt

    async def get_refresh_token(self, jti: str) -> Optional[RefreshToken]:
        result = await self.db.execute(
            select(RefreshToken).where(RefreshToken.jti == jti)
        )
        return result.scalar_one_or_none()

    async def revoke_refresh_token(self, jti: str) -> None:
        rt = await self.get_refresh_token(jti)
        if rt:
            rt.is_revoked = True
            await self.db.flush()
