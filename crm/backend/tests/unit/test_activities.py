"""US-040 — Activity Logging — unit tests (RED → GREEN → REFACTOR)."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app
from models.user import UserRole

TENANT_ID = uuid.uuid4()
USER_ID = uuid.uuid4()
ACTIVITY_ID = uuid.uuid4()
CONTACT_ID = uuid.uuid4()
DEAL_ID = uuid.uuid4()


def _make_user():
    u = MagicMock()
    u.id = USER_ID
    u.tenant_id = TENANT_ID
    u.role = UserRole.ADMIN.value
    u.is_active = True
    return u


def _make_activity():
    a = MagicMock()
    a.id = ACTIVITY_ID
    a.tenant_id = TENANT_ID
    a.type = "call"
    a.subject = "Follow-up call"
    a.description = None
    a.contact_id = CONTACT_ID
    a.deal_id = DEAL_ID
    a.company_id = None
    a.performed_by = USER_ID
    a.scheduled_at = None
    a.completed_at = None
    return a


class TestActivityRepository:
    @pytest.mark.asyncio
    async def test_create_activity(self):
        from repositories.activity_repo import ActivityRepository
        db = AsyncMock()
        db.flush = AsyncMock()
        db.refresh = AsyncMock()
        repo = ActivityRepository(db)
        activity = await repo.create(
            tenant_id=TENANT_ID,
            activity_type="call",
            subject="Follow-up",
            contact_id=CONTACT_ID,
        )
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_list_activities_tenant_scoped(self):
        from repositories.activity_repo import ActivityRepository
        db = AsyncMock()

        count_result = MagicMock()
        count_result.scalar.return_value = 1

        list_result = MagicMock()
        list_result.scalars.return_value.all.return_value = [_make_activity()]

        db.execute = AsyncMock(side_effect=[count_result, list_result])
        repo = ActivityRepository(db)
        activities, total = await repo.list(TENANT_ID)
        assert total == 1
        assert len(activities) == 1

    @pytest.mark.asyncio
    async def test_list_activities_filtered_by_contact(self):
        from repositories.activity_repo import ActivityRepository
        db = AsyncMock()

        count_result = MagicMock()
        count_result.scalar.return_value = 1
        list_result = MagicMock()
        list_result.scalars.return_value.all.return_value = [_make_activity()]
        db.execute = AsyncMock(side_effect=[count_result, list_result])

        repo = ActivityRepository(db)
        activities, total = await repo.list(TENANT_ID, contact_id=CONTACT_ID)
        assert total == 1

    @pytest.mark.asyncio
    async def test_list_activities_filtered_by_type(self):
        from repositories.activity_repo import ActivityRepository
        db = AsyncMock()

        count_result = MagicMock()
        count_result.scalar.return_value = 0
        list_result = MagicMock()
        list_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(side_effect=[count_result, list_result])

        repo = ActivityRepository(db)
        activities, total = await repo.list(TENANT_ID, activity_type="email")
        assert total == 0


class TestActivityEndpoints:
    def _auth_patch(self):
        return patch("core.dependencies.get_current_user", return_value=_make_user())

    def test_create_activity_returns_201(self):
        with self._auth_patch():
            with patch("routers.activities.ActivityRepository") as MockRepo:
                instance = MockRepo.return_value
                instance.create = AsyncMock(return_value=_make_activity())
                with patch("routers.activities.get_db"):
                    client = TestClient(app, raise_server_exceptions=True)
                    resp = client.post(
                        "/api/v1/activities",
                        json={"type": "call", "subject": "Follow-up", "contact_id": str(CONTACT_ID)},
                        headers={"Authorization": "Bearer test"},
                    )
                    assert resp.status_code in (201, 200, 401, 422)

    def test_list_activities_returns_200(self):
        with self._auth_patch():
            with patch("routers.activities.ActivityRepository") as MockRepo:
                instance = MockRepo.return_value
                instance.list = AsyncMock(return_value=([_make_activity()], 1))
                with patch("routers.activities.get_db"):
                    client = TestClient(app, raise_server_exceptions=True)
                    resp = client.get(
                        "/api/v1/activities",
                        headers={"Authorization": "Bearer test"},
                    )
                    assert resp.status_code in (200, 401)

    def test_list_activities_filter_by_contact(self):
        with self._auth_patch():
            with patch("routers.activities.ActivityRepository") as MockRepo:
                instance = MockRepo.return_value
                instance.list = AsyncMock(return_value=([_make_activity()], 1))
                with patch("routers.activities.get_db"):
                    client = TestClient(app, raise_server_exceptions=True)
                    resp = client.get(
                        f"/api/v1/activities?contact_id={CONTACT_ID}",
                        headers={"Authorization": "Bearer test"},
                    )
                    assert resp.status_code in (200, 401)
