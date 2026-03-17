"""Dashboard repository — tenant-scoped KPI aggregations (no N+1)."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from models.activity import Activity
from models.contact import Contact
from models.deal import Deal, DealStatus
from models.pipeline import Pipeline, PipelineStage
from models.task import Task, TaskStatus
from models.user import User


class DashboardRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_kpis(self, tenant_id: uuid.UUID) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        week_ago = now - timedelta(days=7)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # total_deals (non-archived)
        total_deals_r = await self.db.execute(
            select(func.count()).where(
                Deal.tenant_id == tenant_id,
                Deal.status != "archived",
            )
        )
        total_deals = total_deals_r.scalar() or 0

        # pipeline_value — total value of open deals
        pipeline_value_r = await self.db.execute(
            select(func.coalesce(func.sum(Deal.value), 0)).where(
                Deal.tenant_id == tenant_id,
                Deal.status == DealStatus.OPEN,
            )
        )
        pipeline_value = float(pipeline_value_r.scalar() or 0)

        # won_value — total value of WON deals this month
        won_value_r = await self.db.execute(
            select(func.coalesce(func.sum(Deal.value), 0)).where(
                Deal.tenant_id == tenant_id,
                Deal.status == DealStatus.WON,
                Deal.updated_at >= month_start,
            )
        )
        won_value = float(won_value_r.scalar() or 0)

        # conversion_rate — all-time won / (won + lost)
        won_count_r = await self.db.execute(
            select(func.count()).where(
                Deal.tenant_id == tenant_id,
                Deal.status == DealStatus.WON,
            )
        )
        won_count = won_count_r.scalar() or 0

        lost_count_r = await self.db.execute(
            select(func.count()).where(
                Deal.tenant_id == tenant_id,
                Deal.status == DealStatus.LOST,
            )
        )
        lost_count = lost_count_r.scalar() or 0

        closed_count = won_count + lost_count
        conversion_rate = won_count / closed_count if closed_count > 0 else 0.0

        # weighted_pipeline_value — sum(value * probability / 100) for open deals
        weighted_r = await self.db.execute(
            select(
                func.coalesce(func.sum(Deal.value * Deal.probability / 100), 0)
            ).where(
                Deal.tenant_id == tenant_id,
                Deal.status == DealStatus.OPEN,
            )
        )
        weighted_pipeline_value = float(weighted_r.scalar() or 0)

        # avg_deal_size
        avg_deal_size = pipeline_value / total_deals if total_deals > 0 else 0.0

        # open_tasks_count
        open_tasks_r = await self.db.execute(
            select(func.count()).where(
                Task.tenant_id == tenant_id,
                Task.status.in_([TaskStatus.OPEN, TaskStatus.IN_PROGRESS]),
            )
        )
        open_tasks_count = open_tasks_r.scalar() or 0

        # contacts_added_this_week
        contacts_week_r = await self.db.execute(
            select(func.count()).where(
                Contact.tenant_id == tenant_id,
                Contact.deleted_at.is_(None),
                Contact.created_at >= week_ago,
            )
        )
        contacts_added_this_week = contacts_week_r.scalar() or 0

        # deals_by_stage — open deals grouped by stage
        deals_by_stage_r = await self.db.execute(
            select(
                PipelineStage.name.label("stage_name"),
                func.count(Deal.id).label("count"),
                func.coalesce(func.sum(Deal.value), 0).label("value"),
            )
            .join(PipelineStage, Deal.stage_id == PipelineStage.id)
            .where(
                Deal.tenant_id == tenant_id,
                Deal.status == DealStatus.OPEN,
            )
            .group_by(PipelineStage.name, PipelineStage.order)
            .order_by(PipelineStage.order)
        )
        deals_by_stage = [
            {"stage_name": row.stage_name, "count": row.count, "value": float(row.value)}
            for row in deals_by_stage_r.all()
        ]

        # recent_activities — last 10
        recent_activities_r = await self.db.execute(
            select(
                Activity.id,
                Activity.type,
                Activity.subject,
                Activity.scheduled_at,
            )
            .where(Activity.tenant_id == tenant_id)
            .order_by(Activity.created_at.desc())
            .limit(10)
        )
        recent_activities = [
            {
                "id": str(row.id),
                "type": row.type,
                "subject": row.subject,
                "scheduled_at": row.scheduled_at.isoformat() if row.scheduled_at else None,
            }
            for row in recent_activities_r.all()
        ]

        return {
            "total_deals": total_deals,
            "pipeline_value": pipeline_value,
            "won_value": won_value,
            "conversion_rate": conversion_rate,
            "weighted_pipeline_value": weighted_pipeline_value,
            "avg_deal_size": avg_deal_size,
            "open_tasks_count": open_tasks_count,
            "contacts_added_this_week": contacts_added_this_week,
            "deals_by_stage": deals_by_stage,
            "recent_activities": recent_activities,
        }

    # ─── US-313: New Sprint 2 dashboard endpoints ─────────────────────────

    async def get_summary(self, tenant_id: uuid.UUID) -> Dict[str, Any]:
        """Total contacts, deals, open pipeline value, deals won this month."""
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        total_contacts_r = await self.db.execute(
            select(func.count()).where(
                Contact.tenant_id == tenant_id,
                Contact.deleted_at.is_(None),
            )
        )
        total_contacts = total_contacts_r.scalar() or 0

        total_deals_r = await self.db.execute(
            select(func.count()).where(
                Deal.tenant_id == tenant_id,
                Deal.status != "archived",
            )
        )
        total_deals = total_deals_r.scalar() or 0

        pipeline_value_r = await self.db.execute(
            select(func.coalesce(func.sum(Deal.value), 0)).where(
                Deal.tenant_id == tenant_id,
                Deal.status == DealStatus.OPEN,
            )
        )
        total_pipeline_value = float(pipeline_value_r.scalar() or 0)

        deals_won_r = await self.db.execute(
            select(func.count()).where(
                Deal.tenant_id == tenant_id,
                Deal.status == DealStatus.WON,
                Deal.updated_at >= month_start,
            )
        )
        deals_won_this_month = deals_won_r.scalar() or 0

        return {
            "total_contacts": total_contacts,
            "total_deals": total_deals,
            "total_pipeline_value": total_pipeline_value,
            "deals_won_this_month": deals_won_this_month,
        }

    async def get_pipeline_funnel(self, tenant_id: uuid.UUID) -> List[Dict[str, Any]]:
        """Deals grouped by stage with count and value — no N+1."""
        result = await self.db.execute(
            select(
                PipelineStage.id.label("stage_id"),
                PipelineStage.name.label("stage_name"),
                func.count(Deal.id).label("count"),
                func.coalesce(func.sum(Deal.value), 0).label("value"),
            )
            .join(Deal, Deal.stage_id == PipelineStage.id, isouter=True)
            .where(
                Deal.tenant_id == tenant_id,
                Deal.status == DealStatus.OPEN,
            )
            .group_by(PipelineStage.id, PipelineStage.name, PipelineStage.order)
            .order_by(PipelineStage.order)
        )
        return [
            {
                "stage_id": str(row.stage_id),
                "stage_name": row.stage_name,
                "count": row.count,
                "value": float(row.value),
            }
            for row in result.all()
        ]

    async def get_deal_velocity(self, tenant_id: uuid.UUID) -> List[Dict[str, Any]]:
        """12-week deal close rate — deals won per ISO week."""
        now = datetime.now(timezone.utc)
        twelve_weeks_ago = now - timedelta(weeks=12)

        result = await self.db.execute(
            text(
                """
                SELECT
                    TO_CHAR(DATE_TRUNC('week', updated_at), 'IYYY-"W"IW') AS week,
                    COUNT(*) AS deals_closed,
                    COALESCE(SUM(value), 0) AS total_value
                FROM deals
                WHERE tenant_id = :tenant_id
                  AND status = 'won'
                  AND updated_at >= :since
                GROUP BY DATE_TRUNC('week', updated_at)
                ORDER BY DATE_TRUNC('week', updated_at)
                """
            ),
            {"tenant_id": str(tenant_id), "since": twelve_weeks_ago.isoformat()},
        )
        return [
            {
                "week": row.week,
                "deals_closed": row.deals_closed,
                "total_value": float(row.total_value),
            }
            for row in result.all()
        ]

    async def get_activity_feed(
        self, tenant_id: uuid.UUID, limit: int = 50
    ) -> List[Activity]:
        """Last `limit` activities across all types, newest first — no N+1."""
        result = await self.db.execute(
            select(Activity)
            .where(Activity.tenant_id == tenant_id)
            .order_by(Activity.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_leaderboard(self, tenant_id: uuid.UUID) -> List[Dict[str, Any]]:
        """Deals won per user this month, sorted by count desc."""
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        result = await self.db.execute(
            select(
                User.id.label("user_id"),
                User.username.label("username"),
                func.count(Deal.id).label("deals_won"),
                func.coalesce(func.sum(Deal.value), 0).label("total_value"),
            )
            .join(Deal, Deal.assigned_to == User.id)
            .where(
                Deal.tenant_id == tenant_id,
                Deal.status == DealStatus.WON,
                Deal.updated_at >= month_start,
            )
            .group_by(User.id, User.username)
            .order_by(func.count(Deal.id).desc())
            .limit(10)
        )
        return [
            {
                "user_id": str(row.user_id),
                "username": row.username,
                "deals_won": row.deals_won,
                "total_value": float(row.total_value),
            }
            for row in result.all()
        ]
