"""
Final coverage gap tests — fills remaining uncovered lines to reach/maintain ≥80%.

Targets:
- repositories/tag_repo.py lines 59, 66-67, 81-91
- repositories/company_repo.py lines 75, 107-116
- repositories/activity_repo.py lines 60, 73-78
- repositories/pipeline_repo.py lines 83, 87, 96-99
- routers/auth.py lines 33, 42-50
- scripts/seed.py (core helpers and data structures)
"""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient


# ===========================================================================
# TagRepository — assign_to_contact (tag not found) and remove_from_contact
# ===========================================================================

@pytest.mark.asyncio
async def test_tag_repo_assign_contact_tag_not_in_tenant(mock_db, sample_tenant_id):
    """Line 59: assign_to_contact returns False when tag not in tenant."""
    contact_id = uuid.uuid4()
    tag_id = uuid.uuid4()

    # contact found in tenant, but tag not found
    contact_obj = MagicMock()
    contact_result = MagicMock()
    contact_result.scalar_one_or_none = MagicMock(return_value=contact_obj)
    mock_db.execute = AsyncMock(return_value=contact_result)

    from repositories.tag_repo import TagRepository
    repo = TagRepository(mock_db)
    repo.get_by_id = AsyncMock(return_value=None)  # tag doesn't belong to tenant

    result = await repo.assign_to_contact(contact_id, tag_id, sample_tenant_id)
    assert result is False


@pytest.mark.asyncio
async def test_tag_repo_assign_contact_already_tagged(mock_db, sample_tenant_id):
    """Lines 66-67: assign_to_contact skips duplicate when contact-tag already exists."""
    contact_id = uuid.uuid4()
    tag_id = uuid.uuid4()

    contact_obj = MagicMock()
    tag_obj = MagicMock()
    tag_obj.id = tag_id

    # existing ContactTag row found — should not add again
    existing_ct = MagicMock()

    contact_result = MagicMock()
    contact_result.scalar_one_or_none = MagicMock(return_value=contact_obj)
    existing_result = MagicMock()
    existing_result.scalar_one_or_none = MagicMock(return_value=existing_ct)

    # execute() called twice: first for contact lookup, second for existing ContactTag
    mock_db.execute = AsyncMock(side_effect=[contact_result, existing_result])
    mock_db.add = MagicMock()

    from repositories.tag_repo import TagRepository
    repo = TagRepository(mock_db)
    repo.get_by_id = AsyncMock(return_value=tag_obj)

    result = await repo.assign_to_contact(contact_id, tag_id, sample_tenant_id)
    assert result is True
    # db.add should NOT be called since the association already exists
    mock_db.add.assert_not_called()


@pytest.mark.asyncio
async def test_tag_repo_assign_contact_new_tag_added(mock_db, sample_tenant_id):
    """Lines 66-67: assign_to_contact adds ContactTag when not already present."""
    contact_id = uuid.uuid4()
    tag_id = uuid.uuid4()

    contact_obj = MagicMock()
    tag_obj = MagicMock()
    tag_obj.id = tag_id

    contact_result = MagicMock()
    contact_result.scalar_one_or_none = MagicMock(return_value=contact_obj)
    no_existing = MagicMock()
    no_existing.scalar_one_or_none = MagicMock(return_value=None)

    mock_db.execute = AsyncMock(side_effect=[contact_result, no_existing])
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()

    from repositories.tag_repo import TagRepository
    repo = TagRepository(mock_db)
    repo.get_by_id = AsyncMock(return_value=tag_obj)

    result = await repo.assign_to_contact(contact_id, tag_id, sample_tenant_id)
    assert result is True
    mock_db.add.assert_called_once()


@pytest.mark.asyncio
async def test_tag_repo_remove_from_contact_cross_tenant_returns_false(mock_db, other_tenant_id):
    """Lines 81-91: remove_from_contact returns False when contact belongs to wrong tenant."""
    contact_id = uuid.uuid4()
    tag_id = uuid.uuid4()

    # contact not found for this tenant
    none_result = MagicMock()
    none_result.scalar_one_or_none = MagicMock(return_value=None)
    mock_db.execute = AsyncMock(return_value=none_result)

    from repositories.tag_repo import TagRepository
    repo = TagRepository(mock_db)
    result = await repo.remove_from_contact(contact_id, tag_id, other_tenant_id)
    assert result is False


