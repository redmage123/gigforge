"""Deal repository — tenant-scoped CRUD + stage movement."""
from __future__ import annotations

import uuid
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.deal import Deal, DealStatus
from models.deal_stage_history import DealStageHistory


class DealRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        tenant_id: uuid.UUID,
        title: str,
        pipeline_id: uuid.UUID,
        stage_id: uuid.UUID,
        created_by: Optional[uuid.UUID] = None,
        value: Optional[float] = None,
        currency: str = "USD",
        contact_id: Optional[uuid.UUID] = None,
        company_id: Optional[uuid.UUID] = None,
        assigned_to: Optional[uuid.UUID] = None,
        probability: int = 0,
        expected_close: Optional[date] = None,
        notes: Optional[str] = None,
    ) -> Deal:
        deal = Deal(
            tenant_id=tenant_id,
            title=title,
            pipeline_id=pipeline_id,
            stage_id=stage_id,
            created_by=created_by,
            value=value,
            currency=currency,
            contact_id=contact_id,
            company_id=company_id,
            assigned_to=assigned_to,
            probability=probability,
            expected_close=expected_close,
            notes=notes,
            status=DealStatus.OPEN,
        )
        self.db.add(deal)
        await self.db.flush()
        await self.db.refresh(deal)
        return deal

    async def get_by_id(
        self, deal_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> Optional[Deal]:
        result = await self.db.execute(
            select(Deal).where(
                Deal.id == deal_id,
                Deal.tenant_id == tenant_id,
                Deal.status != "archived",
            )
        )
        return result.scalar_one_or_none()

    async def list(
        self,
        tenant_id: uuid.UUID,
        pipeline_id: Optional[uuid.UUID] = None,
        stage_id: Optional[uuid.UUID] = None,
        contact_id: Optional[uuid.UUID] = None,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 20,
    ) -> Tuple[List[Deal], int]:
        q = select(Deal).where(
            Deal.tenant_id == tenant_id, Deal.status != "archived"
        )
        if pipeline_id:
            q = q.where(Deal.pipeline_id == pipeline_id)
        if stage_id:
            q = q.where(Deal.stage_id == stage_id)
        if contact_id:
            q = q.where(Deal.contact_id == contact_id)
        if status:
            q = q.where(Deal.status == status)

        count_q = select(func.count()).select_from(q.subquery())
        total_result = await self.db.execute(count_q)
        total = total_result.scalar()

        q = q.offset(skip).limit(limit)
        result = await self.db.execute(q)
        return result.scalars().all(), total

    async def update(
        self, deal_id: uuid.UUID, tenant_id: uuid.UUID, updates: Dict[str, Any]
    ) -> Optional[Deal]:
        deal = await self.get_by_id(deal_id, tenant_id)
        if deal is None:
            return None
        for field, value in updates.items():
            if hasattr(deal, field):
                setattr(deal, field, value)
        await self.db.flush()
        await self.db.refresh(deal)
        return deal

    async def soft_delete(
        self, deal_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> bool:
        deal = await self.get_by_id(deal_id, tenant_id)
        if deal is None:
            return False
        deal.status = "archived"
        await self.db.flush()
        return True

    async def move_stage(
        self,
        deal_id: uuid.UUID,
        tenant_id: uuid.UUID,
        new_stage_id: uuid.UUID,
        moved_by: uuid.UUID,
    ) -> Optional[Deal]:
        deal = await self.get_by_id(deal_id, tenant_id)
        if deal is None:
            return None
        old_stage_id = deal.stage_id
        deal.stage_id = new_stage_id
        history = DealStageHistory(
            deal_id=deal_id,
            tenant_id=tenant_id,
            from_stage_id=old_stage_id,
            to_stage_id=new_stage_id,
            moved_by=moved_by,
        )
        self.db.add(history)
        await self.db.flush()
        await self.db.refresh(deal)
        return deal
