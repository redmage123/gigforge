"""Companies CRUD endpoints — all scoped to current user's tenant."""
from fastapi.responses import Response
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user
from database import get_db
from models import User
from repositories.company_repo import CompanyRepository
from repositories.contact_repo import ContactRepository
from schemas.common import PaginatedResponse
from schemas.company import CompanyCreate, CompanyResponse, CompanyUpdate
from schemas.contact import ContactResponse

router = APIRouter()


@router.post("", response_model=CompanyResponse, status_code=201)
async def create_company(
    data: CompanyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = CompanyRepository(db)
    company = await repo.create(
        name=data.name,
        tenant_id=current_user.tenant_id,
        domain=data.domain,
        industry=data.industry,
        size=data.size,
        address=data.address,
        notes=data.notes,
    )
    await db.commit()
    return company


@router.get("", response_model=PaginatedResponse[CompanyResponse])
async def list_companies(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    include_deleted: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = CompanyRepository(db)
    companies, total = await repo.list(
        current_user.tenant_id,
        page=page,
        per_page=per_page,
        include_deleted=include_deleted,
    )
    return PaginatedResponse(items=companies, total=total, page=page, per_page=per_page)


@router.get("/{company_id}", response_model=CompanyResponse)
async def get_company(
    company_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = CompanyRepository(db)
    company = await repo.get_by_id(company_id, current_user.tenant_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    return company


@router.put("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: uuid.UUID,
    data: CompanyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = CompanyRepository(db)
    company = await repo.update(
        company_id, current_user.tenant_id, data.model_dump(exclude_none=True)
    )
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    await db.commit()
    return company


@router.patch("/{company_id}", response_model=CompanyResponse)
async def patch_company(
    company_id: uuid.UUID,
    data: CompanyUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = CompanyRepository(db)
    company = await repo.update(
        company_id, current_user.tenant_id, data.model_dump(exclude_none=True)
    )
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    await db.commit()
    return company


@router.delete("/{company_id}", status_code=204, response_class=Response)
async def delete_company(
    company_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = CompanyRepository(db)
    deleted = await repo.soft_delete(company_id, current_user.tenant_id)
    if not deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    await db.commit()


@router.get("/{company_id}/contacts", response_model=PaginatedResponse[ContactResponse])
async def get_company_contacts(
    company_id: uuid.UUID,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify company is in tenant first
    company_repo = CompanyRepository(db)
    company = await company_repo.get_by_id(company_id, current_user.tenant_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")

    contacts, total = await company_repo.get_contacts(
        company_id, current_user.tenant_id, page=page, per_page=per_page
    )
    items = [
        ContactResponse(
            id=c.id,
            tenant_id=c.tenant_id,
            first_name=c.first_name,
            last_name=c.last_name,
            email=c.email,
            phone=c.phone,
            company_id=c.company_id,
            source=c.source,
            status=c.status,
            custom_fields=c.custom_fields,
            deleted_at=c.deleted_at,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in contacts
    ]
    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page)
