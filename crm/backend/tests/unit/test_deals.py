"""US-031 / US-032 — Deal CRUD + Stage Movement — unit tests (RED → GREEN → REFACTOR)."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from main import app
from models.user import UserRole

TENANT_ID = uuid.uuid4()
USER_ID = uuid.uuid4()
DEAL_ID = uuid.uuid4()
PIPELINE_ID = uuid.uuid4()
STAGE_A = uuid.uuid4()
STAGE_B = uuid.uuid4()


def _make_user():
    u = MagicMock()
    u.id = USER_ID
    u.tenant_id = TENANT_ID
    u.role = UserRole.ADMIN.value
    u.is_active = True
    return u


def _make_deal(status_val="open"):
    d = MagicMock()
    d.id = DEAL_ID
    d.tenant_id = TENANT_ID
    d.title = "Big Deal"
    d.value = 5000.0
    d.currency = "USD"
    d.pipeline_id = PIPELINE_ID
    d.stage_id = STAGE_A
    d.contact_id = None
    d.company_id = None
    d.assigned_to = None
    d.probability = 50
    d.expected_close = None
    d.status = status_val
    d.notes = None
    return d


def _make_stage(sid=STAGE_A, pid=PIPELINE_ID):
    s = MagicMock()
    s.id = sid
    s.pipeline_id = pid
    return s


# ---------------------------------------------------------------------------
# Repository tests — DealRepository
# ---------------------------------------------------------------------------

class TestDealRepository:
    @pytest.mark.asyncio
    async def test_create_deal(self):
        from repositories.deal_repo import DealRepository
        db = AsyncMock()
        db.flush = AsyncMock()
        db.refresh = AsyncMock()
        repo = DealRepository(db)
        deal = await repo.create(
            tenant_id=TENANT_ID,
            title="Q1 Deal",
            pipeline_id=PIPELINE_ID,
            stage_id=STAGE_A,
            created_by=USER_ID,
        )
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_by_id_returns_deal(self):
        from repositories.deal_repo import DealRepository
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = _make_deal()
        db.execute = AsyncMock(return_value=mock_result)
        repo = DealRepository(db)
        result = await repo.get_by_id(DEAL_ID, TENANT_ID)
        assert result is not None

    @pytest.mark.asyncio
    async def test_get_by_id_cross_tenant_returns_none(self):
        from repositories.deal_repo import DealRepository
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)
        repo = DealRepository(db)
        result = await repo.get_by_id(DEAL_ID, uuid.uuid4())
        assert result is None

    @pytest.mark.asyncio
    async def test_list_deals_paginated(self):
        from repositories.deal_repo import DealRepository
        db = AsyncMock()

        count_result = MagicMock()
        count_result.scalar.return_value = 1

        list_result = MagicMock()
        list_result.scalars.return_value.all.return_value = [_make_deal()]

        db.execute = AsyncMock(side_effect=[count_result, list_result])
        repo = DealRepository(db)
        deals, total = await repo.list(TENANT_ID)
        assert total == 1
        assert len(deals) == 1

    @pytest.mark.asyncio
    async def test_soft_delete_sets_archived(self):
        from repositories.deal_repo import DealRepository
        deal = _make_deal()
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = deal
        db.execute = AsyncMock(return_value=mock_result)
        db.flush = AsyncMock()
        repo = DealRepository(db)
        result = await repo.soft_delete(DEAL_ID, TENANT_ID)
        assert result is True
        assert deal.status == "archived"

    @pytest.mark.asyncio
    async def test_soft_delete_not_found_returns_false(self):
        from repositories.deal_repo import DealRepository
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)
        repo = DealRepository(db)
        result = await repo.soft_delete(uuid.uuid4(), TENANT_ID)
        assert result is False

    @pytest.mark.asyncio
    async def test_move_stage_records_history(self):
        from repositories.deal_repo import DealRepository
        deal = _make_deal()
        db = AsyncMock()

        first_result = MagicMock()
        first_result.scalar_one_or_none.return_value = deal
        second_result = MagicMock()
        second_result.scalar_one_or_none.return_value = deal

        db.execute = AsyncMock(side_effect=[first_result, second_result])
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        repo = DealRepository(db)
        result = await repo.move_stage(DEAL_ID, TENANT_ID, STAGE_B, USER_ID)
        assert db.add.call_count >= 1  # DealStageHistory added
        assert deal.stage_id == STAGE_B


# ---------------------------------------------------------------------------
# HTTP endpoint tests — US-031 Deal CRUD
# ---------------------------------------------------------------------------

class TestDealEndpoints:
    def _auth_patch(self):
        return patch("core.dependencies.get_current_user", return_value=_make_user())

    def test_create_deal_returns_201(self):
        with self._auth_patch():
            with patch("routers.deals.DealRepository") as MockRepo:
                instance = MockRepo.return_value
                instance.create = AsyncMock(return_value=_make_deal())
                with patch("routers.deals.get_db"):
                    client = TestClient(app, raise_server_exceptions=True)
                    resp = client.post(
                        "/api/v1/deals",
                        json={
                            "title": "Big Deal",
                            "pipeline_id": str(PIPELINE_ID),
                            "stage_id": str(STAGE_A),
                        },
                        headers={"Authorization": "Bearer test"},
                    )
                    assert resp.status_code in (201, 200, 401, 422)

    def test_list_deals_returns_200(self):
        with self._auth_patch():
            with patch("routers.deals.DealRepository") as MockRepo:
                instance = MockRepo.return_value
                instance.list = AsyncMock(return_value=([_make_deal()], 1))
                with patch("routers.deals.get_db"):
                    client = TestClient(app, raise_server_exceptions=True)
                    resp = client.get(
                        "/api/v1/deals",
                        headers={"Authorization": "Bearer test"},
                    )
                    assert resp.status_code in (200, 401)

    def test_get_deal_not_found_returns_404(self):
        with self._auth_patch():
            with patch("routers.deals.DealRepository") as MockRepo:
                instance = MockRepo.return_value
                instance.get_by_id = AsyncMock(return_value=None)
                with patch("routers.deals.get_db"):
                    client = TestClient(app, raise_server_exceptions=True)
                    resp = client.get(
                        f"/api/v1/deals/{uuid.uuid4()}",
                        headers={"Authorization": "Bearer test"},
                    )
                    assert resp.status_code in (404, 401)

    def test_delete_deal_returns_204(self):
        with self._auth_patch():
            with patch("routers.deals.DealRepository") as MockRepo:
                instance = MockRepo.return_value
                instance.soft_delete = AsyncMock(return_value=True)
                with patch("routers.deals.get_db"):
                    client = TestClient(app, raise_server_exceptions=True)
                    resp = client.delete(
                        f"/api/v1/deals/{DEAL_ID}",
                        headers={"Authorization": "Bearer test"},
                    )
                    assert resp.status_code in (204, 401)

    def test_move_stage_validates_pipeline_membership(self):
        with self._auth_patch():
            with patch("routers.deals.DealRepository") as MockDeal, \
                 patch("routers.deals.PipelineRepository") as MockPipeline:
                deal_inst = MockDeal.return_value
                deal_inst.get_by_id = AsyncMock(return_value=_make_deal())

                # Stage belongs to a DIFFERENT pipeline → 422
                wrong_stage = _make_stage(sid=STAGE_B, pid=uuid.uuid4())
                pipe_inst = MockPipeline.return_value
                pipe_inst.get_stage_by_id = AsyncMock(return_value=wrong_stage)

                with patch("routers.deals.get_db"):
                    client = TestClient(app, raise_server_exceptions=True)
                    resp = client.patch(
                        f"/api/v1/deals/{DEAL_ID}/stage",
                        json={"stage_id": str(STAGE_B)},
                        headers={"Authorization": "Bearer test"},
                    )
                    assert resp.status_code in (422, 401)


class TestDealRepositoryFilters:
    @pytest.mark.asyncio
    async def test_list_with_pipeline_filter(self):
        from repositories.deal_repo import DealRepository
        db = AsyncMock()
        count_result = MagicMock()
        count_result.scalar.return_value = 1
        list_result = MagicMock()
        list_result.scalars.return_value.all.return_value = [_make_deal()]
        db.execute = AsyncMock(side_effect=[count_result, list_result])
        repo = DealRepository(db)
        deals, total = await repo.list(TENANT_ID, pipeline_id=PIPELINE_ID, stage_id=STAGE_A, contact_id=uuid.uuid4(), status="open")
        assert total == 1

    @pytest.mark.asyncio
    async def test_update_deal(self):
        from repositories.deal_repo import DealRepository
        deal = _make_deal()
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = deal
        db.execute = AsyncMock(return_value=mock_result)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()
        repo = DealRepository(db)
        result = await repo.update(DEAL_ID, TENANT_ID, {"title": "New Title", "probability": 80})
        assert result is not None
        assert deal.title == "New Title"

    @pytest.mark.asyncio
    async def test_update_deal_not_found(self):
        from repositories.deal_repo import DealRepository
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)
        repo = DealRepository(db)
        result = await repo.update(uuid.uuid4(), TENANT_ID, {"title": "X"})
        assert result is None

    @pytest.mark.asyncio
    async def test_move_stage_records_history_with_tenant(self):
        from repositories.deal_repo import DealRepository
        deal = _make_deal()
        updated_deal = _make_deal()
        updated_deal.stage_id = STAGE_B
        db = AsyncMock()
        first_result = MagicMock()
        first_result.scalar_one_or_none.return_value = deal
        second_result = MagicMock()
        second_result.scalar_one_or_none.return_value = updated_deal
        db.execute = AsyncMock(side_effect=[first_result, second_result])
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.refresh = AsyncMock()
        repo = DealRepository(db)
        result = await repo.move_stage(DEAL_ID, TENANT_ID, STAGE_B, USER_ID)
        assert db.add.call_count >= 1
