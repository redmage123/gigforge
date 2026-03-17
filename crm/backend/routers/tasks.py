"""Task management endpoints — US-041."""
from __future__ import annotations

import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user
from database import get_db
from repositories.task_repo import TaskRepository

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"])


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    assigned_to: Optional[uuid.UUID] = None
    contact_id: Optional[uuid.UUID] = None
    deal_id: Optional[uuid.UUID] = None
    due_date: Optional[str] = None
    priority: str = "medium"


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to: Optional[uuid.UUID] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None


def _task_out(t: Any) -> Dict[str, Any]:
    return {
        "id": str(t.id),
        "tenant_id": str(t.tenant_id),
        "title": t.title,
        "description": t.description,
        "assigned_to": str(t.assigned_to) if t.assigned_to else None,
        "contact_id": str(t.contact_id) if t.contact_id else None,
        "deal_id": str(t.deal_id) if t.deal_id else None,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "priority": t.priority,
        "status": t.status,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_task(
    body: TaskCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = TaskRepository(db)
    task = await repo.create(
        tenant_id=current_user.tenant_id,
        title=body.title,
        description=body.description,
        assigned_to=body.assigned_to,
        contact_id=body.contact_id,
        deal_id=body.deal_id,
        due_date=body.due_date,
        priority=body.priority,
        created_by=current_user.id,
    )
    await db.commit()
    await db.refresh(task)
    return _task_out(task)


@router.get("")
async def list_tasks(
    task_status: Optional[str] = Query(None, alias="status"),
    assigned_to: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = TaskRepository(db)
    tasks, total = await repo.list(
        tenant_id=current_user.tenant_id,
        status=task_status,
        assigned_to=assigned_to,
        skip=skip,
        limit=limit,
    )
    return {"items": [_task_out(t) for t in tasks], "total": total, "skip": skip, "limit": limit}


@router.patch("/{task_id}")
async def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = TaskRepository(db)
    task = await repo.update(
        task_id=task_id,
        tenant_id=current_user.tenant_id,
        updates=body.model_dump(exclude_none=True),
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.commit()
    await db.refresh(task)
    return _task_out(task)
