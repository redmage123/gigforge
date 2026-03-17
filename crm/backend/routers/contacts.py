"""Contacts CRUD endpoints — all scoped to current user's tenant."""
from fastapi.responses import Response
import csv
import io
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user, get_tenant_id
from database import get_db
from models import User
from repositories.company_repo import CompanyRepository
from repositories.contact_repo import ContactRepository
from repositories.tag_repo import TagRepository
from schemas.common import PaginatedResponse
from schemas.contact import ContactCreate, ContactResponse, ContactUpdate
from schemas.tag import TagAssignRequest

router = APIRouter()

_REQUIRED_CSV_HEADERS = {"first_name", "last_name"}
_CSV_ROW_LIMIT = 1000


def _to_response(contact) -> ContactResponse:
    tags = [ct.tag for ct in (contact.contact_tags or [])]
    return ContactResponse(
        id=contact.id,
        tenant_id=contact.tenant_id,
        first_name=contact.first_name,
        last_name=contact.last_name,
        email=contact.email,
        phone=contact.phone,
        company_id=contact.company_id,
        source=contact.source,
        status=contact.status,
        custom_fields=contact.custom_fields,
        deleted_at=contact.deleted_at,
        created_at=contact.created_at,
        updated_at=contact.updated_at,
        tags=tags,
    )


