"""Company repository — all DB queries, always scoped by tenant_id."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional, Tuple

from datetime import timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models import Company, Contact


class CompanyRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        *,
        name: str,
        tenant_id: uuid.UUID,
        domain: Optional[str] = None,
        industry: Optional[str] = None,
        size: Optional[str] = None,
        address: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Company:
        company = Company(
            name=name,
            tenant_id=tenant_id,
            domain=domain,
            industry=industry,
            size=size,
            address=address,
            notes=notes,
        )
        self.db.add(company)
        await self.db.flush()
        await self.db.refresh(company)
        return company

    async def get_by_id(
        self, company_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> Optional[Company]:
        result = await self.db.execute(
            select(Company).where(
                Company.id == company_id, Company.tenant_id == tenant_id
            )
        )
        return result.scalar_one_or_none()

    async def list(
        self,
        tenant_id: uuid.UUID,
        *,
        page: int = 1,
        per_page: int = 20,
        include_deleted: bool = False,
    ) -> Tuple[list[Company], int]:
        q = select(Company).where(Company.tenant_id == tenant_id)
        if not include_deleted:
            q = q.where(Company.deleted_at.is_(None))
        count_q = select(func.count()).select_from(q.subquery())
        total = (await self.db.execute(count_q)).scalar_one()
        q = q.order_by(Company.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
        rows = (await self.db.execute(q)).scalars().all()
        return list(rows), total

    async def update(
        self, company_id: uuid.UUID, tenant_id: uuid.UUID, data: dict
    ) -> Optional[Company]:
        company = await self.get_by_id(company_id, tenant_id)
        if not company:
            return None
        for key, val in data.items():
            if val is not None:
                setattr(company, key, val)
        await self.db.flush()
        await self.db.refresh(company)
        return company

    async def soft_delete(
        self, company_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> bool:
        company = await self.get_by_id(company_id, tenant_id)
        if not company:
            return False
        # Null out company_id on related contacts before soft-deleting
        await self.db.execute(
            update(Contact)
            .where(Contact.company_id == company_id, Contact.tenant_id == tenant_id)
            .values(company_id=None)
        )
        company.deleted_at = datetime.now(timezone.utc)
        await self.db.flush()
        return True

    async def get_contacts(
        self,
        company_id: uuid.UUID,
        tenant_id: uuid.UUID,
        *,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[list[Contact], int]:
        q = select(Contact).where(
            Contact.company_id == company_id,
            Contact.tenant_id == tenant_id,
            Contact.deleted_at.is_(None),
        )
        count_q = select(func.count()).select_from(q.subquery())
        total = (await self.db.execute(count_q)).scalar_one()
        q = q.order_by(Contact.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
        rows = (await self.db.execute(q)).scalars().all()
        return list(rows), total