@pytest.mark.asyncio
async def test_tag_repo_remove_from_contact_no_ct_row_returns_false(mock_db, sample_tenant_id):
    """Lines 81-91: remove_from_contact returns False when ContactTag row doesn't exist."""
    contact_id = uuid.uuid4()
    tag_id = uuid.uuid4()

    contact_obj = MagicMock()
    contact_result = MagicMock()
    contact_result.scalar_one_or_none = MagicMock(return_value=contact_obj)

    no_ct = MagicMock()
    no_ct.scalar_one_or_none = MagicMock(return_value=None)

    mock_db.execute = AsyncMock(side_effect=[contact_result, no_ct])

    from repositories.tag_repo import TagRepository
    repo = TagRepository(mock_db)
    result = await repo.remove_from_contact(contact_id, tag_id, sample_tenant_id)
    assert result is False


@pytest.mark.asyncio
async def test_tag_repo_remove_from_contact_success(mock_db, sample_tenant_id):
    """Lines 81-91: remove_from_contact deletes the ContactTag row and returns True."""
    contact_id = uuid.uuid4()
    tag_id = uuid.uuid4()

    contact_obj = MagicMock()
    contact_result = MagicMock()
    contact_result.scalar_one_or_none = MagicMock(return_value=contact_obj)

    ct_row = MagicMock()
    ct_result = MagicMock()
    ct_result.scalar_one_or_none = MagicMock(return_value=ct_row)

    mock_db.execute = AsyncMock(side_effect=[contact_result, ct_result])
    mock_db.delete = AsyncMock()
    mock_db.flush = AsyncMock()

    from repositories.tag_repo import TagRepository
    repo = TagRepository(mock_db)
    result = await repo.remove_from_contact(contact_id, tag_id, sample_tenant_id)
    assert result is True
    mock_db.delete.assert_called_once_with(ct_row)


# ===========================================================================
# CompanyRepository — update returns None (line 75) + get_contacts (107-116)
# ===========================================================================

@pytest.mark.asyncio
async def test_company_repo_update_not_found_returns_none(mock_db, other_tenant_id):
    """Line 75: update() returns None when company not found for tenant."""
    from repositories.company_repo import CompanyRepository
    repo = CompanyRepository(mock_db)
    repo.get_by_id = AsyncMock(return_value=None)

    result = await repo.update(uuid.uuid4(), other_tenant_id, {"name": "Hack"})
    assert result is None


@pytest.mark.asyncio
async def test_company_repo_get_contacts_returns_paginated(mock_db, sample_tenant_id):
    """Lines 107-116: get_contacts returns (contacts_list, total)."""
    company_id = uuid.uuid4()

    contact1 = MagicMock()
    contact1.id = uuid.uuid4()

    count_result = MagicMock()
    count_result.scalar_one = MagicMock(return_value=1)
    rows_result = MagicMock()
    rows_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[contact1])))

    mock_db.execute = AsyncMock(side_effect=[count_result, rows_result])

    from repositories.company_repo import CompanyRepository
    repo = CompanyRepository(mock_db)
    contacts, total = await repo.get_contacts(company_id, sample_tenant_id)

    assert total == 1
    assert len(contacts) == 1


@pytest.mark.asyncio
async def test_company_repo_get_contacts_empty(mock_db, sample_tenant_id):
    """Lines 107-116: get_contacts returns empty list when no contacts."""
    company_id = uuid.uuid4()

    count_result = MagicMock()
    count_result.scalar_one = MagicMock(return_value=0)
    rows_result = MagicMock()
    rows_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))

    mock_db.execute = AsyncMock(side_effect=[count_result, rows_result])

    from repositories.company_repo import CompanyRepository
    repo = CompanyRepository(mock_db)
    contacts, total = await repo.get_contacts(company_id, sample_tenant_id, page=2, per_page=10)

    assert total == 0
    assert contacts == []