@router.post("/import")
async def import_contacts_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Bulk-import contacts from a CSV upload. Returns imported/skipped/errors summary."""
    content = await file.read()
    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))

    headers = set(reader.fieldnames or [])
    if not _REQUIRED_CSV_HEADERS.issubset(headers):
        missing = _REQUIRED_CSV_HEADERS - headers
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"CSV missing required columns: {', '.join(sorted(missing))}",
        )

    rows = list(reader)
    if len(rows) > _CSV_ROW_LIMIT:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"CSV exceeds maximum of {_CSV_ROW_LIMIT} rows (got {len(rows)})",
        )

    tenant_id = current_user.tenant_id
    contact_repo = ContactRepository(db)
    company_repo = CompanyRepository(db)
    tag_repo = TagRepository(db)

    # Caches to avoid redundant DB lookups within this import
    _company_cache: Dict[str, Any] = {}
    _tag_cache: Dict[str, Any] = {}

    imported = 0
    skipped = 0
    errors: List[Dict[str, Any]] = []

    for row_num, row in enumerate(rows, start=2):  # row 1 is header
        first_name = (row.get("first_name") or "").strip()
        last_name = (row.get("last_name") or "").strip()

        if not first_name or not last_name:
            skipped += 1
            msg_parts = []
            if not first_name:
                msg_parts.append("first_name is required")
            if not last_name:
                msg_parts.append("last_name is required")
            errors.append({"row": row_num, "message": "; ".join(msg_parts)})
            continue

        # Find-or-create Company
        company_id = None
        company_name = (row.get("company_name") or "").strip()
        if company_name:
            if company_name not in _company_cache:
                from sqlalchemy import select as _select
                from models import Company
                result = await db.execute(
                    _select(Company).where(
                        Company.name == company_name,
                        Company.tenant_id == tenant_id,
                        Company.deleted_at.is_(None),
                    )
                )
                existing = result.scalar_one_or_none()
                if existing:
                    _company_cache[company_name] = existing.id
                else:
                    company = await company_repo.create(name=company_name, tenant_id=tenant_id)
                    _company_cache[company_name] = company.id
            company_id = _company_cache[company_name]

        # Parse tags (semicolon-separated)
        tag_ids: List[Any] = []
        raw_tags = (row.get("tags") or "").strip()
        if raw_tags:
            for tag_name in [t.strip() for t in raw_tags.split(";") if t.strip()]:
                if tag_name not in _tag_cache:
                    from sqlalchemy import select as _select
                    from models import Tag
                    result = await db.execute(
                        _select(Tag).where(
                            Tag.name == tag_name,
                            Tag.tenant_id == tenant_id,
                        )
                    )
                    existing_tag = result.scalar_one_or_none()
                    if existing_tag:
                        _tag_cache[tag_name] = existing_tag.id
                    else:
                        tag = await tag_repo.create(name=tag_name, tenant_id=tenant_id)
                        _tag_cache[tag_name] = tag.id
                tag_ids.append(_tag_cache[tag_name])

        contact = await contact_repo.create(
            first_name=first_name,
            last_name=last_name,
            email=(row.get("email") or "").strip() or None,
            phone=(row.get("phone") or "").strip() or None,
            company_id=company_id,
            source="csv_import",
            custom_fields={"title": row["title"].strip()} if (row.get("title") or "").strip() else None,
            tenant_id=tenant_id,
            created_by=current_user.id,
        )

        # Assign tags
        for tag_id in tag_ids:
            await contact_repo.add_tag(contact.id, tag_id, tenant_id)

        imported += 1

    await db.commit()
    return {"imported": imported, "skipped": skipped, "errors": errors}


@router.post("", response_model=ContactResponse, status_code=201)
async def create_contact(
    data: ContactCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = ContactRepository(db)
    contact = await repo.create(
        first_name=data.first_name,
        last_name=data.last_name,
        email=data.email,
        phone=data.phone,
        company_id=data.company_id,
        source=data.source,
        status=data.status or "lead",
        custom_fields=data.custom_fields,
        tenant_id=current_user.tenant_id,
        created_by=current_user.id,
    )
    await db.commit()
    await db.refresh(contact)
    return _to_response(contact)


@router.get("", response_model=PaginatedResponse[ContactResponse])
async def list_contacts(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    sort_by: str = Query("created_at"),
    order: str = Query("desc"),
    company_id: Optional[uuid.UUID] = Query(None),
    owner_id: Optional[uuid.UUID] = Query(None),
    created_after: Optional[datetime] = Query(None),
    created_before: Optional[datetime] = Query(None),
    include_deleted: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = ContactRepository(db)
    contacts, total = await repo.list(
        current_user.tenant_id,
        page=page,
        per_page=per_page,
        sort_by=sort_by,
        order=order,
        company_id=company_id,
        owner_id=owner_id,
        created_after=created_after,
        created_before=created_before,
        include_deleted=include_deleted,
    )
    return PaginatedResponse(
        items=[_to_response(c) for c in contacts],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{contact_id}", response_model=ContactResponse)
async def get_contact(
    contact_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = ContactRepository(db)
    contact = await repo.get_by_id(contact_id, current_user.tenant_id)
    if not contact:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    return _to_response(contact)


@router.put("/{contact_id}", response_model=ContactResponse)
async def update_contact(
    contact_id: uuid.UUID,
    data: ContactCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = ContactRepository(db)
    contact = await repo.update(
        contact_id,
        current_user.tenant_id,
        data.model_dump(exclude_none=True),
    )
    if not contact:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    await db.commit()
    return _to_response(contact)


@router.patch("/{contact_id}", response_model=ContactResponse)
async def patch_contact(
    contact_id: uuid.UUID,
    data: ContactUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = ContactRepository(db)
    contact = await repo.update(
        contact_id,
        current_user.tenant_id,
        data.model_dump(exclude_none=True),
    )
    if not contact:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    await db.commit()
    return _to_response(contact)


@router.delete("/{contact_id}", status_code=204, response_class=Response)
async def delete_contact(
    contact_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = ContactRepository(db)
    deleted = await repo.soft_delete(contact_id, current_user.tenant_id)
    if not deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    await db.commit()


@router.post("/{contact_id}/tags", status_code=200)
async def assign_tags(
    contact_id: uuid.UUID,
    body: TagAssignRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = ContactRepository(db)
    for tag_id in body.tag_ids:
        ok = await repo.add_tag(contact_id, tag_id, current_user.tenant_id)
        if not ok:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Tag {tag_id} not found or cross-tenant")
    await db.commit()
    return {"assigned": len(body.tag_ids)}


@router.delete("/{contact_id}/tags/{tag_id}", status_code=204, response_class=Response)
async def remove_tag(
    contact_id: uuid.UUID,
    tag_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = ContactRepository(db)
    removed = await repo.remove_tag(contact_id, tag_id, current_user.tenant_id)
    if not removed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag assignment not found")
    await db.commit()
