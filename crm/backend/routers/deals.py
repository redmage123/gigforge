"""Deal CRUD + stage movement endpoints — US-031, US-032."""
from __future__ import annotations
from fastapi.responses import Response

import uuid
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user
from database import get_db
from repositories.deal_repo import DealRepository
from repositories.pipeline_repo import PipelineRepository

router = APIRouter(prefix="/api/v1/deals", tags=["deals"])


class DealCreate(BaseModel):
    title: str
    pipeline_id: uuid.UUID
    stage_id: uuid.UUID
    value: Optional[float] = None
    currency: str = "USD"
    contact_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None
    assigned_to: Optional[uuid.UUID] = None
    probability: int = 0
    expected_close: Optional[date] = None
    notes: Optional[str] = None


class DealUpdate(BaseModel):
    title: Optional[str] = None
    value: Optional[float] = None
    currency: Optional[str] = None
    contact_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None
    assigned_to: Optional[uuid.UUID] = None
    probability: Optional[int] = None
    expected_close: Optional[date] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class StageMoveRequest(BaseModel):
    stage_id: uuid.UUID


def _deal_out(d: Any) -> Dict[str, Any]:
    return {
        "id": str(d.id),
        "tenant_id": str(d.tenant_id),
        "title": d.title,
        "value": float(d.value) if d.value is not None else None,
        "currency": d.currency,
        "pipeline_id": str(d.pipeline_id),
        "stage_id": str(d.stage_id),
        "contact_id": str(d.contact_id) if d.contact_id else None,
        "company_id": str(d.company_id) if d.company_id else None,
        "assigned_to": str(d.assigned_to) if d.assigned_to else None,
        "probability": d.probability,
        "expected_close": d.expected_close.isoformat() if d.expected_close else None,
        "status": d.status,
        "notes": d.notes,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_deal(
    body: DealCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = DealRepository(db)
    deal = await repo.create(
        tenant_id=current_user.tenant_id,
        title=body.title,
        pipeline_id=body.pipeline_id,
        stage_id=body.stage_id,
        created_by=current_user.id,
        value=body.value,
        currency=body.currency,
        contact_id=body.contact_id,
        company_id=body.company_id,
        assigned_to=body.assigned_to,
        probability=body.probability,
        expected_close=body.expected_close,
        notes=body.notes,
    )
    await db.commit()
    await db.refresh(deal)
    return _deal_out(deal)


@router.get("")
async def list_deals(
    pipeline_id: Optional[uuid.UUID] = Query(None),
    stage_id: Optional[uuid.UUID] = Query(None),
    contact_id: Optional[uuid.UUID] = Query(None),
    deal_status: Optional[str] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = DealRepository(db)
    deals, total = await repo.list(
        tenant_id=current_user.tenant_id,
        pipeline_id=pipeline_id,
        stage_id=stage_id,
        contact_id=contact_id,
        status=deal_status,
        skip=skip,
        limit=limit,
    )
    return {"items": [_deal_out(d) for d in deals], "total": total, "skip": skip, "limit": limit}


@router.get("/{deal_id}")
async def get_deal(
    deal_id: uuid.UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = DealRepository(db)
    deal = await repo.get_by_id(deal_id, current_user.tenant_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    return _deal_out(deal)


@router.put("/{deal_id}")
async def update_deal(
    deal_id: uuid.UUID,
    body: DealUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = DealRepository(db)
    deal = await repo.update(
        deal_id=deal_id,
        tenant_id=current_user.tenant_id,
        updates=body.model_dump(exclude_none=True),
    )
    if deal is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    await db.commit()
    await db.refresh(deal)
    return _deal_out(deal)


@router.delete("/{deal_id}", status_code=204, response_class=Response)
async def delete_deal(
    deal_id: uuid.UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = DealRepository(db)
    deleted = await repo.soft_delete(deal_id, current_user.tenant_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Deal not found")
    await db.commit()


@router.patch("/{deal_id}/stage")
async def move_deal_stage(
    deal_id: uuid.UUID,
    body: StageMoveRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    # Verify the new stage belongs to the deal's pipeline
    deal_repo = DealRepository(db)
    pipeline_repo = PipelineRepository(db)

    deal = await deal_repo.get_by_id(deal_id, current_user.tenant_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="Deal not found")

    stage = await pipeline_repo.get_stage_by_id(body.stage_id)
    if stage is None or stage.pipeline_id != deal.pipeline_id:
        raise HTTPException(
            status_code=422, detail="Stage does not belong to deal's pipeline"
        )

    updated = await deal_repo.move_stage(
        deal_id=deal_id,
        tenant_id=current_user.tenant_id,
        new_stage_id=body.stage_id,
        moved_by=current_user.id,
    )
    await db.commit()
    await db.refresh(updated)
    return _deal_out(updated)
