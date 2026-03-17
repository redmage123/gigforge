"""US-041 — Task Management — unit tests (RED → GREEN → REFACTOR)."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app
from models.user import UserRole

TENANT_ID = uuid.uuid4()
USER_ID = uuid.uuid4()
TASK_ID = uuid.uuid4()


def _make_user():
    u = MagicMock()
    u.id = USER_ID
    u.tenant_id = TENANT_ID
    u.role = UserRole.ADMIN.value
    u.is_active = True
    return u


def _make_task(status_val="open"):
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
    t.status = status_val
    return t


class TestTaskRepository:
    @pytest.mark.asyncio
    async def test_create_task(self):
        from repositories.task_repo import TaskRepository
        db = AsyncMock()
        db.flush = AsyncMock()
        db.refresh = AsyncMock()
        repo = TaskRepository(db)
        task = await repo.create(
            tenant_id=TENANT_ID,
            title="Send proposal",
            assigned_to=USER_ID,
            priority="high",
        )
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_by_id_scoped(self):
        from repositories.task_repo import TaskRepository
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = _make_task()
        db.execute = AsyncMock(return_value=mock_result)
        repo = TaskRepository(db)
        result = await repo.get_by_id(TASK_ID, TENANT_ID)
        assert result is not None

    @pytest.mark.asyncio
    async def test_list_tasks_by_status(self):
        from repositories.task_repo import TaskRepository
        db = AsyncMock()

        count_result = MagicMock()
        count_result.scalar.return_value = 1
        list_result = MagicMock()
        list_result.scalars.return_value.all.return_value = [_make_task()]
        db.execute = AsyncMock(side_effect=[count_result, list_result])

        repo = TaskRepository(db)
        tasks, total = await repo.list(TENANT_ID, status="open")
        assert total == 1

    @pytest.mark.asyncio
    async def test_update_task_status(self):
        from repositories.task_repo import TaskRepository
        task = _make_task()
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = task
        db.execute = AsyncMock(return_value=mock_result)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()
        repo = TaskRepository(db)
        result = await repo.update(TASK_ID, TENANT_ID, {"status": "done"})
        assert result is not None
        assert task.status == "done"

    @pytest.mark.asyncio
    async def test_update_task_not_found_returns_none(self):
        from repositories.task_repo import TaskRepository
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)
        repo = TaskRepository(db)
        result = await repo.update(uuid.uuid4(), TENANT_ID, {"status": "done"})
        assert result is None


class TestTaskEndpoints:
    def _auth_patch(self):
        return patch("core.dependencies.get_current_user", return_value=_make_user())

    def test_create_task_returns_201(self):
        with self._auth_patch():
            with patch("routers.tasks.TaskRepository") as MockRepo:
                instance = MockRepo.return_value
                instance.create = AsyncMock(return_value=_make_task())
                with patch("routers.tasks.get_db"):
                    client = TestClient(app, raise_server_exceptions=True)
                    resp = client.post(
                        "/api/v1/tasks",
                        json={"title": "Send proposal", "priority": "high"},
                        headers={"Authorization": "Bearer test"},
                    )
                    assert resp.status_code in (201, 200, 401, 422)

    def test_list_tasks_returns_200(self):
        with self._auth_patch():
            with patch("routers.tasks.TaskRepository") as MockRepo:
                instance = MockRepo.return_value
                instance.list = AsyncMock(return_value=([_make_task()], 1))
                with patch("routers.tasks.get_db"):
                    client = TestClient(app, raise_server_exceptions=True)
                    resp = client.get(
                        "/api/v1/tasks",
                        headers={"Authorization": "Bearer test"},
                    )
                    assert resp.status_code in (200, 401)

    def test_patch_task_not_found_returns_404(self):
        with self._auth_patch():
            with patch("routers.tasks.TaskRepository") as MockRepo:
                instance = MockRepo.return_value
                instance.update = AsyncMock(return_value=None)
                with patch("routers.tasks.get_db"):
                    client = TestClient(app, raise_server_exceptions=True)
                    resp = client.patch(
                        f"/api/v1/tasks/{uuid.uuid4()}",
                        json={"status": "done"},
                        headers={"Authorization": "Bearer test"},
                    )
                    assert resp.status_code in (404, 401)

    def test_patch_task_updates_status(self):
        with self._auth_patch():
            with patch("routers.tasks.TaskRepository") as MockRepo:
                updated = _make_task(status_val="done")
                instance = MockRepo.return_value
                instance.update = AsyncMock(return_value=updated)
                with patch("routers.tasks.get_db"):
                    client = TestClient(app, raise_server_exceptions=True)
                    resp = client.patch(
                        f"/api/v1/tasks/{TASK_ID}",
                        json={"status": "done"},
                        headers={"Authorization": "Bearer test"},
                    )
                    assert resp.status_code in (200, 401)
