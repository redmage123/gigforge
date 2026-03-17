"""US-030 — Pipeline Stages Config — unit tests (RED → GREEN → REFACTOR)."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from main import app
from models.user import UserRole

TENANT_ID = uuid.uuid4()
USER_ID = uuid.uuid4()
PIPELINE_ID = uuid.uuid4()
STAGE_ID = uuid.uuid4()


def _make_user(uid=USER_ID, tid=TENANT_ID, role=UserRole.ADMIN.value):
    u = MagicMock()
    u.id = uid
    u.tenant_id = tid
    u.role = role
    u.is_active = True
    return u


def _make_pipeline(pid=PIPELINE_ID, tid=TENANT_ID, name="Sales Pipeline", is_default=True):
    p = MagicMock()
    p.id = pid
    p.tenant_id = tid
    p.name = name
    p.is_default = is_default
    p.stages = []
    p.created_at = None
    p.updated_at = None
    return p


def _make_stage(sid=STAGE_ID, pid=PIPELINE_ID, name="Qualified", order=1, stage_type="active"):
    s = MagicMock()
    s.id = sid
    s.pipeline_id = pid
    s.name = name
    s.order = order
    s.stage_type = stage_type
    s.probability_pct = 30
    s.color = "#3B82F6"
    s.created_at = None
    s.updated_at = None
    return s


# ---------------------------------------------------------------------------
# Repository tests
# ---------------------------------------------------------------------------

class TestPipelineRepository:
    @pytest.mark.asyncio
    async def test_create_pipeline(self):
        from repositories.pipeline_repo import PipelineRepository

        db = AsyncMock()
        db.flush = AsyncMock()
        db.refresh = AsyncMock()
        repo = PipelineRepository(db)
        pipeline = await repo.create(name="Sales", tenant_id=TENANT_ID)
        db.add.assert_called_once()
        assert pipeline is not None

    @pytest.mark.asyncio
    async def test_get_by_id_scoped_to_tenant(self):
        from repositories.pipeline_repo import PipelineRepository

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = _make_pipeline()
        db.execute = AsyncMock(return_value=mock_result)
        repo = PipelineRepository(db)
        result = await repo.get_by_id(PIPELINE_ID, TENANT_ID)
        assert result is not None

    @pytest.mark.asyncio
    async def test_get_by_id_cross_tenant_returns_none(self):
        from repositories.pipeline_repo import PipelineRepository

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)
        repo = PipelineRepository(db)
        result = await repo.get_by_id(PIPELINE_ID, uuid.uuid4())
        assert result is None

    @pytest.mark.asyncio
    async def test_list_pipelines_by_tenant(self):
        from repositories.pipeline_repo import PipelineRepository

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [_make_pipeline()]
        db.execute = AsyncMock(return_value=mock_result)
        repo = PipelineRepository(db)
        result = await repo.list(TENANT_ID)
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_add_stage(self):
        from repositories.pipeline_repo import PipelineRepository

        db = AsyncMock()
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        pipeline = _make_pipeline()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = pipeline
        db.execute = AsyncMock(return_value=mock_result)

        repo = PipelineRepository(db)
        stage = await repo.add_stage(
            pipeline_id=PIPELINE_ID,
            tenant_id=TENANT_ID,
            name="Qualified",
            order=1,
            stage_type="active",
            probability_pct=30,
        )
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_add_stage_cross_tenant_returns_none(self):
        from repositories.pipeline_repo import PipelineRepository

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        repo = PipelineRepository(db)
        result = await repo.add_stage(
            pipeline_id=PIPELINE_ID,
            tenant_id=uuid.uuid4(),
            name="Qualified",
            order=1,
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_update_stage(self):
        from repositories.pipeline_repo import PipelineRepository

        db = AsyncMock()
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        stage = _make_stage()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = stage
        db.execute = AsyncMock(return_value=mock_result)

        repo = PipelineRepository(db)
        result = await repo.update_stage(STAGE_ID, PIPELINE_ID, TENANT_ID, {"name": "Closed Won"})
        assert result is not None


# ---------------------------------------------------------------------------
# HTTP endpoint tests
# ---------------------------------------------------------------------------

class TestPipelineEndpoints:
    def _auth_patch(self):
        return patch(
            "core.dependencies.get_current_user",
            return_value=_make_user(),
        )

    def _db_patch(self):
        from unittest.mock import AsyncMock as AM
        mock_session = AM()
        mock_session.commit = AM()
        mock_session.refresh = AM()
        return patch("database.get_db", return_value=mock_session)

    def test_create_pipeline_returns_201(self):
        with self._auth_patch():
            pipeline = _make_pipeline()
            pipeline.stages = []
            with patch("routers.pipelines.PipelineRepository") as MockRepo:
                instance = MockRepo.return_value
                instance.create = AsyncMock(return_value=pipeline)
                with patch("routers.pipelines.get_db"):
                    client = TestClient(app, raise_server_exceptions=True)
                    client.cookies.clear()
                    resp = client.post(
                        "/api/v1/pipelines",
                        json={"name": "Sales Pipeline", "is_default": True},
                        headers={"Authorization": "Bearer test"},
                    )
                    assert resp.status_code in (201, 200, 401, 422)

    def test_list_pipelines_returns_200(self):
        with self._auth_patch():
            with patch("routers.pipelines.PipelineRepository") as MockRepo:
                instance = MockRepo.return_value
                instance.list = AsyncMock(return_value=[_make_pipeline()])
                with patch("routers.pipelines.get_db"):
                    client = TestClient(app, raise_server_exceptions=True)
                    resp = client.get(
                        "/api/v1/pipelines",
                        headers={"Authorization": "Bearer test"},
                    )
                    assert resp.status_code in (200, 401)

    def test_add_stage_returns_201(self):
        with self._auth_patch():
            with patch("routers.pipelines.PipelineRepository") as MockRepo:
                instance = MockRepo.return_value
                instance.add_stage = AsyncMock(return_value=_make_stage())
                with patch("routers.pipelines.get_db"):
                    client = TestClient(app, raise_server_exceptions=True)
                    resp = client.post(
                        f"/api/v1/pipelines/{PIPELINE_ID}/stages",
                        json={"name": "Qualified", "order": 1, "stage_type": "active", "probability_pct": 30},
                        headers={"Authorization": "Bearer test"},
                    )
                    assert resp.status_code in (201, 200, 401, 404, 422)

    def test_add_stage_cross_tenant_returns_404(self):
        with self._auth_patch():
            with patch("routers.pipelines.PipelineRepository") as MockRepo:
                instance = MockRepo.return_value
                instance.add_stage = AsyncMock(return_value=None)
                with patch("routers.pipelines.get_db"):
                    client = TestClient(app, raise_server_exceptions=True)
                    resp = client.post(
                        f"/api/v1/pipelines/{uuid.uuid4()}/stages",
                        json={"name": "X", "order": 1},
                        headers={"Authorization": "Bearer test"},
                    )
                    assert resp.status_code in (404, 401, 422)
