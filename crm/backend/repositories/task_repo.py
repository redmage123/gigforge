"""Task repository — tenant-scoped CRUD."""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.task import Task, TaskStatus


class TaskRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        tenant_id: uuid.UUID,
        title: str,
        description: Optional[str] = None,
        assigned_to: Optional[uuid.UUID] = None,
        contact_id: Optional[uuid.UUID] = None,
        deal_id: Optional[uuid.UUID] = None,
        due_date=None,
        priority: str = "medium",
        created_by: Optional[uuid.UUID] = None,
    ) -> Task:
        task = Task(
            tenant_id=tenant_id,
            title=title,
            description=description,
            assigned_to=assigned_to,
            contact_id=contact_id,
            deal_id=deal_id,
            due_date=due_date,
            priority=priority,
            status=TaskStatus.OPEN,
            created_by=created_by,
        )
        self.db.add(task)
        await self.db.flush()
        await self.db.refresh(task)
        return task

    async def get_by_id(
        self, task_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> Optional[Task]:
        result = await self.db.execute(
            select(Task).where(
                Task.id == task_id, Task.tenant_id == tenant_id
            )
        )
        return result.scalar_one_or_none()

    async def list(
        self,
        tenant_id: uuid.UUID,
        status: Optional[str] = None,
        assigned_to: Optional[uuid.UUID] = None,
        skip: int = 0,
        limit: int = 20,
    ) -> Tuple[List[Task], int]:
        q = select(Task).where(Task.tenant_id == tenant_id)
        if status:
            q = q.where(Task.status == status)
        if assigned_to:
            q = q.where(Task.assigned_to == assigned_to)

        count_q = select(func.count()).select_from(q.subquery())
        total = (await self.db.execute(count_q)).scalar()

        result = await self.db.execute(q.offset(skip).limit(limit))
        return result.scalars().all(), total

    async def update(
        self, task_id: uuid.UUID, tenant_id: uuid.UUID, updates: Dict[str, Any]
    ) -> Optional[Task]:
        task = await self.get_by_id(task_id, tenant_id)
        if task is None:
            return None
        for field, value in updates.items():
            if hasattr(task, field):
                setattr(task, field, value)
        await self.db.flush()
        await self.db.refresh(task)
        return task