# ===========================================================================
# ActivityRepository — list with filters (line 60, 73-78)
# ===========================================================================

@pytest.mark.asyncio
async def test_activity_repo_list_with_deal_filter(mock_db, sample_tenant_id):
    """Line 60: list() filters by deal_id when provided."""
    deal_id = uuid.uuid4()
    activity = MagicMock()

    count_result = MagicMock()
    count_result.scalar = MagicMock(return_value=1)
    rows_result = MagicMock()
    rows_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[activity])))

    mock_db.execute = AsyncMock(side_effect=[count_result, rows_result])

    from repositories.activity_repo import ActivityRepository
    repo = ActivityRepository(mock_db)
    activities, total = await repo.list(sample_tenant_id, deal_id=deal_id)

    assert total == 1


@pytest.mark.asyncio
async def test_activity_repo_list_with_activity_type_filter(mock_db, sample_tenant_id):
    """Line 62: list() filters by activity_type when provided."""
    count_result = MagicMock()
    count_result.scalar = MagicMock(return_value=0)
    rows_result = MagicMock()
    rows_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))

    mock_db.execute = AsyncMock(side_effect=[count_result, rows_result])

    from repositories.activity_repo import ActivityRepository
    repo = ActivityRepository(mock_db)
    activities, total = await repo.list(sample_tenant_id, activity_type="call")

    assert total == 0


@pytest.mark.asyncio
async def test_activity_repo_get_by_id_returns_activity(mock_db, sample_tenant_id):
    """Lines 73-78: get_by_id returns the activity when it belongs to tenant."""
    activity_id = uuid.uuid4()
    activity = MagicMock()
    activity.id = activity_id

    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=activity)
    mock_db.execute = AsyncMock(return_value=result)

    from repositories.activity_repo import ActivityRepository
    repo = ActivityRepository(mock_db)
    found = await repo.get_by_id(activity_id, sample_tenant_id)

    assert found is activity


@pytest.mark.asyncio
async def test_activity_repo_get_by_id_cross_tenant_returns_none(mock_db, other_tenant_id):
    """Lines 73-78: get_by_id returns None for cross-tenant activity."""
    activity_id = uuid.uuid4()

    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=None)
    mock_db.execute = AsyncMock(return_value=result)

    from repositories.activity_repo import ActivityRepository
    repo = ActivityRepository(mock_db)
    found = await repo.get_by_id(activity_id, other_tenant_id)

    assert found is None


# ===========================================================================
# PipelineRepository — update_stage (lines 83, 87, 96-99)
# ===========================================================================

@pytest.mark.asyncio
async def test_pipeline_repo_update_stage_stage_not_found(mock_db, sample_tenant_id):
    """Line 83: update_stage returns None when stage_id not found."""
    none_result = MagicMock()
    none_result.scalar_one_or_none = MagicMock(return_value=None)
    mock_db.execute = AsyncMock(return_value=none_result)

    from repositories.pipeline_repo import PipelineRepository
    repo = PipelineRepository(mock_db)
    result = await repo.update_stage(
        uuid.uuid4(), uuid.uuid4(), sample_tenant_id, {"name": "New Name"}
    )
    assert result is None


@pytest.mark.asyncio
async def test_pipeline_repo_update_stage_pipeline_cross_tenant(mock_db, other_tenant_id):
    """Line 87: update_stage returns None when pipeline belongs to wrong tenant."""
    stage_id = uuid.uuid4()
    pipeline_id = uuid.uuid4()

    stage = MagicMock()
    stage.id = stage_id
    stage.pipeline_id = pipeline_id

    stage_result = MagicMock()
    stage_result.scalar_one_or_none = MagicMock(return_value=stage)

    # Pipeline not found for this tenant
    pipeline_result = MagicMock()
    pipeline_result.scalar_one_or_none = MagicMock(return_value=None)

    mock_db.execute = AsyncMock(side_effect=[stage_result, pipeline_result])

    from repositories.pipeline_repo import PipelineRepository
    repo = PipelineRepository(mock_db)
    result = await repo.update_stage(stage_id, pipeline_id, other_tenant_id, {"name": "X"})
    assert result is None


