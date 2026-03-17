"""Tests for tenant isolation (CRM-202) and RBAC (CRM-203)."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from core.security import create_access_token


def _valid_token(user_id, tenant_id, role="agent"):
    token, _ = create_access_token(
        {"sub": str(user_id), "tenant_id": str(tenant_id), "role": role}
    )
    return token


def _make_user(uid, tid, role="agent"):
    u = MagicMock()
    u.id = uid
    u.tenant_id = tid
    u.role = role
    u.is_active = True
    return u


@pytest.mark.asyncio
async def test_tenant_id_extracted_correctly_from_jwt():
    uid = uuid.uuid4()
    tid = uuid.uuid4()
    token = _valid_token(uid, tid)

    mock_db = AsyncMock()
    user = _make_user(uid, tid)

    with patch("core.dependencies.TokenRepository") as MockTokenRepo:
        MockTokenRepo.return_value.is_blacklisted = AsyncMock(return_value=False)
        with patch("core.dependencies.UserRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(return_value=user)

            from core.dependencies import get_current_user
            result = await get_current_user(token=token, db=mock_db)

    assert result.tenant_id == tid


@pytest.mark.asyncio
async def test_blacklisted_token_returns_401():
    uid = uuid.uuid4()
    tid = uuid.uuid4()
    token = _valid_token(uid, tid)

    mock_db = AsyncMock()

    with patch("core.dependencies.TokenRepository") as MockTokenRepo:
        MockTokenRepo.return_value.is_blacklisted = AsyncMock(return_value=True)
        with patch("core.dependencies.UserRepository"):
            from core.dependencies import get_current_user
            with pytest.raises(HTTPException) as exc:
                await get_current_user(token=token, db=mock_db)
            assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_inactive_user_returns_401():
    uid = uuid.uuid4()
    tid = uuid.uuid4()
    token = _valid_token(uid, tid)

    mock_db = AsyncMock()
    user = _make_user(uid, tid)
    user.is_active = False

    with patch("core.dependencies.TokenRepository") as MockTokenRepo:
        MockTokenRepo.return_value.is_blacklisted = AsyncMock(return_value=False)
        with patch("core.dependencies.UserRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(return_value=user)

            from core.dependencies import get_current_user
            with pytest.raises(HTTPException) as exc:
                await get_current_user(token=token, db=mock_db)
            assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_expired_token_returns_401():
    # Use an obviously bogus token
    mock_db = AsyncMock()
    mock_db.scalar = AsyncMock(return_value=None)

    from core.dependencies import get_current_user
    with pytest.raises(HTTPException) as exc:
        await get_current_user(token="not.a.real.token", db=mock_db)
    assert exc.value.status_code == 401


# ---------------------------------------------------------------------------
# RBAC tests (CRM-203)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_require_role_passes_for_correct_role():
    uid = uuid.uuid4()
    tid = uuid.uuid4()
    user = _make_user(uid, tid, role="admin")
    token = _valid_token(uid, tid, role="admin")

    mock_db = AsyncMock()
    mock_db.scalar = AsyncMock(return_value=None)

    with patch("core.dependencies.UserRepository") as MockRepo:
        repo = MockRepo.return_value
        repo.get_by_id = AsyncMock(return_value=user)

        from core.permissions import require_role
        checker = require_role("admin", "manager")
        result = await checker(current_user=user)

    assert result.role == "admin"


@pytest.mark.asyncio
async def test_require_role_raises_403_for_wrong_role():
    uid = uuid.uuid4()
    tid = uuid.uuid4()
    user = _make_user(uid, tid, role="viewer")

    from core.permissions import require_role
    checker = require_role("admin", "manager")
    with pytest.raises(HTTPException) as exc:
        await checker(current_user=user)
    assert exc.value.status_code == 403
    assert exc.value.detail == "Insufficient permissions"


@pytest.mark.asyncio
async def test_require_role_multiple_roles_allowed():
    uid = uuid.uuid4()
    tid = uuid.uuid4()
    user = _make_user(uid, tid, role="manager")

    from core.permissions import require_role
    checker = require_role("admin", "manager", "agent")
    result = await checker(current_user=user)
    assert result.role == "manager"


@pytest.mark.asyncio
async def test_viewer_gets_403_on_admin_only_endpoint():
    uid = uuid.uuid4()
    tid = uuid.uuid4()
    user = _make_user(uid, tid, role="viewer")

    from core.permissions import require_role
    checker = require_role("admin")
    with pytest.raises(HTTPException) as exc:
        await checker(current_user=user)
    assert exc.value.status_code == 403
