"""
Cross-tenant isolation integration tests — CRM-202

These tests verify that a user authenticated as Tenant A (gigforge) cannot
access Tenant B (techuni) resources through any endpoint, even when supplying
a valid Tenant B resource ID in the URL.

All cross-tenant attempts MUST return 404 Not Found (not 403) so that
the existence of a resource is not disclosed to unauthorised parties.
"""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from core.dependencies import get_current_user
from database import get_db


# ---------------------------------------------------------------------------
# Shared test data — GigForge tenant is the authenticated party
# ---------------------------------------------------------------------------
GIGFORGE_TENANT_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
GIGFORGE_USER_ID = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")

TECHUNI_TENANT_ID = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")

# IDs that belong to TechUni (the other tenant)
TECHUNI_CONTACT_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
TECHUNI_COMPANY_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")
TECHUNI_TAG_ID = uuid.UUID("33333333-3333-3333-3333-333333333333")


def _make_gigforge_user():
    """Build a mock user that belongs to the GigForge tenant."""
    user = MagicMock()
    user.id = GIGFORGE_USER_ID
    user.tenant_id = GIGFORGE_TENANT_ID
    user.email = "agent@gigforge.ai"
    user.username = "gigforge_agent"
    user.role = "agent"
    user.is_active = True
    return user


def _mock_db_session():
    """Return an AsyncMock that looks like a DB session."""
    db = AsyncMock()
    db.execute = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    db.delete = AsyncMock()
    return db


@pytest.fixture
def gigforge_user():
    return _make_gigforge_user()


@pytest.fixture
def mock_db():
    return _mock_db_session()


@pytest.fixture
def async_client(gigforge_user, mock_db):
    """AsyncClient with GigForge user injected and a mocked DB session."""
    app.dependency_overrides[get_current_user] = lambda: gigforge_user
    app.dependency_overrides[get_db] = lambda: mock_db
    transport = ASGITransport(app=app)
    client = AsyncClient(transport=transport, base_url="http://test")
    return client


# ---------------------------------------------------------------------------
# Helper — mock repo so every lookup scoped to GigForge's tenant returns None
# (simulating a contact that belongs to TechUni being looked up by GigForge)
# ---------------------------------------------------------------------------

def _repo_returns_none():
    """A minimal repo mock whose get_by_id always returns None."""
    repo = MagicMock()
    repo.get_by_id = AsyncMock(return_value=None)
    repo.soft_delete = AsyncMock(return_value=False)
    repo.update = AsyncMock(return_value=None)
    repo.list = AsyncMock(return_value=([], 0))
    repo.add_tag = AsyncMock(return_value=False)
    return repo


# ===========================================================================
# TEST 1: GigForge user cannot list TechUni contacts
# (contacts are scoped to tenant — the list itself is tenant-filtered, so
# there's nothing to return for a cross-tenant attempt but we also verify
# that a direct attempt to GET a TechUni contact ID returns 404)
# ===========================================================================

