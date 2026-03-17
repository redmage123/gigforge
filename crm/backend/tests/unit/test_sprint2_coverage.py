"""Coverage gap tests for Sprint 2 stories — pipelines, deals, activities, tasks."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from core.dependencies import get_current_user
from database import get_db

TENANT_ID = uuid.uuid4()
USER_ID = uuid.uuid4()
PIPELINE_ID = uuid.uuid4()
STAGE_ID = uuid.uuid4()
DEAL_ID = uuid.uuid4()
ACTIVITY_ID = uuid.uuid4()
TASK_ID = uuid.uuid4()


def _make_user():
    u = MagicMock()
    u.id = USER_ID
    u.tenant_id = TENANT_ID
    u.role = "admin"
    u.is_active = True
    return u


def _make_pipeline():
    p = MagicMock()
    p.id = PIPELINE_ID
    p.tenant_id = TENANT_ID
    p.name = "Sales"
    p.is_default = True
    p.stages = []
    return p


def _make_stage():
    s = MagicMock()
    s.id = STAGE_ID
    s.pipeline_id = PIPELINE_ID
    s.name = "Qualified"
    s.order = 1
    s.stage_type = "active"
    s.probability_pct = 30
    s.color = "#3B82F6"
    return s


def _make_deal(status_val="open"):
    d = MagicMock()
    d.id = DEAL_ID
    d.tenant_id = TENANT_ID
    d.title = "Big Deal"
    d.value = 5000.0
    d.currency = "USD"
    d.pipeline_id = PIPELINE_ID
    d.stage_id = STAGE_ID
    d.contact_id = None
    d.company_id = None
    d.assigned_to = None
    d.probability = 50
    d.expected_close = None
    d.status = status_val
    d.notes = None
    return d


def _make_activity():
    a = MagicMock()
    a.id = ACTIVITY_ID
    a.tenant_id = TENANT_ID
    a.type = "call"
    a.subject = "Follow-up"
    a.description = None
    a.contact_id = None
    a.deal_id = DEAL_ID
    a.company_id = None
    a.performed_by = USER_ID
    a.scheduled_at = None
    a.completed_at = None
    return a


def _make_task():
    t = MagicMock()
    t.id = TASK_ID
    t.tenant_id = TENANT_ID
    t.title = "Send proposal"
    t.description = None
    t.assigned_to = USER_ID
    t.contact_id = None
    t.deal_id = None
    t.due_date = None
    t.priority = "medium"
    t.status = "open"
    return t


def _db():
    db = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.flush = AsyncMock()
    return db


# ---------------------------------------------------------------------------
# Pipelines — dependency override pattern
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_pipelines():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        with patch("routers.pipelines.PipelineRepository") as MockRepo:
            MockRepo.return_value.list = AsyncMock(return_value=[_make_pipeline()])
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get("/api/v1/pipelines")
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_create_pipeline():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        pipeline = _make_pipeline()
        with patch("routers.pipelines.PipelineRepository") as MockRepo:
            MockRepo.return_value.create = AsyncMock(return_value=pipeline)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.post("/api/v1/pipelines", json={"name": "Sales", "is_default": True})
        assert resp.status_code == 201
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_add_stage_success():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        stage = _make_stage()
        with patch("routers.pipelines.PipelineRepository") as MockRepo:
            MockRepo.return_value.add_stage = AsyncMock(return_value=stage)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.post(
                    f"/api/v1/pipelines/{PIPELINE_ID}/stages",
                    json={"name": "Qualified", "order": 1},
                )
        assert resp.status_code == 201
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_add_stage_not_found():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        with patch("routers.pipelines.PipelineRepository") as MockRepo:
            MockRepo.return_value.add_stage = AsyncMock(return_value=None)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.post(
                    f"/api/v1/pipelines/{uuid.uuid4()}/stages",
                    json={"name": "X", "order": 0},
                )
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_update_stage_success():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        stage = _make_stage()
        with patch("routers.pipelines.PipelineRepository") as MockRepo:
            MockRepo.return_value.update_stage = AsyncMock(return_value=stage)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.patch(
                    f"/api/v1/pipelines/{PIPELINE_ID}/stages/{STAGE_ID}",
                    json={"name": "Updated"},
                )
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_update_stage_not_found():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        with patch("routers.pipelines.PipelineRepository") as MockRepo:
            MockRepo.return_value.update_stage = AsyncMock(return_value=None)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.patch(
                    f"/api/v1/pipelines/{PIPELINE_ID}/stages/{uuid.uuid4()}",
                    json={"name": "X"},
                )
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# Deals
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_deal():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        with patch("routers.deals.DealRepository") as MockRepo:
            MockRepo.return_value.create = AsyncMock(return_value=_make_deal())
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.post(
                    "/api/v1/deals",
                    json={"title": "Big Deal", "pipeline_id": str(PIPELINE_ID), "stage_id": str(STAGE_ID)},
                )
        assert resp.status_code == 201
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_list_deals():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        with patch("routers.deals.DealRepository") as MockRepo:
            MockRepo.return_value.list = AsyncMock(return_value=([_make_deal()], 1))
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get("/api/v1/deals")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_get_deal_success():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        with patch("routers.deals.DealRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(return_value=_make_deal())
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get(f"/api/v1/deals/{DEAL_ID}")
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_get_deal_not_found():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        with patch("routers.deals.DealRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(return_value=None)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get(f"/api/v1/deals/{uuid.uuid4()}")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_update_deal_success():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        with patch("routers.deals.DealRepository") as MockRepo:
            MockRepo.return_value.update = AsyncMock(return_value=_make_deal())
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.put(f"/api/v1/deals/{DEAL_ID}", json={"title": "Updated"})
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_update_deal_not_found():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        with patch("routers.deals.DealRepository") as MockRepo:
            MockRepo.return_value.update = AsyncMock(return_value=None)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.put(f"/api/v1/deals/{uuid.uuid4()}", json={"title": "X"})
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_delete_deal():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        with patch("routers.deals.DealRepository") as MockRepo:
            MockRepo.return_value.soft_delete = AsyncMock(return_value=True)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.delete(f"/api/v1/deals/{DEAL_ID}")
        assert resp.status_code == 204
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_delete_deal_not_found():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        with patch("routers.deals.DealRepository") as MockRepo:
            MockRepo.return_value.soft_delete = AsyncMock(return_value=False)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.delete(f"/api/v1/deals/{uuid.uuid4()}")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_move_deal_stage_success():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        deal = _make_deal()
        new_stage_id = uuid.uuid4()
        stage = MagicMock()
        stage.id = new_stage_id
        stage.pipeline_id = PIPELINE_ID  # matches deal's pipeline

        updated_deal = _make_deal()
        updated_deal.stage_id = new_stage_id

        with patch("routers.deals.DealRepository") as MockDeal, \
             patch("routers.deals.PipelineRepository") as MockPipeline:
            MockDeal.return_value.get_by_id = AsyncMock(return_value=deal)
            MockDeal.return_value.move_stage = AsyncMock(return_value=updated_deal)
            MockPipeline.return_value.get_stage_by_id = AsyncMock(return_value=stage)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.patch(
                    f"/api/v1/deals/{DEAL_ID}/stage",
                    json={"stage_id": str(new_stage_id)},
                )
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_move_deal_stage_deal_not_found():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        with patch("routers.deals.DealRepository") as MockDeal, \
             patch("routers.deals.PipelineRepository"):
            MockDeal.return_value.get_by_id = AsyncMock(return_value=None)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.patch(
                    f"/api/v1/deals/{uuid.uuid4()}/stage",
                    json={"stage_id": str(uuid.uuid4())},
                )
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_move_deal_stage_wrong_pipeline():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        deal = _make_deal()
        stage = MagicMock()
        stage.pipeline_id = uuid.uuid4()  # DIFFERENT pipeline

        with patch("routers.deals.DealRepository") as MockDeal, \
             patch("routers.deals.PipelineRepository") as MockPipeline:
            MockDeal.return_value.get_by_id = AsyncMock(return_value=deal)
            MockPipeline.return_value.get_stage_by_id = AsyncMock(return_value=stage)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.patch(
                    f"/api/v1/deals/{DEAL_ID}/stage",
                    json={"stage_id": str(uuid.uuid4())},
                )
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_move_deal_stage_not_found():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        deal = _make_deal()
        with patch("routers.deals.DealRepository") as MockDeal, \
             patch("routers.deals.PipelineRepository") as MockPipeline:
            MockDeal.return_value.get_by_id = AsyncMock(return_value=deal)
            MockPipeline.return_value.get_stage_by_id = AsyncMock(return_value=None)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.patch(
                    f"/api/v1/deals/{DEAL_ID}/stage",
                    json={"stage_id": str(uuid.uuid4())},
                )
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# Activities
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_activity():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        with patch("routers.activities.ActivityRepository") as MockRepo:
            MockRepo.return_value.create = AsyncMock(return_value=_make_activity())
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.post(
                    "/api/v1/activities",
                    json={"type": "call", "subject": "Follow-up"},
                )
        assert resp.status_code == 201
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_list_activities():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        with patch("routers.activities.ActivityRepository") as MockRepo:
            MockRepo.return_value.list = AsyncMock(return_value=([_make_activity()], 1))
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get("/api/v1/activities")
        assert resp.status_code == 200
        assert resp.json()["total"] == 1
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_task():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        with patch("routers.tasks.TaskRepository") as MockRepo:
            MockRepo.return_value.create = AsyncMock(return_value=_make_task())
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.post(
                    "/api/v1/tasks",
                    json={"title": "Send proposal", "priority": "high"},
                )
        assert resp.status_code == 201
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_list_tasks():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        with patch("routers.tasks.TaskRepository") as MockRepo:
            MockRepo.return_value.list = AsyncMock(return_value=([_make_task()], 1))
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get("/api/v1/tasks")
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_patch_task_success():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        updated = _make_task()
        updated.status = "done"
        with patch("routers.tasks.TaskRepository") as MockRepo:
            MockRepo.return_value.update = AsyncMock(return_value=updated)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.patch(f"/api/v1/tasks/{TASK_ID}", json={"status": "done"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "done"
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_patch_task_not_found():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        with patch("routers.tasks.TaskRepository") as MockRepo:
            MockRepo.return_value.update = AsyncMock(return_value=None)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.patch(f"/api/v1/tasks/{uuid.uuid4()}", json={"status": "done"})
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_kpis():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: _db()
    try:
        kpis = {
            "total_deals": 18, "pipeline_value": 95000.0,
            "won_value": 25000.0, "conversion_rate": 0.75,
            "weighted_pipeline_value": 47500.0, "avg_deal_size": 5277.78,
            "open_tasks_count": 4, "contacts_added_this_week": 5,
            "deals_by_stage": [], "recent_activities": [],
        }
        with patch("routers.dashboard.DashboardRepository") as MockRepo:
            MockRepo.return_value.get_kpis = AsyncMock(return_value=kpis)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get("/api/v1/dashboard/kpis")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_deals"] == 18
        assert data["pipeline_value"] == 95000.0
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)
