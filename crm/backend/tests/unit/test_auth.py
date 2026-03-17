"""Tests for auth service and endpoints — CRM-201 + CRM-204."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# AuthService unit tests (mocked DB)
# ---------------------------------------------------------------------------

@pytest.fixture
def tenant_id():
    return uuid.uuid4()


@pytest.fixture
def user_id():
    return uuid.uuid4()


def _make_tenant(tid, slug="gigforge"):
    t = MagicMock()
    t.id = tid
    t.slug = slug
    return t


def _make_user(uid, tid, role="agent"):
    u = MagicMock()
    u.id = uid
    u.tenant_id = tid
    u.email = "test@example.com"
    u.username = "testuser"
    u.role = role
    u.is_active = True
    from core.security import hash_password
    u.password_hash = hash_password("correct-pass")
    return u


@pytest.mark.asyncio
async def test_register_new_user_returns_token_response(tenant_id, user_id, mock_db):
    tenant = _make_tenant(tenant_id)
    user = _make_user(user_id, tenant_id)

    with (
        patch("services.auth_service.UserRepository") as MockUserRepo,
        patch("services.auth_service.TokenRepository") as MockTokenRepo,
    ):
        user_repo = MockUserRepo.return_value
        user_repo.get_tenant_by_slug = AsyncMock(return_value=tenant)
        user_repo.get_by_email_and_tenant = AsyncMock(return_value=None)
        user_repo.create = AsyncMock(return_value=user)

        token_repo = MockTokenRepo.return_value
        token_repo.store_refresh_token = AsyncMock()

        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()
        mock_db.flush = AsyncMock()

        from schemas.auth import RegisterRequest
        from services.auth_service import AuthService

        svc = AuthService(mock_db)
        req = RegisterRequest(
            email="new@example.com",
            password="password123",
            username="newuser",
            tenant_slug="gigforge",
        )
        result = await svc.register(req)

    assert result.access_token
    assert result.refresh_token
    assert result.token_type == "bearer"
    assert result.user.tenant_id == tenant_id


@pytest.mark.asyncio
async def test_register_duplicate_email_returns_409(tenant_id, user_id, mock_db):
    tenant = _make_tenant(tenant_id)
    user = _make_user(user_id, tenant_id)

    with (
        patch("services.auth_service.UserRepository") as MockUserRepo,
        patch("services.auth_service.TokenRepository"),
    ):
        user_repo = MockUserRepo.return_value
        user_repo.get_tenant_by_slug = AsyncMock(return_value=tenant)
        user_repo.get_by_email_and_tenant = AsyncMock(return_value=user)

        from fastapi import HTTPException
        from schemas.auth import RegisterRequest
        from services.auth_service import AuthService

        svc = AuthService(mock_db)
        req = RegisterRequest(
            email="dup@example.com",
            password="password123",
            username="dupuser",
            tenant_slug="gigforge",
        )
        with pytest.raises(HTTPException) as exc:
            await svc.register(req)
        assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_login_valid_credentials_returns_tokens(tenant_id, user_id, mock_db):
    tenant = _make_tenant(tenant_id)
    user = _make_user(user_id, tenant_id)

    with (
        patch("services.auth_service.UserRepository") as MockUserRepo,
        patch("services.auth_service.TokenRepository") as MockTokenRepo,
    ):
        user_repo = MockUserRepo.return_value
        user_repo.get_tenant_by_slug = AsyncMock(return_value=tenant)
        user_repo.get_by_email_and_tenant = AsyncMock(return_value=user)

        token_repo = MockTokenRepo.return_value
        token_repo.store_refresh_token = AsyncMock()

        mock_db.commit = AsyncMock()
        mock_db.flush = AsyncMock()

        from schemas.auth import LoginRequest
        from services.auth_service import AuthService

        svc = AuthService(mock_db)
        req = LoginRequest(
            email="test@example.com",
            password="correct-pass",
            tenant_slug="gigforge",
        )
        result = await svc.login(req)

    assert result.access_token
    assert result.refresh_token


@pytest.mark.asyncio
async def test_login_wrong_password_returns_401(tenant_id, user_id, mock_db):
    tenant = _make_tenant(tenant_id)
    user = _make_user(user_id, tenant_id)

    with (
        patch("services.auth_service.UserRepository") as MockUserRepo,
        patch("services.auth_service.TokenRepository"),
    ):
        user_repo = MockUserRepo.return_value
        user_repo.get_tenant_by_slug = AsyncMock(return_value=tenant)
        user_repo.get_by_email_and_tenant = AsyncMock(return_value=user)

        from fastapi import HTTPException
        from schemas.auth import LoginRequest
        from services.auth_service import AuthService

        svc = AuthService(mock_db)
        req = LoginRequest(
            email="test@example.com",
            password="wrong-pass",
            tenant_slug="gigforge",
        )
        with pytest.raises(HTTPException) as exc:
            await svc.login(req)
        assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_tenant_returns_401(mock_db):
    with (
        patch("services.auth_service.UserRepository") as MockUserRepo,
        patch("services.auth_service.TokenRepository"),
    ):
        user_repo = MockUserRepo.return_value
        user_repo.get_tenant_by_slug = AsyncMock(return_value=None)

        from fastapi import HTTPException
        from schemas.auth import LoginRequest
        from services.auth_service import AuthService

        svc = AuthService(mock_db)
        req = LoginRequest(
            email="test@example.com",
            password="pass",
            tenant_slug="nonexistent",
        )
        with pytest.raises(HTTPException) as exc:
            await svc.login(req)
        assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_refresh_returns_new_tokens(tenant_id, user_id, mock_db):
    from core.security import create_refresh_token
    user = _make_user(user_id, tenant_id)

    refresh_token_str, refresh_jti = create_refresh_token(
        {"sub": str(user_id), "tenant_id": str(tenant_id), "role": "agent"}
    )

    rt = MagicMock()
    rt.jti = refresh_jti
    rt.user_id = user_id
    rt.is_revoked = False

    from datetime import timedelta
    rt.expires_at = datetime.now(timezone.utc) + timedelta(days=6)

    with (
        patch("services.auth_service.UserRepository") as MockUserRepo,
        patch("services.auth_service.TokenRepository") as MockTokenRepo,
    ):
        user_repo = MockUserRepo.return_value
        user_repo.get_by_id = AsyncMock(return_value=user)

        token_repo = MockTokenRepo.return_value
        token_repo.get_refresh_token = AsyncMock(return_value=rt)
        token_repo.revoke_refresh_token = AsyncMock()
        token_repo.store_refresh_token = AsyncMock()

        mock_db.commit = AsyncMock()
        mock_db.flush = AsyncMock()

        from schemas.auth import RefreshRequest
        from services.auth_service import AuthService

        svc = AuthService(mock_db)
        req = RefreshRequest(refresh_token=refresh_token_str)
        result = await svc.refresh_tokens(req)

    assert result.access_token
    assert result.refresh_token
    token_repo.revoke_refresh_token.assert_called_once_with(refresh_jti)


@pytest.mark.asyncio
async def test_old_refresh_token_rejected_after_rotation(tenant_id, user_id, mock_db):
    from core.security import create_refresh_token

    refresh_token_str, refresh_jti = create_refresh_token(
        {"sub": str(user_id), "tenant_id": str(tenant_id), "role": "agent"}
    )

    rt = MagicMock()
    rt.jti = refresh_jti
    rt.is_revoked = True

    with (
        patch("services.auth_service.UserRepository"),
        patch("services.auth_service.TokenRepository") as MockTokenRepo,
    ):
        token_repo = MockTokenRepo.return_value
        token_repo.get_refresh_token = AsyncMock(return_value=rt)

        from fastapi import HTTPException
        from schemas.auth import RefreshRequest
        from services.auth_service import AuthService

        svc = AuthService(mock_db)
        req = RefreshRequest(refresh_token=refresh_token_str)
        with pytest.raises(HTTPException) as exc:
            await svc.refresh_tokens(req)
        assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_logout_blacklists_token(tenant_id, user_id, mock_db):
    with patch("services.auth_service.TokenRepository") as MockTokenRepo:
        token_repo = MockTokenRepo.return_value
        token_repo.blacklist_token = AsyncMock()
        mock_db.commit = AsyncMock()

        from services.auth_service import AuthService

        svc = AuthService(mock_db)
        await svc.logout("some-jti", user_id, datetime.now(timezone.utc))

    token_repo.blacklist_token.assert_called_once()
