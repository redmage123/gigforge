"""Targeted tests to close coverage gaps on contact_repo and routers."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from core.dependencies import get_current_user
from database import get_db


def _make_user(uid=None, tid=None, role="admin"):
    u = MagicMock()
    u.id = uid or uuid.uuid4()
    u.tenant_id = tid or uuid.uuid4()
    u.email = "admin@test.com"
    u.username = "admin"
    u.role = role
    u.is_active = True
    return u


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


def _make_company(cid, tid):
    c = MagicMock()
    c.id = cid
    c.tenant_id = tid
    c.name = "Acme"
    c.domain = None
    c.industry = None
    c.size = None
    c.address = None
    c.notes = None
    c.deleted_at = None
    c.created_at = datetime.now(timezone.utc)
    c.updated_at = datetime.now(timezone.utc)
    return c


@pytest.fixture
def user():
    return _make_user()


@pytest.fixture
def mock_db_session():
    s = AsyncMock()
    s.commit = AsyncMock()
    s.flush = AsyncMock()
    s.refresh = AsyncMock()
    s.add = MagicMock()
    return s


@pytest.fixture
def auth_client(user, mock_db_session):
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db_session
    yield
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# ContactRepository: tag operations
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_contact_repo_add_tag_success(mock_db, sample_tenant_id):
    contact_id = uuid.uuid4()
    tag_id = uuid.uuid4()
    contact = MagicMock()
    contact.tenant_id = sample_tenant_id
    tag = MagicMock()

    contact_result = MagicMock()
    contact_result.scalar_one_or_none = MagicMock(return_value=tag)  # tag query in add_tag

    none_result = MagicMock()
    none_result.scalar_one_or_none = MagicMock(return_value=None)  # no existing ContactTag

    mock_db.execute = AsyncMock(side_effect=[contact_result, none_result])
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()

    from repositories.contact_repo import ContactRepository
    repo = ContactRepository(mock_db)
    repo.get_by_id = AsyncMock(return_value=contact)

    result = await repo.add_tag(contact_id, tag_id, sample_tenant_id)
    assert result is True
    mock_db.add.assert_called_once()


@pytest.mark.asyncio
async def test_contact_repo_add_tag_returns_false_if_contact_not_found(
    mock_db, sample_tenant_id
):
    from repositories.contact_repo import ContactRepository
    repo = ContactRepository(mock_db)
    repo.get_by_id = AsyncMock(return_value=None)
    result = await repo.add_tag(uuid.uuid4(), uuid.uuid4(), sample_tenant_id)
    assert result is False


@pytest.mark.asyncio
async def test_contact_repo_add_tag_returns_false_if_cross_tenant_tag(
    mock_db, sample_tenant_id
):
    contact = MagicMock()
    none_result = MagicMock()
    none_result.scalar_one_or_none = MagicMock(return_value=None)  # tag not in tenant
    mock_db.execute = AsyncMock(return_value=none_result)

    from repositories.contact_repo import ContactRepository
    repo = ContactRepository(mock_db)
    repo.get_by_id = AsyncMock(return_value=contact)
    result = await repo.add_tag(uuid.uuid4(), uuid.uuid4(), sample_tenant_id)
    assert result is False


@pytest.mark.asyncio
async def test_contact_repo_remove_tag_success(mock_db, sample_tenant_id):
    contact_id = uuid.uuid4()
    tag_id = uuid.uuid4()
    ct = MagicMock()

    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=ct)
    mock_db.execute = AsyncMock(return_value=result)
    mock_db.delete = AsyncMock()
    mock_db.flush = AsyncMock()

    from repositories.contact_repo import ContactRepository
    repo = ContactRepository(mock_db)
    ok = await repo.remove_tag(contact_id, tag_id, sample_tenant_id)
    assert ok is True
    mock_db.delete.assert_called_once_with(ct)


@pytest.mark.asyncio
async def test_contact_repo_remove_tag_returns_false_when_not_found(mock_db, sample_tenant_id):
    none_result = MagicMock()
    none_result.scalar_one_or_none = MagicMock(return_value=None)
    mock_db.execute = AsyncMock(return_value=none_result)

    from repositories.contact_repo import ContactRepository
    repo = ContactRepository(mock_db)
    result = await repo.remove_tag(uuid.uuid4(), uuid.uuid4(), sample_tenant_id)
    assert result is False


# ---------------------------------------------------------------------------
# Contacts router: additional paths
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_contact_returns_200(auth_client, user, mock_db_session):
    cid = uuid.uuid4()
    contact = _make_contact(cid, user.tenant_id)

    with patch("routers.contacts.ContactRepository") as MockRepo:
        MockRepo.return_value.get_by_id = AsyncMock(return_value=contact)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get(f"/contacts/{cid}")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_patch_contact_returns_200(auth_client, user, mock_db_session):
    cid = uuid.uuid4()
    contact = _make_contact(cid, user.tenant_id)

    with patch("routers.contacts.ContactRepository") as MockRepo:
        MockRepo.return_value.update = AsyncMock(return_value=contact)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.patch(f"/contacts/{cid}", json={"phone": "555-1234"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_delete_contact_404_if_not_found(auth_client, user, mock_db_session):
    with patch("routers.contacts.ContactRepository") as MockRepo:
        MockRepo.return_value.soft_delete = AsyncMock(return_value=False)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.delete(f"/contacts/{uuid.uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_assign_tags_to_contact(auth_client, user, mock_db_session):
    cid = uuid.uuid4()
    tag_id = uuid.uuid4()
    with patch("routers.contacts.ContactRepository") as MockRepo:
        MockRepo.return_value.add_tag = AsyncMock(return_value=True)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(f"/contacts/{cid}/tags", json={"tag_ids": [str(tag_id)]})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_remove_tag_from_contact_204(auth_client, user, mock_db_session):
    cid = uuid.uuid4()
    tag_id = uuid.uuid4()
    with patch("routers.contacts.ContactRepository") as MockRepo:
        MockRepo.return_value.remove_tag = AsyncMock(return_value=True)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.delete(f"/contacts/{cid}/tags/{tag_id}")
    assert resp.status_code == 204


# ---------------------------------------------------------------------------
# Companies router: additional paths
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_company_returns_200(auth_client, user, mock_db_session):
    cid = uuid.uuid4()
    company = _make_company(cid, user.tenant_id)
    with patch("routers.companies.CompanyRepository") as MockRepo:
        MockRepo.return_value.get_by_id = AsyncMock(return_value=company)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get(f"/companies/{cid}")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_company_404_for_wrong_tenant(auth_client, user, mock_db_session):
    with patch("routers.companies.CompanyRepository") as MockRepo:
        MockRepo.return_value.get_by_id = AsyncMock(return_value=None)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get(f"/companies/{uuid.uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_company_returns_200(auth_client, user, mock_db_session):
    cid = uuid.uuid4()
    company = _make_company(cid, user.tenant_id)
    with patch("routers.companies.CompanyRepository") as MockRepo:
        MockRepo.return_value.update = AsyncMock(return_value=company)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.put(f"/companies/{cid}", json={"name": "Updated"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_update_company_404_if_not_found(auth_client, user, mock_db_session):
    cid = uuid.uuid4()
    with patch("routers.companies.CompanyRepository") as MockRepo:
        MockRepo.return_value.update = AsyncMock(return_value=None)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.put(f"/companies/{cid}", json={"name": "X"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_patch_company_returns_200(auth_client, user, mock_db_session):
    cid = uuid.uuid4()
    company = _make_company(cid, user.tenant_id)
    with patch("routers.companies.CompanyRepository") as MockRepo:
        MockRepo.return_value.update = AsyncMock(return_value=company)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.patch(f"/companies/{cid}", json={"domain": "new.com"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_delete_company_404_if_not_found(auth_client, user, mock_db_session):
    with patch("routers.companies.CompanyRepository") as MockRepo:
        MockRepo.return_value.soft_delete = AsyncMock(return_value=False)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.delete(f"/companies/{uuid.uuid4()}")
    assert resp.status_code == 404
