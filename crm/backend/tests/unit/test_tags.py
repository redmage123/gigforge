"""Tests for tags repository — CRM-303."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest


def _make_tag(tid_tag, tid_tenant, name="VIP"):
    t = MagicMock()
    t.id = tid_tag
    t.tenant_id = tid_tenant
    t.name = name
    t.color = "#F59E0B"
    t.created_at = datetime.now(timezone.utc)
    return t


@pytest.mark.asyncio
async def test_tag_repo_create_returns_tag(mock_db, sample_tenant_id):
    tag = _make_tag(uuid.uuid4(), sample_tenant_id)
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()
    mock_db.refresh = AsyncMock()

    with __import__("unittest.mock", fromlist=["patch"]).patch(
        "repositories.tag_repo.Tag", return_value=tag
    ):
        from repositories.tag_repo import TagRepository
        repo = TagRepository(mock_db)
        await repo.create(name="VIP", tenant_id=sample_tenant_id, color="#F59E0B")

    mock_db.add.assert_called_once()


@pytest.mark.asyncio
async def test_tag_repo_list_returns_tenant_tags(mock_db, sample_tenant_id):
    tags = [_make_tag(uuid.uuid4(), sample_tenant_id), _make_tag(uuid.uuid4(), sample_tenant_id)]
    scalars = MagicMock()
    scalars.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=tags)))
    mock_db.execute = AsyncMock(return_value=scalars)

    from repositories.tag_repo import TagRepository
    repo = TagRepository(mock_db)
    result = await repo.list(sample_tenant_id)

    assert len(result) == 2


@pytest.mark.asyncio
async def test_tag_repo_delete_returns_false_for_cross_tenant(mock_db, other_tenant_id):
    tag_id = uuid.uuid4()
    from repositories.tag_repo import TagRepository
    repo = TagRepository(mock_db)
    repo.get_by_id = AsyncMock(return_value=None)
    result = await repo.delete(tag_id, other_tenant_id)
    assert result is False


@pytest.mark.asyncio
async def test_tag_repo_assign_returns_false_for_cross_tenant_contact(mock_db, sample_tenant_id, other_tenant_id):
    contact_id = uuid.uuid4()
    tag_id = uuid.uuid4()

    # contact lookup returns None (wrong tenant)
    none_result = MagicMock()
    none_result.scalar_one_or_none = MagicMock(return_value=None)
    mock_db.execute = AsyncMock(return_value=none_result)

    from repositories.tag_repo import TagRepository
    repo = TagRepository(mock_db)
    result = await repo.assign_to_contact(contact_id, tag_id, other_tenant_id)
    assert result is False


@pytest.mark.asyncio
async def test_tag_repo_delete_calls_db_delete(mock_db, sample_tenant_id):
    tag_id = uuid.uuid4()
    tag = _make_tag(tag_id, sample_tenant_id)

    mock_db.delete = AsyncMock()
    mock_db.flush = AsyncMock()

    from repositories.tag_repo import TagRepository
    repo = TagRepository(mock_db)
    repo.get_by_id = AsyncMock(return_value=tag)
    result = await repo.delete(tag_id, sample_tenant_id)

    assert result is True
    mock_db.delete.assert_called_once_with(tag)
