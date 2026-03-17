"""Global search repository — tenant-scoped ILIKE across contacts, companies, deals."""
from __future__ import annotations

import uuid
from typing import Any, Dict, List

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.company import Company
from models.contact import Contact
from models.deal import Deal


class SearchRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def search(
        self,
        tenant_id: uuid.UUID,
        query: str,
        types: List[str],
        limit: int = 10,
    ) -> Dict[str, List[Any]]:
        q = f"%{query}%"
        results: Dict[str, List[Any]] = {}

        if "contacts" in types:
            stmt = (
                select(Contact)
                .where(
                    Contact.tenant_id == tenant_id,
                    Contact.deleted_at.is_(None),
                    or_(
                        Contact.first_name.ilike(q),
                        Contact.last_name.ilike(q),
                        Contact.email.ilike(q),
                        Contact.phone.ilike(q),
                    ),
                )
                .limit(limit)
            )
            rows = (await self.db.execute(stmt)).scalars().all()
            results["contacts"] = list(rows)

        if "companies" in types:
            stmt = (
                select(Company)
                .where(
                    Company.tenant_id == tenant_id,
                    Company.deleted_at.is_(None),
                    or_(
                        Company.name.ilike(q),
                        Company.domain.ilike(q),
                        Company.industry.ilike(q),
                    ),
                )
                .limit(limit)
            )
            rows = (await self.db.execute(stmt)).scalars().all()
            results["companies"] = list(rows)

        if "deals" in types:
            stmt = (
                select(Deal)
                .where(
                    Deal.tenant_id == tenant_id,
                    Deal.title.ilike(q),
                )
                .limit(limit)
            )
            rows = (await self.db.execute(stmt)).scalars().all()
            results["deals"] = list(rows)

        return results
