"""Notes CRUD — per contact, deal, or company. US-312."""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user
from database import get_db
from repositories import note_repo as _note_repo_mod

router = APIRouter(prefix="/api/notes", tags=["notes"])

import datetime as _dt_mod

_MAX_CONTENT_LEN = 10_000


def _safe_dt(val):
    if isinstance(val, (_dt_mod.datetime, _dt_mod.date)):
        return val.isoformat()
    return None


class NoteCreate(BaseModel):
    content: str = Field(..., max_length=_MAX_CONTENT_LEN)
    contact_id: Optional[uuid.UUID] = None
    deal_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None
    pinned: bool = False


class NoteUpdate(BaseModel):
    content: Optional[str] = Field(None, max_length=_MAX_CONTENT_LEN)
    pinned: Optional[bool] = None


def _note_out(n: Any) -> Dict[str, Any]:
    return {
        "id": str(n.id),
        "tenant_id": str(n.tenant_id),
        "content": n.content,
        "pinned": n.pinned,
        "contact_id": str(n.contact_id) if n.contact_id else None,
        "deal_id": str(n.deal_id) if n.deal_id else None,
        "company_id": str(n.company_id) if n.company_id else None,
        "created_by": str(n.created_by) if n.created_by else None,
        "created_at": _safe_dt(n.created_at),
        "updated_at": _safe_dt(n.updated_at),
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_note(
    body: NoteCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = _note_repo_mod.NoteRepository(db)
    note = await repo.create(
        tenant_id=current_user.tenant_id,
        content=body.content,
        created_by=current_user.id,
        contact_id=body.contact_id,
        deal_id=body.deal_id,
        company_id=body.company_id,
        pinned=body.pinned,
    )
    await db.commit()
    await db.refresh(note)
    return _note_out(note)


@router.get("")
async def list_notes(
    contact_id: Optional[uuid.UUID] = Query(None),
    deal_id: Optional[uuid.UUID] = Query(None),
    company_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = _note_repo_mod.NoteRepository(db)
    notes, total = await repo.list(
        current_user.tenant_id,
        contact_id=contact_id,
        deal_id=deal_id,
        company_id=company_id,
        skip=skip,
        limit=limit,
    )
    return {"items": [_note_out(n) for n in notes], "total": total, "skip": skip, "limit": limit}


@router.get("/{note_id}")
async def get_note(
    note_id: uuid.UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = _note_repo_mod.NoteRepository(db)
    note = await repo.get_by_id(note_id, current_user.tenant_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    return _note_out(note)


@router.patch("/{note_id}")
async def patch_note(
    note_id: uuid.UUID,
    body: NoteUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = _note_repo_mod.NoteRepository(db)
    updates = body.model_dump(exclude_none=True)
    note = await repo.update(note_id, current_user.tenant_id, updates)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    await db.commit()
    await db.refresh(note)
    return _note_out(note)


@router.put("/{note_id}")
async def update_note(
    note_id: uuid.UUID,
    body: NoteUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = _note_repo_mod.NoteRepository(db)
    updates = body.model_dump(exclude_none=True)
    note = await repo.update(note_id, current_user.tenant_id, updates)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    await db.commit()
    await db.refresh(note)
    return _note_out(note)


@router.delete("/{note_id}", status_code=204, response_class=Response)
async def delete_note(
    note_id: uuid.UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = _note_repo_mod.NoteRepository(db)
    deleted = await repo.delete(note_id, current_user.tenant_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Note not found")
    await db.commit()
