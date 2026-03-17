"""Tag repository — all DB queries, tenant-scoped."""
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Contact, ContactTag, Tag


class TagRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self, *, name: str, tenant_id: uuid.UUID, color: Optional[str] = None
    ) -> Tag:
        tag = Tag(name=name, tenant_id=tenant_id, color=color)
        self.db.add(tag)
        await self.db.flush()
        await self.db.refresh(tag)
        return tag

    async def list(self, tenant_id: uuid.UUID) -> list[Tag]:
        result = await self.db.execute(
            select(Tag).where(Tag.tenant_id == tenant_id).order_by(Tag.name)
        )
        return list(result.scalars().all())

    async def get_by_id(
        self, tag_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> Optional[Tag]:
        result = await self.db.execute(
            select(Tag).where(Tag.id == tag_id, Tag.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def delete(self, tag_id: uuid.UUID, tenant_id: uuid.UUID) -> bool:
        tag = await self.get_by_id(tag_id, tenant_id)
        if not tag:
            return False
        await self.db.delete(tag)
        await self.db.flush()
        return True

    async def assign_to_contact(
        self, contact_id: uuid.UUID, tag_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> bool:
        # Validate both belong to tenant
        contact = await self.db.execute(
            select(Contact).where(
                Contact.id == contact_id, Contact.tenant_id == tenant_id
            )
        )
        if not contact.scalar_one_or_none():
            return False
        tag = await self.get_by_id(tag_id, tenant_id)
        if not tag:
            return False
        existing = await self.db.execute(
            select(ContactTag).where(
                ContactTag.contact_id == contact_id, ContactTag.tag_id == tag_id
            )
        )
        if not existing.scalar_one_or_none():
            self.db.add(ContactTag(contact_id=contact_id, tag_id=tag_id))
            await self.db.flush()
        return True

    async def remove_from_contact(
        self, contact_id: uuid.UUID, tag_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> bool:
        # Verify the contact belongs to tenant
        contact = await self.db.execute(
            select(Contact).where(
                Contact.id == contact_id, Contact.tenant_id == tenant_id
            )
        )
        if not contact.scalar_one_or_none():
            return False
        ct = await self.db.execute(
            select(ContactTag).where(
                ContactTag.contact_id == contact_id, ContactTag.tag_id == tag_id
            )
        )
        row = ct.scalar_one_or_none()
        if not row:
            return False
        await self.db.delete(row)
        await self.db.flush()
        return True
