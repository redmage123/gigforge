"""Tests for companies repository — CRM-302."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest


def _make_company(cid, tid):
    c = MagicMock()
    c.id = cid
    c.tenant_id = tid
    c.name = "Acme Corp"
    c.domain = "acme.com"
    c.industry = None
    c.size = None
    c.address = None
    c.notes = None
    c.deleted_at = None
    c.created_at = datetime.now(timezone.utc)
    c.updated_at = datetime.now(timezone.utc)
    return c


@pytest.mark.asyncio
async def test_company_repo_create_returns_company(mock_db, sample_tenant_id):
    cid = uuid.uuid4()
    company = _make_company(cid, sample_tenant_id)

    mock_db.flush = AsyncMock()
    mock_db.refresh = AsyncMock()
    mock_db.add = MagicMock()

    with __import__("unittest.mock", fromlist=["patch"]).patch(
        "repositories.company_repo.Company", return_value=company
    ):
        from repositories.company_repo import CompanyRepository
        repo = CompanyRepository(mock_db)
        await repo.create(name="Acme Corp", tenant_id=sample_tenant_id)

    mock_db.add.assert_called_once()


@pytest.mark.asyncio
async def test_company_repo_get_by_id_cross_tenant_returns_none(mock_db, other_tenant_id):
    cid = uuid.uuid4()
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=None)
    mock_db.execute = AsyncMock(return_value=result)

    from repositories.company_repo import CompanyRepository
    repo = CompanyRepository(mock_db)
    assert await repo.get_by_id(cid, other_tenant_id) is None


@pytest.mark.asyncio
async def test_company_repo_soft_delete_nulls_contact_company_ids(mock_db, sample_tenant_id):
    cid = uuid.uuid4()
    company = _make_company(cid, sample_tenant_id)
    company.deleted_at = None

    mock_db.flush = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock())

    from repositories.company_repo import CompanyRepository
    repo = CompanyRepository(mock_db)
    repo.get_by_id = AsyncMock(return_value=company)

    result = await repo.soft_delete(cid, sample_tenant_id)

    assert result is True
    assert company.deleted_at is not None
    # Verify that an UPDATE was executed (to null contact company_ids)
    mock_db.execute.assert_called_once()


@pytest.mark.asyncio
async def test_company_repo_delete_returns_false_for_wrong_tenant(mock_db, other_tenant_id):
    cid = uuid.uuid4()
    from repositories.company_repo import CompanyRepository
    repo = CompanyRepository(mock_db)
    repo.get_by_id = AsyncMock(return_value=None)
    result = await repo.soft_delete(cid, other_tenant_id)
    assert result is False