@pytest.mark.asyncio
async def test_gigforge_user_cannot_list_techuni_contacts(gigforge_user, mock_db):
    """
    GET /contacts scoped to GigForge tenant must never expose TechUni contacts.
    With no contacts in the GigForge tenant, the list must return an empty set.
    """
    # contacts list returns empty for GigForge's tenant
    count_result = MagicMock()
    count_result.scalar_one = MagicMock(return_value=0)
    scalars_result = MagicMock()
    scalars_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    mock_db.execute = AsyncMock(side_effect=[count_result, scalars_result])

    app.dependency_overrides[get_current_user] = lambda: gigforge_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/contacts")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["items"] == []
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_gigforge_user_cannot_get_techuni_contact_by_id(gigforge_user, mock_db):
    """
    GET /contacts/{id} for a TechUni contact ID must return 404.
    The contact repo scopes by tenant_id, so it returns None for cross-tenant ID.
    """
    # contact lookup returns None (cross-tenant)
    none_result = MagicMock()
    none_result.scalar_one_or_none = MagicMock(return_value=None)
    mock_db.execute = AsyncMock(return_value=none_result)

    app.dependency_overrides[get_current_user] = lambda: gigforge_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(f"/contacts/{TECHUNI_CONTACT_ID}")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_gigforge_user_cannot_update_techuni_contact(gigforge_user, mock_db):
    """
    PUT /contacts/{id} for a TechUni contact ID must return 404.
    The update operation scopes by tenant_id and returns None → 404.
    """
    none_result = MagicMock()
    none_result.scalar_one_or_none = MagicMock(return_value=None)
    mock_db.execute = AsyncMock(return_value=none_result)

    app.dependency_overrides[get_current_user] = lambda: gigforge_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.put(
                f"/contacts/{TECHUNI_CONTACT_ID}",
                json={
                    "first_name": "Evil",
                    "last_name": "Hacker",
                    "email": "evil@hacker.com",
                },
            )

        assert response.status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_gigforge_user_cannot_delete_techuni_contact(gigforge_user, mock_db):
    """
    DELETE /contacts/{id} for a TechUni contact ID must return 404.
    soft_delete scopes by tenant_id and returns False → 404.
    """
    none_result = MagicMock()
    none_result.scalar_one_or_none = MagicMock(return_value=None)
    mock_db.execute = AsyncMock(return_value=none_result)

    app.dependency_overrides[get_current_user] = lambda: gigforge_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.delete(f"/contacts/{TECHUNI_CONTACT_ID}")

        assert response.status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_cross_tenant_company_id_in_url_returns_404(gigforge_user, mock_db):
    """
    GET /companies/{id} for a TechUni company ID must return 404.
    Company repo scopes by tenant_id → None → 404.
    """
    none_result = MagicMock()
    none_result.scalar_one_or_none = MagicMock(return_value=None)
    mock_db.execute = AsyncMock(return_value=none_result)

    app.dependency_overrides[get_current_user] = lambda: gigforge_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(f"/companies/{TECHUNI_COMPANY_ID}")

        assert response.status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_cross_tenant_tag_assignment_returns_404(gigforge_user, mock_db):
    """
    POST /contacts/{id}/tags with a TechUni tag_id must return 404.
    The tag is scoped to TechUni's tenant — add_tag returns False → 404.
    """
    # contact is found (belongs to GigForge) but tag lookup for cross-tenant returns None
    # add_tag returns False when the tag doesn't belong to GigForge's tenant
    none_result = MagicMock()
    none_result.scalar_one_or_none = MagicMock(return_value=None)
    mock_db.execute = AsyncMock(return_value=none_result)

    app.dependency_overrides[get_current_user] = lambda: gigforge_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                f"/contacts/{TECHUNI_CONTACT_ID}/tags",
                json={"tag_ids": [str(TECHUNI_TAG_ID)]},
            )

        # Must be 404 — the contact itself is cross-tenant → not found
        assert response.status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


# ===========================================================================
# Regression test: UserRole.AGENT (was SALES_REP — BLK-001)
# ===========================================================================

def test_user_role_agent_value_is_agent():
    """
    Regression test for BLK-001: UserRole.SALES_REP was renamed to UserRole.AGENT.
    Verify the current enum value is 'agent' (not 'sales_rep').
    """
    from models.user import UserRole
    assert UserRole.AGENT.value == "agent"
    # Verify the old SALES_REP name no longer exists
    role_names = [r.name for r in UserRole]
    assert "SALES_REP" not in role_names
    assert "AGENT" in role_names


def test_user_role_enum_has_expected_values():
    """All expected UserRole values are present and correct."""
    from models.user import UserRole
    assert UserRole.ADMIN.value == "admin"
    assert UserRole.MANAGER.value == "manager"
    assert UserRole.AGENT.value == "agent"
    assert UserRole.VIEWER.value == "viewer"
