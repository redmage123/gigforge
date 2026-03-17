"""Activity repository — tenant-scoped create/list."""
from __future__ import annotations

import uuid
from typing import List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.activity import Activity


class ActivityRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        tenant_id: uuid.UUID,
        activity_type: str,
        subject: str,
        description: Optional[str] = None,
        contact_id: Optional[uuid.UUID] = None,
        deal_id: Optional[uuid.UUID] = None,
        company_id: Optional[uuid.UUID] = None,
        performed_by: Optional[uuid.UUID] = None,
        scheduled_at=None,
        completed_at=None,
    ) -> Activity:
        activity = Activity(
            tenant_id=tenant_id,
            type=activity_type,
            subject=subject,
            description=description,
            contact_id=contact_id,
            deal_id=deal_id,
            company_id=company_id,
            performed_by=performed_by,
            scheduled_at=scheduled_at,
            completed_at=completed_at,
        )
        self.db.add(activity)
        await self.db.flush()
        await self.db.refresh(activity)
        return activity

    async def list(
        self,
        tenant_id: uuid.UUID,
        contact_id: Optional[uuid.UUID] = None,
        deal_id: Optional[uuid.UUID] = None,
        activity_type: Optional[str] = None,
        skip: int = 0,
        limit: int = 20,
    ) -> Tuple[List[Activity], int]:
        q = select(Activity).where(Activity.tenant_id == tenant_id)
        if contact_id:
            q = q.where(Activity.contact_id == contact_id)
        if deal_id:
            q = q.where(Activity.deal_id == deal_id)
        if activity_type:
            q = q.where(Activity.type == activity_type)

        count_q = select(func.count()).select_from(q.subquery())
        total = (await self.db.execute(count_q)).scalar()

        result = await self.db.execute(q.offset(skip).limit(limit))
        return result.scalars().all(), total

    async def get_by_id(
        self, activity_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> Optional[Activity]:
        result = await self.db.execute(
            select(Activity).where(
                Activity.id == activity_id, Activity.tenant_id == tenant_id
            )
        )
        return result.scalar_one_or_none()
