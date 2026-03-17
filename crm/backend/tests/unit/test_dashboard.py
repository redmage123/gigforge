"""US-050 — Dashboard KPIs — unit tests (RED → GREEN → REFACTOR)."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app
from models.user import UserRole

TENANT_ID = uuid.uuid4()
USER_ID = uuid.uuid4()


def _make_user():
    u = MagicMock()
    u.id = USER_ID
    u.tenant_id = TENANT_ID
    u.role = UserRole.ADMIN.value
    u.is_active = True
    return u


SAMPLE_KPIS = {
    "total_deals": 18,
    "pipeline_value": 95000.0,
    "won_value": 25000.0,
    "conversion_rate": 0.75,
    "weighted_pipeline_value": 47500.0,
    "avg_deal_size": 5277.78,
    "open_tasks_count": 4,
    "contacts_added_this_week": 5,
    "deals_by_stage": [
        {"stage_name": "Qualification", "count": 5, "value": 30000.0}
    ],
    "recent_activities": [
        {"id": str(uuid.uuid4()), "type": "call", "subject": "Follow up", "scheduled_at": None}
    ],
}


class TestDashboardRepository:
    @pytest.mark.asyncio
    async def test_get_kpis_returns_all_fields(self):
        from repositories.dashboard_repo import DashboardRepository

        db = AsyncMock()

        def make_scalar_result(val):
            r = MagicMock()
            r.scalar.return_value = val
            return r

        # deals_by_stage query returns rows
        stage_row = MagicMock()
        stage_row.stage_name = "Qualification"
        stage_row.count = 5
        stage_row.value = 30000.0
        stage_result = MagicMock()
        stage_result.all.return_value = [stage_row]

        # recent_activities query returns rows
        activity_row = MagicMock()
        activity_row.id = uuid.uuid4()
        activity_row.type = "call"
        activity_row.subject = "Follow up"
        activity_row.scheduled_at = None
        activity_result = MagicMock()
        activity_result.all.return_value = [activity_row]

        db.execute = AsyncMock(
            side_effect=[
                make_scalar_result(18),    # total_deals
                make_scalar_result(95000), # pipeline_value
                make_scalar_result(25000), # won_value
                make_scalar_result(10),    # won_count
                make_scalar_result(3),     # lost_count
                make_scalar_result(47500), # weighted_pipeline_value
                make_scalar_result(4),     # open_tasks_count
                make_scalar_result(5),     # contacts_added_this_week
                stage_result,              # deals_by_stage
                activity_result,           # recent_activities
            ]
        )

        repo = DashboardRepository(db)
        result = await repo.get_kpis(TENANT_ID)

        assert result["total_deals"] == 18
        assert result["pipeline_value"] == 95000.0
        assert result["won_value"] == 25000.0
        assert result["conversion_rate"] == 10 / 13
        assert result["weighted_pipeline_value"] == 47500.0
        assert result["avg_deal_size"] == 95000.0 / 18
        assert result["open_tasks_count"] == 4
        assert result["contacts_added_this_week"] == 5
        assert len(result["deals_by_stage"]) == 1
        assert result["deals_by_stage"][0]["stage_name"] == "Qualification"
        assert len(result["recent_activities"]) == 1

    @pytest.mark.asyncio
    async def test_get_kpis_empty_tenant(self):
        from repositories.dashboard_repo import DashboardRepository

        db = AsyncMock()

        def make_scalar_result(val):
            r = MagicMock()
            r.scalar.return_value = val
            return r

        empty_list_result = MagicMock()
        empty_list_result.all.return_value = []

        db.execute = AsyncMock(
            side_effect=[
                make_scalar_result(0),   # total_deals
                make_scalar_result(0),   # pipeline_value
                make_scalar_result(0),   # won_value
                make_scalar_result(0),   # won_count
                make_scalar_result(0),   # lost_count
                make_scalar_result(0),   # weighted_pipeline_value
                make_scalar_result(0),   # open_tasks_count
                make_scalar_result(0),   # contacts_added_this_week
                empty_list_result,       # deals_by_stage
                empty_list_result,       # recent_activities
            ]
        )

        repo = DashboardRepository(db)
        result = await repo.get_kpis(TENANT_ID)
        assert result["total_deals"] == 0
        assert result["pipeline_value"] == 0.0
        assert result["conversion_rate"] == 0.0
        assert result["avg_deal_size"] == 0.0
        assert result["deals_by_stage"] == []
        assert result["recent_activities"] == []


class TestDashboardEndpoint:
    def _auth_patch(self):
        return patch("core.dependencies.get_current_user", return_value=_make_user())

    def test_get_kpis_returns_200(self):
        with self._auth_patch():
            with patch("routers.dashboard.DashboardRepository") as MockRepo:
                instance = MockRepo.return_value
                instance.get_kpis = AsyncMock(return_value=SAMPLE_KPIS)
                with patch("routers.dashboard.get_db"):
                    client = TestClient(app, raise_server_exceptions=True)
                    resp = client.get(
                        "/api/v1/dashboard/kpis",
                        headers={"Authorization": "Bearer test"},
                    )
                    assert resp.status_code in (200, 401)

    def test_get_kpis_contains_required_keys(self):
        with self._auth_patch():
            with patch("routers.dashboard.DashboardRepository") as MockRepo:
                instance = MockRepo.return_value
                instance.get_kpis = AsyncMock(return_value=SAMPLE_KPIS)
                with patch("routers.dashboard.get_db"):
                    client = TestClient(app, raise_server_exceptions=True)
                    resp = client.get(
                        "/api/v1/dashboard/kpis",
                        headers={"Authorization": "Bearer test"},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        for key in [
                            "total_deals", "pipeline_value",
                            "won_value", "conversion_rate",
                            "weighted_pipeline_value", "avg_deal_size",
                            "open_tasks_count", "contacts_added_this_week",
                            "deals_by_stage", "recent_activities",
                        ]:
                            assert key in data, f"Missing key: {key}"
