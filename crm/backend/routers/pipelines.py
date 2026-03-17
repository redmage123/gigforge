"""Pipeline and stage endpoints — US-030."""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user
from database import get_db
from repositories.pipeline_repo import PipelineRepository

router = APIRouter(prefix="/api/v1/pipelines", tags=["pipelines"])


class PipelineCreate(BaseModel):
    name: str
    is_default: bool = False


class StageCreate(BaseModel):
    name: str
    order: int = 0
    stage_type: str = "active"
    probability_pct: int = 0
    color: Optional[str] = None


class StageUpdate(BaseModel):
    name: Optional[str] = None
    order: Optional[int] = None
    stage_type: Optional[str] = None
    probability_pct: Optional[int] = None
    color: Optional[str] = None


def _pipeline_out(p: Any) -> Dict[str, Any]:
    return {
        "id": str(p.id),
        "tenant_id": str(p.tenant_id),
        "name": p.name,
        "is_default": p.is_default,
        "stages": [_stage_out(s) for s in (p.stages or [])],
    }


def _stage_out(s: Any) -> Dict[str, Any]:
    return {
        "id": str(s.id),
        "pipeline_id": str(s.pipeline_id),
        "name": s.name,
        "order": s.order,
        "stage_type": s.stage_type,
        "probability_pct": s.probability_pct,
        "color": s.color,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_pipeline(
    body: PipelineCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = PipelineRepository(db)
    pipeline = await repo.create(
        name=body.name,
        tenant_id=current_user.tenant_id,
        is_default=body.is_default,
    )
    await db.commit()
    await db.refresh(pipeline)
    return _pipeline_out(pipeline)


@router.get("")
async def list_pipelines(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[Dict[str, Any]]:
    repo = PipelineRepository(db)
    pipelines = await repo.list(tenant_id=current_user.tenant_id)
    return [_pipeline_out(p) for p in pipelines]


@router.post("/{pipeline_id}/stages", status_code=status.HTTP_201_CREATED)
async def add_stage(
    pipeline_id: uuid.UUID,
    body: StageCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = PipelineRepository(db)
    stage = await repo.add_stage(
        pipeline_id=pipeline_id,
        tenant_id=current_user.tenant_id,
        name=body.name,
        order=body.order,
        stage_type=body.stage_type,
        probability_pct=body.probability_pct,
        color=body.color,
    )
    if stage is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    await db.commit()
    await db.refresh(stage)
    return _stage_out(stage)


@router.patch("/{pipeline_id}/stages/{stage_id}")
async def update_stage(
    pipeline_id: uuid.UUID,
    stage_id: uuid.UUID,
    body: StageUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = PipelineRepository(db)
    updates = body.model_dump(exclude_none=True)
    stage = await repo.update_stage(
        stage_id=stage_id,
        pipeline_id=pipeline_id,
        tenant_id=current_user.tenant_id,
        updates=updates,
    )
    if stage is None:
        raise HTTPException(status_code=404, detail="Stage not found")
    await db.commit()
    await db.refresh(stage)
    return _stage_out(stage)
