"""HTTP endpoint tests — routers coverage via AsyncClient with mocked deps."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from core.dependencies import get_current_user
from database import get_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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
    c.name = "Acme Corp"
    c.domain = None
    c.industry = None
    c.size = None
    c.address = None
    c.notes = None
    c.deleted_at = None
    c.created_at = datetime.now(timezone.utc)
    c.updated_at = datetime.now(timezone.utc)
    return c


def _make_tag(tag_id, tid):
    t = MagicMock()
    t.id = tag_id
    t.tenant_id = tid
    t.name = "VIP"
    t.color = "#FF0000"
    t.created_at = datetime.now(timezone.utc)
    return t


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
    """AsyncClient with mocked auth and DB."""
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db_session
    yield
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# /health
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_health_check_returns_200():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["version"] in ("0.1.0", "0.2.0")


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_register_endpoint_returns_201():
    mock_db = AsyncMock()
    mock_db.commit = AsyncMock()
    mock_db.flush = AsyncMock()
    mock_db.refresh = AsyncMock()
    mock_db.add = MagicMock()

    tid = uuid.uuid4()
    uid = uuid.uuid4()
    user = _make_user(uid, tid)

    from schemas.auth import TokenResponse, UserResponse
    token_resp = TokenResponse(
        access_token="tok.access.token",
        refresh_token="tok.refresh.token",
        user=UserResponse(
            id=uid,
            email="new@example.com",
            username="newuser",
            role="agent",
            tenant_id=tid,
        ),
    )

    with patch("routers.auth.AuthService") as MockSvc:
        svc = MockSvc.return_value
        svc.register = AsyncMock(return_value=token_resp)

        app.dependency_overrides[get_db] = lambda: mock_db
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/auth/register", json={
                "email": "new@example.com",
                "password": "password123",
                "username": "newuser",
                "tenant_slug": "gigforge",
            })
        app.dependency_overrides.clear()

    assert resp.status_code == 201
    assert resp.json()["access_token"] == "tok.access.token"


@pytest.mark.asyncio
async def test_register_short_password_returns_422():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/auth/register", json={
            "email": "test@test.com",
            "password": "short",
            "username": "u",
            "tenant_slug": "gigforge",
        })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_login_endpoint_returns_200():
    tid = uuid.uuid4()
    uid = uuid.uuid4()
    from schemas.auth import TokenResponse, UserResponse
    token_resp = TokenResponse(
        access_token="access",
        refresh_token="refresh",
        user=UserResponse(id=uid, email="u@e.com", username="u", role="admin", tenant_id=tid),
    )

    mock_db = AsyncMock()
    with patch("routers.auth.AuthService") as MockSvc:
        MockSvc.return_value.login = AsyncMock(return_value=token_resp)
        app.dependency_overrides[get_db] = lambda: mock_db
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/auth/login", json={
                "email": "u@e.com", "password": "pass1234", "tenant_slug": "gigforge"
            })
        app.dependency_overrides.clear()

    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Contacts endpoints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_contact_returns_201(auth_client, user, mock_db_session):
    cid = uuid.uuid4()
    contact = _make_contact(cid, user.tenant_id)

    with patch("routers.contacts.ContactRepository") as MockRepo:
        repo = MockRepo.return_value
        repo.create = AsyncMock(return_value=contact)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/contacts", json={
                "first_name": "Jane", "last_name": "Doe"
            })

    assert resp.status_code == 201
    data = resp.json()
    assert data["first_name"] == "Jane"


@pytest.mark.asyncio
async def test_create_contact_missing_first_name_returns_422(auth_client):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/contacts", json={"last_name": "Doe"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_contacts_returns_200(auth_client, user, mock_db_session):
    cid = uuid.uuid4()
    contact = _make_contact(cid, user.tenant_id)

    with patch("routers.contacts.ContactRepository") as MockRepo:
        repo = MockRepo.return_value
        repo.list = AsyncMock(return_value=([contact], 1))
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/contacts")

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["page"] == 1


@pytest.mark.asyncio
async def test_get_contact_404_for_wrong_tenant(auth_client, user, mock_db_session):
    with patch("routers.contacts.ContactRepository") as MockRepo:
        repo = MockRepo.return_value
        repo.get_by_id = AsyncMock(return_value=None)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/contacts/{uuid.uuid4()}")

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_contact_returns_200(auth_client, user, mock_db_session):
    cid = uuid.uuid4()
    contact = _make_contact(cid, user.tenant_id)
    contact.first_name = "Updated"

    with patch("routers.contacts.ContactRepository") as MockRepo:
        repo = MockRepo.return_value
        repo.update = AsyncMock(return_value=contact)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.put(f"/contacts/{cid}", json={
                "first_name": "Updated", "last_name": "Doe"
            })

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_delete_contact_returns_204(auth_client, user, mock_db_session):
    cid = uuid.uuid4()
    with patch("routers.contacts.ContactRepository") as MockRepo:
        repo = MockRepo.return_value
        repo.soft_delete = AsyncMock(return_value=True)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(f"/contacts/{cid}")

    assert resp.status_code == 204


# ---------------------------------------------------------------------------
# Companies endpoints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_company_returns_201(auth_client, user, mock_db_session):
    cid = uuid.uuid4()
    company = _make_company(cid, user.tenant_id)

    with patch("routers.companies.CompanyRepository") as MockRepo:
        repo = MockRepo.return_value
        repo.create = AsyncMock(return_value=company)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/companies", json={"name": "Acme Corp"})

    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_list_companies_returns_200(auth_client, user, mock_db_session):
    cid = uuid.uuid4()
    company = _make_company(cid, user.tenant_id)

    with patch("routers.companies.CompanyRepository") as MockRepo:
        repo = MockRepo.return_value
        repo.list = AsyncMock(return_value=([company], 1))
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/companies")

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1


@pytest.mark.asyncio
async def test_get_company_contacts_returns_200(auth_client, user, mock_db_session):
    cid = uuid.uuid4()
    company = _make_company(cid, user.tenant_id)
    contact = _make_contact(uuid.uuid4(), user.tenant_id)
    contact.company_id = cid

    with patch("routers.companies.CompanyRepository") as MockRepo:
        repo = MockRepo.return_value
        repo.get_by_id = AsyncMock(return_value=company)
        repo.get_contacts = AsyncMock(return_value=([contact], 1))
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/companies/{cid}/contacts")

    assert resp.status_code == 200
    assert resp.json()["total"] == 1


@pytest.mark.asyncio
async def test_delete_company_returns_204(auth_client, user, mock_db_session):
    cid = uuid.uuid4()
    with patch("routers.companies.CompanyRepository") as MockRepo:
        repo = MockRepo.return_value
        repo.soft_delete = AsyncMock(return_value=True)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(f"/companies/{cid}")

    assert resp.status_code == 204


# ---------------------------------------------------------------------------
# Tags endpoints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_tags_returns_200(auth_client, user, mock_db_session):
    tag = _make_tag(uuid.uuid4(), user.tenant_id)

    with patch("routers.tags.TagRepository") as MockRepo:
        repo = MockRepo.return_value
        repo.list = AsyncMock(return_value=[tag])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/tags")

    assert resp.status_code == 200
    assert len(resp.json()) == 1


@pytest.mark.asyncio
async def test_create_tag_returns_201(auth_client, user, mock_db_session):
    tag = _make_tag(uuid.uuid4(), user.tenant_id)

    with patch("routers.tags.TagRepository") as MockRepo:
        repo = MockRepo.return_value
        repo.create = AsyncMock(return_value=tag)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/tags", json={"name": "VIP", "color": "#FF0000"})

    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_delete_tag_returns_204(auth_client, user, mock_db_session):
    tag_id = uuid.uuid4()

    with patch("routers.tags.TagRepository") as MockRepo:
        repo = MockRepo.return_value
        repo.delete = AsyncMock(return_value=True)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(f"/tags/{tag_id}")

    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_delete_nonexistent_tag_returns_404(auth_client, user, mock_db_session):
    tag_id = uuid.uuid4()

    with patch("routers.tags.TagRepository") as MockRepo:
        repo = MockRepo.return_value
        repo.delete = AsyncMock(return_value=False)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(f"/tags/{tag_id}")

    assert resp.status_code == 404
