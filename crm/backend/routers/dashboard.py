"""Dashboard KPI endpoints — US-050 / US-313."""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user
from database import get_db
from repositories.dashboard_repo import DashboardRepository

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])

_CACHE_HEADER = {"Cache-Control": "max-age=60"}


@router.get("/kpis")
async def get_kpis(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = DashboardRepository(db)
    return await repo.get_kpis(tenant_id=current_user.tenant_id)


@router.get("/summary")
async def get_summary(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """US-313: Summary KPIs — total_contacts, total_deals, total_pipeline_value, deals_won_this_month."""
    repo = DashboardRepository(db)
    data = await repo.get_summary(tenant_id=current_user.tenant_id)
    return JSONResponse(content=data, headers=_CACHE_HEADER)


@router.get("/pipeline-funnel")
async def get_pipeline_funnel(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """US-313: Deals grouped by stage with count and value."""
    repo = DashboardRepository(db)
    data = await repo.get_pipeline_funnel(tenant_id=current_user.tenant_id)
    return JSONResponse(content=data, headers=_CACHE_HEADER)


@router.get("/deal-velocity")
async def get_deal_velocity(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """US-313: 12-week deal close rate."""
    repo = DashboardRepository(db)
    data = await repo.get_deal_velocity(tenant_id=current_user.tenant_id)
    return JSONResponse(content=data, headers=_CACHE_HEADER)


@router.get("/activity-feed")
async def get_activity_feed(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """US-313: Last 50 activities, newest first."""
    repo = DashboardRepository(db)
    activities = await repo.get_activity_feed(tenant_id=current_user.tenant_id)
    data = [
        {
            "id": str(a.id),
            "type": a.type,
            "subject": a.subject,
            "contact_id": str(a.contact_id) if a.contact_id else None,
            "deal_id": str(a.deal_id) if a.deal_id else None,
            "company_id": str(a.company_id) if a.company_id else None,
            "performed_by": str(a.performed_by) if a.performed_by else None,
            "scheduled_at": a.scheduled_at.isoformat() if a.scheduled_at else None,
            "completed_at": a.completed_at.isoformat() if a.completed_at else None,
        }
        for a in activities
    ]
    return JSONResponse(content=data, headers=_CACHE_HEADER)


@router.get("/leaderboard")
async def get_leaderboard(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """US-313: Deals won per user this month."""
    repo = DashboardRepository(db)
    data = await repo.get_leaderboard(tenant_id=current_user.tenant_id)
    return JSONResponse(content=data, headers=_CACHE_HEADER)
