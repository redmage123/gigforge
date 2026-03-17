"""Pipeline and PipelineStage repository — tenant-scoped data access."""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.pipeline import Pipeline, PipelineStage


class PipelineRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self, name: str, tenant_id: uuid.UUID, is_default: bool = False
    ) -> Pipeline:
        pipeline = Pipeline(tenant_id=tenant_id, name=name, is_default=is_default)
        self.db.add(pipeline)
        await self.db.flush()
        await self.db.refresh(pipeline)
        return pipeline

    async def get_by_id(
        self, pipeline_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> Optional[Pipeline]:
        result = await self.db.execute(
            select(Pipeline)
            .where(Pipeline.id == pipeline_id, Pipeline.tenant_id == tenant_id)
            .options(selectinload(Pipeline.stages))
        )
        return result.scalar_one_or_none()

    async def list(self, tenant_id: uuid.UUID) -> List[Pipeline]:
        result = await self.db.execute(
            select(Pipeline)
            .where(Pipeline.tenant_id == tenant_id)
            .options(selectinload(Pipeline.stages))
        )
        return result.scalars().all()

    async def add_stage(
        self,
        pipeline_id: uuid.UUID,
        tenant_id: uuid.UUID,
        name: str,
        order: int = 0,
        stage_type: str = "active",
        probability_pct: int = 0,
        color: Optional[str] = None,
    ) -> Optional[PipelineStage]:
        pipeline = await self.get_by_id(pipeline_id, tenant_id)
        if pipeline is None:
            return None
        stage = PipelineStage(
            pipeline_id=pipeline_id,
            name=name,
            order=order,
            stage_type=stage_type,
            probability_pct=probability_pct,
            color=color,
        )
        self.db.add(stage)
        await self.db.flush()
        await self.db.refresh(stage)
        return stage

    async def update_stage(
        self,
        stage_id: uuid.UUID,
        pipeline_id: uuid.UUID,
        tenant_id: uuid.UUID,
        updates: Dict[str, Any],
    ) -> Optional[PipelineStage]:
        result = await self.db.execute(
            select(PipelineStage).where(
                PipelineStage.id == stage_id,
                PipelineStage.pipeline_id == pipeline_id,
            )
        )
        stage = result.scalar_one_or_none()
        if stage is None:
            return None
        # Verify tenant ownership via pipeline
        pipeline = await self.get_by_id(pipeline_id, tenant_id)
        if pipeline is None:
            return None
        for field, value in updates.items():
            if hasattr(stage, field):
                setattr(stage, field, value)
        await self.db.flush()
        await self.db.refresh(stage)
        return stage

    async def get_stage_by_id(self, stage_id: uuid.UUID) -> Optional[PipelineStage]:
        result = await self.db.execute(
            select(PipelineStage).where(PipelineStage.id == stage_id)
        )
        return result.scalar_one_or_none()
