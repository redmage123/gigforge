"""User and Tenant repository — all DB queries for auth."""
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Tenant, User


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_tenant_by_slug(self, slug: str) -> Optional[Tenant]:
        result = await self.db.execute(select(Tenant).where(Tenant.slug == slug))
        return result.scalar_one_or_none()

    async def get_by_email_and_tenant(
        self, email: str, tenant_id: uuid.UUID
    ) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(User.email == email, User.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, user_id: uuid.UUID) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        email: str,
        username: str,
        password_hash: str,
        tenant_id: uuid.UUID,
        role: str = "agent",
    ) -> User:
        user = User(
            email=email,
            username=username,
            password_hash=password_hash,
            tenant_id=tenant_id,
            role=role,
        )
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user
