"""Note repository — all queries scoped by tenant_id."""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.note import Note


class NoteRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        tenant_id: uuid.UUID,
        content: str,
        created_by: Optional[uuid.UUID] = None,
        contact_id: Optional[uuid.UUID] = None,
        deal_id: Optional[uuid.UUID] = None,
        company_id: Optional[uuid.UUID] = None,
        pinned: bool = False,
    ) -> Note:
        note = Note(
            tenant_id=tenant_id,
            content=content,
            created_by=created_by,
            contact_id=contact_id,
            deal_id=deal_id,
            company_id=company_id,
            pinned=pinned,
        )
        self.db.add(note)
        await self.db.flush()
        await self.db.refresh(note)
        return note

    async def get_by_id(self, note_id: uuid.UUID, tenant_id: uuid.UUID) -> Optional[Note]:
        result = await self.db.execute(
            select(Note).where(Note.id == note_id, Note.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list(
        self,
        tenant_id: uuid.UUID,
        contact_id: Optional[uuid.UUID] = None,
        deal_id: Optional[uuid.UUID] = None,
        company_id: Optional[uuid.UUID] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[Note], int]:
        q = select(Note).where(Note.tenant_id == tenant_id)
        if contact_id:
            q = q.where(Note.contact_id == contact_id)
        if deal_id:
            q = q.where(Note.deal_id == deal_id)
        if company_id:
            q = q.where(Note.company_id == company_id)

        # Pinned notes appear first, then newest
        q = q.order_by(Note.pinned.desc(), Note.created_at.desc())

        count_q = select(func.count()).select_from(q.subquery())
        total = (await self.db.execute(count_q)).scalar()

        q = q.offset(skip).limit(limit)
        rows = (await self.db.execute(q)).scalars().all()
        return list(rows), total

    async def update(
        self, note_id: uuid.UUID, tenant_id: uuid.UUID, updates: Dict[str, Any]
    ) -> Optional[Note]:
        note = await self.get_by_id(note_id, tenant_id)
        if not note:
            return None
        for field, value in updates.items():
            if hasattr(note, field):
                setattr(note, field, value)
        await self.db.flush()
        await self.db.refresh(note)
        return note

    async def delete(self, note_id: uuid.UUID, tenant_id: uuid.UUID) -> bool:
        note = await self.get_by_id(note_id, tenant_id)
        if not note:
            return False
        await self.db.delete(note)
        await self.db.flush()
        return True
