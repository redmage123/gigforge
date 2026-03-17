"""Global search endpoint — US-050."""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user
from database import get_db
from repositories import search_repo as _search_repo_mod

router = APIRouter(prefix="/api/search", tags=["search"])

_VALID_TYPES = {"contacts", "companies", "deals"}


def _contact_out(c: Any) -> Dict[str, Any]:
    return {
        "id": str(c.id),
        "type": "contact",
        "first_name": c.first_name,
        "last_name": c.last_name,
        "email": c.email,
        "phone": c.phone,
        "status": c.status,
        "company_id": str(c.company_id) if c.company_id else None,
    }


def _company_out(c: Any) -> Dict[str, Any]:
    return {
        "id": str(c.id),
        "type": "company",
        "name": c.name,
        "domain": c.domain,
        "industry": c.industry,
        "size": c.size,
    }


def _deal_out(d: Any) -> Dict[str, Any]:
    return {
        "id": str(d.id),
        "type": "deal",
        "title": d.title,
        "value": float(d.value) if d.value is not None else None,
        "currency": d.currency,
        "status": d.status,
        "pipeline_id": str(d.pipeline_id),
        "stage_id": str(d.stage_id),
    }


@router.get("")
async def global_search(
    q: str = Query(..., min_length=2, description="Search query (min 2 chars)"),
    types: str = Query("contacts,companies,deals", description="Comma-separated entity types"),
    limit: int = Query(10, ge=1, le=50),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    requested = {t.strip() for t in types.split(",") if t.strip()}
    search_types = list(requested & _VALID_TYPES)

    repo = _search_repo_mod.SearchRepository(db)
    raw = await repo.search(
        tenant_id=current_user.tenant_id,
        query=q,
        types=search_types,
        limit=limit,
    )

    return {
        "query": q,
        "contacts": [_contact_out(c) for c in raw.get("contacts", [])],
        "companies": [_company_out(c) for c in raw.get("companies", [])],
        "deals": [_deal_out(d) for d in raw.get("deals", [])],
    }
