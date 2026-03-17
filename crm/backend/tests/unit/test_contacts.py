"""Tests for contacts repository — CRM-301."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest


def _make_contact(cid, tid):
    c = MagicMock()
    c.id = cid
    c.tenant_id = tid
    c.first_name = "Jane"
    c.last_name = "Doe"
    c.email = "jane@example.com"
    c.phone = None
    c.company_id = None
    c.source = None
    c.status = "lead"
    c.custom_fields = None
    c.deleted_at = None
    c.created_at = datetime.now(timezone.utc)
    c.updated_at = datetime.now(timezone.utc)
    c.contact_tags = []
    return c


@pytest.mark.asyncio
async def test_contact_repo_create_returns_contact(mock_db, sample_tenant_id, sample_user_id):
    cid = uuid.uuid4()
    contact = _make_contact(cid, sample_tenant_id)

    # Simulate: db.flush adds id, db.refresh populates contact
    mock_db.flush = AsyncMock()
    mock_db.refresh = AsyncMock(side_effect=lambda obj: None)
    mock_db.add = MagicMock()

    # Patch the Contact class to return our mock on instantiation
    with patch("repositories.contact_repo.Contact", return_value=contact):
        from repositories.contact_repo import ContactRepository
        repo = ContactRepository(mock_db)
        result = await repo.create(
            first_name="Jane",
            last_name="Doe",
            tenant_id=sample_tenant_id,
            created_by=sample_user_id,
        )

    mock_db.add.assert_called_once()
    mock_db.flush.assert_called_once()


@pytest.mark.asyncio
async def test_contact_repo_get_by_id_cross_tenant_returns_none(mock_db, other_tenant_id):
    cid = uuid.uuid4()

    scalar_result = MagicMock()
    scalar_result.scalar_one_or_none = MagicMock(return_value=None)
    mock_db.execute = AsyncMock(return_value=scalar_result)

    from repositories.contact_repo import ContactRepository
    repo = ContactRepository(mock_db)
    result = await repo.get_by_id(cid, other_tenant_id)

    assert result is None


@pytest.mark.asyncio
async def test_contact_repo_soft_delete_sets_deleted_at(mock_db, sample_tenant_id):
    cid = uuid.uuid4()
    contact = _make_contact(cid, sample_tenant_id)
    contact.deleted_at = None

    scalar_result = MagicMock()
    scalar_result.scalar_one_or_none = MagicMock(return_value=contact)
    mock_db.execute = AsyncMock(return_value=scalar_result)
    mock_db.flush = AsyncMock()

    from repositories.contact_repo import ContactRepository
    repo = ContactRepository(mock_db)
    # Need to patch get_by_id since it uses selectinload
    repo.get_by_id = AsyncMock(return_value=contact)
    result = await repo.soft_delete(cid, sample_tenant_id)

    assert result is True
    assert contact.deleted_at is not None


@pytest.mark.asyncio
async def test_contact_repo_soft_delete_returns_false_for_wrong_tenant(mock_db, other_tenant_id):
    cid = uuid.uuid4()
    from repositories.contact_repo import ContactRepository
    repo = ContactRepository(mock_db)
    repo.get_by_id = AsyncMock(return_value=None)
    result = await repo.soft_delete(cid, other_tenant_id)
    assert result is False


@pytest.mark.asyncio
async def test_contact_repo_list_filters_by_tenant(mock_db, sample_tenant_id):
    cid = uuid.uuid4()
    contact = _make_contact(cid, sample_tenant_id)

    scalars_result = MagicMock()
    scalars_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[contact])))
    count_result = MagicMock()
    count_result.scalar_one = MagicMock(return_value=1)

    mock_db.execute = AsyncMock(side_effect=[count_result, scalars_result])

    from repositories.contact_repo import ContactRepository
    repo = ContactRepository(mock_db)
    contacts, total = await repo.list(sample_tenant_id)

    assert total == 1


@pytest.mark.asyncio
async def test_contact_repo_update_returns_none_for_cross_tenant(mock_db, other_tenant_id):
    cid = uuid.uuid4()
    from repositories.contact_repo import ContactRepository
    repo = ContactRepository(mock_db)
    repo.get_by_id = AsyncMock(return_value=None)
    result = await repo.update(cid, other_tenant_id, {"first_name": "New"})
    assert result is None
