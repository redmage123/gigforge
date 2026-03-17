"""US-313: Dashboard KPIs Sprint 2 — 5 new endpoints tests."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app
from core.dependencies import get_current_user
from database import get_db
from models.user import UserRole


def _make_user(role=UserRole.ADMIN, tenant_id=None):
    u = MagicMock()
    u.id = uuid.uuid4()
    u.tenant_id = tenant_id or uuid.uuid4()
    u.role = role
    return u


@pytest.fixture
def user():
    return _make_user()


@pytest.fixture
def client(user):
    db = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


class TestDashboardSprint2Endpoints:

    def test_summary_endpoint(self, client, user):
        """GET /api/v1/dashboard/summary returns key metrics."""
        with patch("routers.dashboard.DashboardRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_summary = AsyncMock(return_value={
                "total_contacts": 42,
                "total_deals": 15,
                "total_pipeline_value": 150000.0,
                "deals_won_this_month": 3,
            })
            resp = client.get("/api/v1/dashboard/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_contacts" in data
        assert "total_deals" in data
        assert "total_pipeline_value" in data
        assert "deals_won_this_month" in data

    def test_summary_has_cache_control_header(self, client, user):
        """GET /api/v1/dashboard/summary includes Cache-Control: max-age=60."""
        with patch("routers.dashboard.DashboardRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_summary = AsyncMock(return_value={
                "total_contacts": 0,
                "total_deals": 0,
                "total_pipeline_value": 0.0,
                "deals_won_this_month": 0,
            })
            resp = client.get("/api/v1/dashboard/summary")
        assert resp.status_code == 200
        assert "max-age=60" in resp.headers.get("cache-control", "")

    def test_pipeline_funnel_endpoint(self, client, user):
        """GET /api/v1/dashboard/pipeline-funnel returns stages with count and value."""
        with patch("routers.dashboard.DashboardRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_pipeline_funnel = AsyncMock(return_value=[
                {"stage_id": str(uuid.uuid4()), "stage_name": "Qualified", "count": 5, "value": 50000.0},
                {"stage_id": str(uuid.uuid4()), "stage_name": "Proposal", "count": 3, "value": 30000.0},
            ])
            resp = client.get("/api/v1/dashboard/pipeline-funnel")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert data[0]["stage_name"] == "Qualified"
        assert data[0]["count"] == 5

    def test_pipeline_funnel_cache_control(self, client, user):
        """GET /api/v1/dashboard/pipeline-funnel includes Cache-Control: max-age=60."""
        with patch("routers.dashboard.DashboardRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_pipeline_funnel = AsyncMock(return_value=[])
            resp = client.get("/api/v1/dashboard/pipeline-funnel")
        assert "max-age=60" in resp.headers.get("cache-control", "")

    def test_deal_velocity_endpoint(self, client, user):
        """GET /api/v1/dashboard/deal-velocity returns 12-week series."""
        with patch("routers.dashboard.DashboardRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_deal_velocity = AsyncMock(return_value=[
                {"week": "2026-W01", "deals_closed": 2, "total_value": 20000.0},
            ])
            resp = client.get("/api/v1/dashboard/deal-velocity")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_activity_feed_endpoint(self, client, user):
        """GET /api/v1/dashboard/activity-feed returns last 50 activities."""
        activity = MagicMock()
        activity.id = uuid.uuid4()
        activity.type = "call"
        activity.subject = "Follow up call"
        activity.contact_id = None
        activity.deal_id = None
        activity.company_id = None
        activity.performed_by = uuid.uuid4()
        activity.scheduled_at = None
        activity.completed_at = None

        with patch("routers.dashboard.DashboardRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_activity_feed = AsyncMock(return_value=[activity])
            resp = client.get("/api/v1/dashboard/activity-feed")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert data[0]["type"] == "call"

    def test_activity_feed_cache_control(self, client, user):
        """GET /api/v1/dashboard/activity-feed includes Cache-Control: max-age=60."""
        with patch("routers.dashboard.DashboardRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_activity_feed = AsyncMock(return_value=[])
            resp = client.get("/api/v1/dashboard/activity-feed")
        assert "max-age=60" in resp.headers.get("cache-control", "")

    def test_leaderboard_endpoint(self, client, user):
        """GET /api/v1/dashboard/leaderboard returns deals won per user this month."""
        with patch("routers.dashboard.DashboardRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_leaderboard = AsyncMock(return_value=[
                {"user_id": str(uuid.uuid4()), "username": "alice", "deals_won": 5, "total_value": 50000.0},
            ])
            resp = client.get("/api/v1/dashboard/leaderboard")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert data[0]["deals_won"] == 5

    def test_leaderboard_cache_control(self, client, user):
        """GET /api/v1/dashboard/leaderboard includes Cache-Control: max-age=60."""
        with patch("routers.dashboard.DashboardRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_leaderboard = AsyncMock(return_value=[])
            resp = client.get("/api/v1/dashboard/leaderboard")
        assert "max-age=60" in resp.headers.get("cache-control", "")

    def test_deal_velocity_cache_control(self, client, user):
        """GET /api/v1/dashboard/deal-velocity includes Cache-Control: max-age=60."""
        with patch("routers.dashboard.DashboardRepository") as MockRepo:
            instance = MockRepo.return_value
            instance.get_deal_velocity = AsyncMock(return_value=[])
            resp = client.get("/api/v1/dashboard/deal-velocity")
        assert "max-age=60" in resp.headers.get("cache-control", "")


class TestDashboardRepositorySprint2:

    @pytest.mark.asyncio
    async def test_get_summary(self):
        """DashboardRepository.get_summary returns aggregate metrics."""
        from repositories.dashboard_repo import DashboardRepository
        db = AsyncMock()

        def make_scalar(value):
            r = MagicMock()
            r.scalar.return_value = value
            return r

        db.execute = AsyncMock(side_effect=[
            make_scalar(42),    # total_contacts
            make_scalar(15),    # total_deals
            make_scalar(150000),  # pipeline_value (SUM)
            make_scalar(3),     # deals_won_this_month
        ])

        repo = DashboardRepository(db)
        result = await repo.get_summary(tenant_id=uuid.uuid4())
        assert result["total_contacts"] == 42
        assert result["total_deals"] == 15
        assert result["deals_won_this_month"] == 3

    @pytest.mark.asyncio
    async def test_get_pipeline_funnel(self):
        """DashboardRepository.get_pipeline_funnel groups deals by stage."""
        from repositories.dashboard_repo import DashboardRepository
        db = AsyncMock()

        row = MagicMock()
        row.stage_id = uuid.uuid4()
        row.stage_name = "Qualified"
        row.count = 5
        row.value = 50000.0

        mock_result = MagicMock()
        mock_result.all.return_value = [row]
        db.execute = AsyncMock(return_value=mock_result)

        repo = DashboardRepository(db)
        result = await repo.get_pipeline_funnel(tenant_id=uuid.uuid4())
        assert len(result) == 1
        assert result[0]["stage_name"] == "Qualified"

    @pytest.mark.asyncio
    async def test_get_deal_velocity(self):
        """DashboardRepository.get_deal_velocity returns 12 weeks of data."""
        from repositories.dashboard_repo import DashboardRepository
        db = AsyncMock()

        row = MagicMock()
        row.week = "2026-W01"
        row.deals_closed = 2
        row.total_value = 20000.0

        mock_result = MagicMock()
        mock_result.all.return_value = [row]
        db.execute = AsyncMock(return_value=mock_result)

        repo = DashboardRepository(db)
        result = await repo.get_deal_velocity(tenant_id=uuid.uuid4())
        assert isinstance(result, list)

    @pytest.mark.asyncio
    async def test_get_activity_feed(self):
        """DashboardRepository.get_activity_feed returns last 50 activities."""
        from repositories.dashboard_repo import DashboardRepository
        db = AsyncMock()

        activity = MagicMock()
        activity.id = uuid.uuid4()
        activity.type = "call"
        activity.subject = "Test"
        activity.contact_id = None
        activity.deal_id = None
        activity.company_id = None
        activity.performed_by = None
        activity.scheduled_at = None
        activity.completed_at = None

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [activity]
        db.execute = AsyncMock(return_value=mock_result)

        repo = DashboardRepository(db)
        result = await repo.get_activity_feed(tenant_id=uuid.uuid4())
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_get_leaderboard(self):
        """DashboardRepository.get_leaderboard returns per-user deal counts."""
        from repositories.dashboard_repo import DashboardRepository
        db = AsyncMock()

        row = MagicMock()
        row.user_id = uuid.uuid4()
        row.username = "alice"
        row.deals_won = 5
        row.total_value = 50000.0

        mock_result = MagicMock()
        mock_result.all.return_value = [row]
        db.execute = AsyncMock(return_value=mock_result)

        repo = DashboardRepository(db)
        result = await repo.get_leaderboard(tenant_id=uuid.uuid4())
        assert len(result) == 1
        assert result[0]["deals_won"] == 5