@pytest.mark.asyncio
async def test_pipeline_repo_get_stage_by_id_returns_stage(mock_db):
    """Lines 96-99: get_stage_by_id returns the stage when found."""
    stage_id = uuid.uuid4()
    stage = MagicMock()
    stage.id = stage_id

    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=stage)
    mock_db.execute = AsyncMock(return_value=result)

    from repositories.pipeline_repo import PipelineRepository
    repo = PipelineRepository(mock_db)
    found = await repo.get_stage_by_id(stage_id)

    assert found is stage


@pytest.mark.asyncio
async def test_pipeline_repo_get_stage_by_id_not_found(mock_db):
    """Lines 96-99: get_stage_by_id returns None when not found."""
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=None)
    mock_db.execute = AsyncMock(return_value=result)

    from repositories.pipeline_repo import PipelineRepository
    repo = PipelineRepository(mock_db)
    found = await repo.get_stage_by_id(uuid.uuid4())

    assert found is None


# ===========================================================================
# routers/auth.py — refresh endpoint and logout endpoint (lines 33, 42-50)
# ===========================================================================

from main import app
from core.dependencies import get_current_user
from database import get_db


def _make_auth_user():
    u = MagicMock()
    u.id = uuid.uuid4()
    u.tenant_id = uuid.uuid4()
    u.role = "agent"
    u.is_active = True
    u.email = "auth@test.com"
    u.username = "authuser"
    return u


@pytest.mark.asyncio
async def test_auth_refresh_endpoint_calls_service(mock_db):
    """
    Line 33: POST /auth/refresh calls AuthService.refresh_tokens.
    We patch the service and verify the endpoint delegates correctly.
    """
    from core.security import create_refresh_token, create_access_token
    from schemas.auth import TokenResponse, UserResponse

    user = _make_auth_user()

    # Build valid tokens
    refresh_token_str, refresh_jti = create_refresh_token(
        {"sub": str(user.id), "tenant_id": str(user.tenant_id), "role": "agent"}
    )
    access_token_str, _ = create_access_token(
        {"sub": str(user.id), "tenant_id": str(user.tenant_id), "role": "agent"}
    )

    # Use a real TokenResponse so FastAPI serialisation doesn't fail
    real_response = TokenResponse(
        access_token=access_token_str,
        refresh_token=refresh_token_str,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            tenant_id=user.tenant_id,
            email="auth@test.com",
            username="authuser",
            role="agent",
        ),
    )

    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        with patch("routers.auth.AuthService") as MockAuthService:
            svc_instance = MockAuthService.return_value
            svc_instance.refresh_tokens = AsyncMock(return_value=real_response)

            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/auth/refresh",
                    json={"refresh_token": refresh_token_str},
                )

            assert response.status_code == 200
            svc_instance.refresh_tokens.assert_called_once()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_auth_logout_endpoint_calls_service(mock_db):
    """
    Lines 42-50: POST /auth/logout decodes the token, extracts jti/exp,
    and calls AuthService.logout.
    """
    from core.security import create_access_token
    user = _make_auth_user()

    access_token_str, access_jti = create_access_token(
        {"sub": str(user.id), "tenant_id": str(user.tenant_id), "role": "agent"}
    )

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        with patch("routers.auth.AuthService") as MockAuthService:
            svc_instance = MockAuthService.return_value
            svc_instance.logout = AsyncMock()

            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/auth/logout",
                    headers={"Authorization": f"Bearer {access_token_str}"},
                )

            assert response.status_code == 204
            svc_instance.logout.assert_called_once()
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_auth_register_endpoint_calls_service(mock_db):
    """
    Line 33 (register path): POST /auth/register delegates to AuthService.register.
    """
    from core.security import create_access_token, create_refresh_token
    from schemas.auth import TokenResponse, UserResponse

    user = _make_auth_user()

    access_token_str, _ = create_access_token(
        {"sub": str(user.id), "tenant_id": str(user.tenant_id), "role": "agent"}
    )
    refresh_token_str, _ = create_refresh_token(
        {"sub": str(user.id), "tenant_id": str(user.tenant_id), "role": "agent"}
    )

    # Use a real TokenResponse so FastAPI serialisation doesn't fail
    real_response = TokenResponse(
        access_token=access_token_str,
        refresh_token=refresh_token_str,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            tenant_id=user.tenant_id,
            email="auth@test.com",
            username="authuser",
            role="agent",
        ),
    )

    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        with patch("routers.auth.AuthService") as MockAuthService:
            svc_instance = MockAuthService.return_value
            svc_instance.register = AsyncMock(return_value=real_response)

            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/auth/register",
                    json={
                        "email": "new@test.com",
                        "password": "password123",
                        "username": "newuser",
                        "tenant_slug": "gigforge",
                    },
                )

            assert response.status_code == 201
            svc_instance.register.assert_called_once()
    finally:
        app.dependency_overrides.pop(get_db, None)


