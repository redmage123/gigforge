"""Tags endpoints — tenant-scoped tag management."""
from fastapi.responses import Response
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user
from database import get_db
from models import User
from repositories.tag_repo import TagRepository
from schemas.tag import TagAssignRequest, TagCreate, TagResponse

router = APIRouter()


@router.get("", response_model=list[TagResponse])
async def list_tags(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = TagRepository(db)
    return await repo.list(current_user.tenant_id)


@router.post("", response_model=TagResponse, status_code=201)
async def create_tag(
    data: TagCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = TagRepository(db)
    tag = await repo.create(
        name=data.name, tenant_id=current_user.tenant_id, color=data.color
    )
    await db.commit()
    return tag


@router.delete("/{tag_id}", status_code=204, response_class=Response)
async def delete_tag(
    tag_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = TagRepository(db)
    deleted = await repo.delete(tag_id, current_user.tenant_id)
    if not deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")
    await db.commit()
