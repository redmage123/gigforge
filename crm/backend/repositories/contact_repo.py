"""Contact repository — all DB queries, always scoped by tenant_id."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional, Tuple

from datetime import timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models import Contact, ContactTag, Tag


class ContactRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        *,
        first_name: str,
        last_name: str,
        tenant_id: uuid.UUID,
        email: Optional[str] = None,
        phone: Optional[str] = None,
        company_id: Optional[uuid.UUID] = None,
        source: Optional[str] = None,
        status: str = "lead",
        custom_fields: Optional[dict] = None,
        created_by: Optional[uuid.UUID] = None,
    ) -> Contact:
        contact = Contact(
            first_name=first_name,
            last_name=last_name,
            email=email,
            phone=phone,
            company_id=company_id,
            source=source,
            status=status,
            custom_fields=custom_fields,
            tenant_id=tenant_id,
            created_by=created_by,
        )
        self.db.add(contact)
        await self.db.flush()
        await self.db.refresh(contact)
        return contact

    async def get_by_id(
        self, contact_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> Optional[Contact]:
        result = await self.db.execute(
            select(Contact)
            .where(Contact.id == contact_id, Contact.tenant_id == tenant_id)
            .options(selectinload(Contact.contact_tags).selectinload(ContactTag.tag))
        )
        return result.scalar_one_or_none()

    async def list(
        self,
        tenant_id: uuid.UUID,
        *,
        page: int = 1,
        per_page: int = 20,
        sort_by: str = "created_at",
        order: str = "desc",
        company_id: Optional[uuid.UUID] = None,
        owner_id: Optional[uuid.UUID] = None,
        created_after: Optional[datetime] = None,
        created_before: Optional[datetime] = None,
        include_deleted: bool = False,
    ) -> Tuple[list[Contact], int]:
        q = (
            select(Contact)
            .where(Contact.tenant_id == tenant_id)
            .options(selectinload(Contact.contact_tags).selectinload(ContactTag.tag))
        )
        if not include_deleted:
            q = q.where(Contact.deleted_at.is_(None))
        if company_id:
            q = q.where(Contact.company_id == company_id)
        if owner_id:
            q = q.where(Contact.created_by == owner_id)
        if created_after:
            q = q.where(Contact.created_at >= created_after)
        if created_before:
            q = q.where(Contact.created_at <= created_before)

        count_q = select(func.count()).select_from(q.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        col = getattr(Contact, sort_by, Contact.created_at)
        q = q.order_by(col.desc() if order == "desc" else col.asc())
        q = q.offset((page - 1) * per_page).limit(per_page)
        rows = (await self.db.execute(q)).scalars().all()
        return list(rows), total

    async def update(
        self, contact_id: uuid.UUID, tenant_id: uuid.UUID, data: dict
    ) -> Optional[Contact]:
        contact = await self.get_by_id(contact_id, tenant_id)
        if not contact:
            return None
        for key, val in data.items():
            if val is not None:
                setattr(contact, key, val)
        await self.db.flush()
        await self.db.refresh(contact)
        return contact

    async def soft_delete(
        self, contact_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> bool:
        contact = await self.get_by_id(contact_id, tenant_id)
        if not contact:
            return False
        contact.deleted_at = datetime.now(timezone.utc)
        await self.db.flush()
        return True

    async def add_tag(
        self, contact_id: uuid.UUID, tag_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> bool:
        contact = await self.get_by_id(contact_id, tenant_id)
        if not contact:
            return False
        # Check tag belongs to same tenant
        tag_result = await self.db.execute(
            select(Tag).where(Tag.id == tag_id, Tag.tenant_id == tenant_id)
        )
        if not tag_result.scalar_one_or_none():
            return False
        # Idempotent insert
        existing = await self.db.execute(
            select(ContactTag).where(
                ContactTag.contact_id == contact_id, ContactTag.tag_id == tag_id
            )
        )
        if not existing.scalar_one_or_none():
            self.db.add(ContactTag(contact_id=contact_id, tag_id=tag_id))
            await self.db.flush()
        return True

    async def remove_tag(
        self, contact_id: uuid.UUID, tag_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> bool:
        ct = await self.db.execute(
            select(ContactTag)
            .join(Contact, ContactTag.contact_id == Contact.id)
            .where(
                ContactTag.contact_id == contact_id,
                ContactTag.tag_id == tag_id,
                Contact.tenant_id == tenant_id,
            )
        )
        row = ct.scalar_one_or_none()
        if not row:
            return False
        await self.db.delete(row)
        await self.db.flush()
        return True
