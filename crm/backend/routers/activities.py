"""Activity logging endpoints — US-040."""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user
from database import get_db
from repositories.activity_repo import ActivityRepository

router = APIRouter(prefix="/api/v1/activities", tags=["activities"])


class ActivityCreate(BaseModel):
    type: str  # call | email | meeting | note | demo | task
    subject: str
    description: Optional[str] = None
    contact_id: Optional[uuid.UUID] = None
    deal_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None
    scheduled_at: Optional[str] = None
    completed_at: Optional[str] = None


def _activity_out(a: Any) -> Dict[str, Any]:
    return {
        "id": str(a.id),
        "tenant_id": str(a.tenant_id),
        "type": a.type,
        "subject": a.subject,
        "description": a.description,
        "contact_id": str(a.contact_id) if a.contact_id else None,
        "deal_id": str(a.deal_id) if a.deal_id else None,
        "company_id": str(a.company_id) if a.company_id else None,
        "performed_by": str(a.performed_by) if a.performed_by else None,
        "scheduled_at": a.scheduled_at.isoformat() if a.scheduled_at else None,
        "completed_at": a.completed_at.isoformat() if a.completed_at else None,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_activity(
    body: ActivityCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = ActivityRepository(db)
    activity = await repo.create(
        tenant_id=current_user.tenant_id,
        activity_type=body.type,
        subject=body.subject,
        description=body.description,
        contact_id=body.contact_id,
        deal_id=body.deal_id,
        company_id=body.company_id,
        performed_by=current_user.id,
        scheduled_at=body.scheduled_at,
        completed_at=body.completed_at,
    )
    await db.commit()
    await db.refresh(activity)
    return _activity_out(activity)


@router.get("")
async def list_activities(
    contact_id: Optional[uuid.UUID] = Query(None),
    deal_id: Optional[uuid.UUID] = Query(None),
    activity_type: Optional[str] = Query(None, alias="type"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = ActivityRepository(db)
    activities, total = await repo.list(
        tenant_id=current_user.tenant_id,
        contact_id=contact_id,
        deal_id=deal_id,
        activity_type=activity_type,
        skip=skip,
        limit=limit,
    )
    return {"items": [_activity_out(a) for a in activities], "total": total, "skip": skip, "limit": limit}