# ===========================================================================
# scripts/seed.py — helper functions and data structure
# ===========================================================================

def test_seed_script_now_returns_utc_datetime():
    """Test _now() returns a timezone-aware UTC datetime."""
    from scripts.seed import _now
    result = _now()
    assert result.tzinfo is not None


def test_seed_script_days_returns_future_datetime():
    """Test _days(n) returns a datetime n days from now."""
    from scripts.seed import _days
    future = _days(5)
    past = _days(-5)
    now = _days(0)

    assert future > now
    assert past < now


def test_seed_script_tenants_config():
    """Verify both GigForge and TechUni tenants are configured."""
    from scripts.seed import TENANTS
    slugs = [t["slug"] for t in TENANTS]
    assert "gigforge" in slugs
    assert "techuni" in slugs


def test_seed_script_seed_data_structure():
    """Verify SEED_DATA has required keys for both tenants."""
    from scripts.seed import SEED_DATA
    for slug in ["gigforge", "techuni"]:
        data = SEED_DATA[slug]
        assert "companies" in data
        assert "contacts" in data
        assert "pipeline" in data
        assert "deals" in data
        assert "activities" in data
        assert "tasks" in data
        # Each tenant should have 3 companies and 5 contacts
        assert len(data["companies"]) == 3
        assert len(data["contacts"]) == 5


def test_seed_script_pipeline_stages_structure():
    """Verify each pipeline has exactly 5 stages with valid stage_types."""
    from scripts.seed import SEED_DATA
    valid_types = {"active", "won", "lost"}
    for slug in ["gigforge", "techuni"]:
        stages = SEED_DATA[slug]["pipeline"]["stages"]
        assert len(stages) == 5
        for stage in stages:
            assert stage["stage_type"] in valid_types
            assert 0 <= stage["probability_pct"] <= 100


def test_seed_script_deal_status_enum():
    """Verify DealStatus enum values used in seed data are valid."""
    from models.deal import DealStatus
    assert DealStatus.OPEN
    assert DealStatus.WON
    assert DealStatus.LOST


def test_seed_tenants_have_password_env_vars():
    """Each tenant config has a password_env and default_password."""
    from scripts.seed import TENANTS
    for tenant in TENANTS:
        assert "password_env" in tenant
        assert "default_password" in tenant
        assert len(tenant["default_password"]) >= 8


@pytest.mark.asyncio
async def test_seed_function_is_async():
    """Verify the seed() function is a coroutine (async function)."""
    import inspect
    from scripts.seed import seed, seed_tenant, main
    assert inspect.iscoroutinefunction(seed)
    assert inspect.iscoroutinefunction(seed_tenant)
    assert inspect.iscoroutinefunction(main)


def test_seed_script_gigforge_admin_email():
    """Verify GigForge admin email matches expected value."""
    from scripts.seed import TENANTS
    gigforge_cfg = next(t for t in TENANTS if t["slug"] == "gigforge")
    assert gigforge_cfg["admin_email"] == "admin@gigforge.ai"


def test_seed_script_techuni_admin_email():
    """Verify TechUni admin email matches expected value."""
    from scripts.seed import TENANTS
    techuni_cfg = next(t for t in TENANTS if t["slug"] == "techuni")
    assert techuni_cfg["admin_email"] == "admin@techuni.ai"
