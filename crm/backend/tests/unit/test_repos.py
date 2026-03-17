"""Additional repository coverage tests."""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# UserRepository
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_user_repo_get_tenant_by_slug(mock_db):
    tenant = MagicMock()
    tenant.slug = "gigforge"
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=tenant)
    mock_db.execute = AsyncMock(return_value=result)

    from repositories.user_repo import UserRepository
    repo = UserRepository(mock_db)
    t = await repo.get_tenant_by_slug("gigforge")
    assert t.slug == "gigforge"


@pytest.mark.asyncio
async def test_user_repo_get_tenant_not_found(mock_db):
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=None)
    mock_db.execute = AsyncMock(return_value=result)

    from repositories.user_repo import UserRepository
    repo = UserRepository(mock_db)
    assert await repo.get_tenant_by_slug("nope") is None


@pytest.mark.asyncio
async def test_user_repo_get_by_email_and_tenant(mock_db):
    uid = uuid.uuid4()
    tid = uuid.uuid4()
    user = MagicMock()
    user.id = uid
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=user)
    mock_db.execute = AsyncMock(return_value=result)

    from repositories.user_repo import UserRepository
    repo = UserRepository(mock_db)
    found = await repo.get_by_email_and_tenant("u@e.com", tid)
    assert found.id == uid


@pytest.mark.asyncio
async def test_user_repo_get_by_id(mock_db):
    uid = uuid.uuid4()
    user = MagicMock()
    user.id = uid
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=user)
    mock_db.execute = AsyncMock(return_value=result)

    from repositories.user_repo import UserRepository
    repo = UserRepository(mock_db)
    found = await repo.get_by_id(uid)
    assert found.id == uid


@pytest.mark.asyncio
async def test_user_repo_create(mock_db):
    uid = uuid.uuid4()
    tid = uuid.uuid4()
    user = MagicMock()
    user.id = uid

    mock_db.flush = AsyncMock()
    mock_db.refresh = AsyncMock()
    mock_db.add = MagicMock()

    with patch("repositories.user_repo.User", return_value=user):
        from repositories.user_repo import UserRepository
        repo = UserRepository(mock_db)
        result = await repo.create(
            email="u@e.com",
            username="uname",
            password_hash="hash",
            tenant_id=tid,
            role="admin",
        )

    mock_db.add.assert_called_once()
    mock_db.flush.assert_called_once()


# ---------------------------------------------------------------------------
# TokenRepository
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_token_repo_is_blacklisted_true(mock_db):
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value="some-jti")
    mock_db.execute = AsyncMock(return_value=result)

    from repositories.token_repo import TokenRepository
    repo = TokenRepository(mock_db)
    assert await repo.is_blacklisted("some-jti") is True


@pytest.mark.asyncio
async def test_token_repo_is_blacklisted_false(mock_db):
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=None)
    mock_db.execute = AsyncMock(return_value=result)

    from repositories.token_repo import TokenRepository
    repo = TokenRepository(mock_db)
    assert await repo.is_blacklisted("missing-jti") is False


@pytest.mark.asyncio
async def test_token_repo_blacklist_token(mock_db):
    uid = uuid.uuid4()
    exp = datetime.now(timezone.utc) + timedelta(minutes=15)
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()

    with patch("repositories.token_repo.TokenBlacklist") as MockBL:
        MockBL.return_value = MagicMock()
        from repositories.token_repo import TokenRepository
        repo = TokenRepository(mock_db)
        await repo.blacklist_token("jti-123", uid, exp)

    mock_db.add.assert_called_once()
    mock_db.flush.assert_called_once()


@pytest.mark.asyncio
async def test_token_repo_store_refresh_token(mock_db):
    uid = uuid.uuid4()
    exp = datetime.now(timezone.utc) + timedelta(days=7)
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()

    rt = MagicMock()
    with patch("repositories.token_repo.RefreshToken", return_value=rt):
        from repositories.token_repo import TokenRepository
        repo = TokenRepository(mock_db)
        result = await repo.store_refresh_token("jti-ref", uid, exp)

    assert result is rt
    mock_db.add.assert_called_once()


@pytest.mark.asyncio
async def test_token_repo_get_refresh_token(mock_db):
    rt = MagicMock()
    rt.jti = "some-jti"
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=rt)
    mock_db.execute = AsyncMock(return_value=result)

    from repositories.token_repo import TokenRepository
    repo = TokenRepository(mock_db)
    found = await repo.get_refresh_token("some-jti")
    assert found.jti == "some-jti"


@pytest.mark.asyncio
async def test_token_repo_revoke_refresh_token(mock_db):
    rt = MagicMock()
    rt.jti = "jti-rev"
    rt.is_revoked = False

    from repositories.token_repo import TokenRepository
    repo = TokenRepository(mock_db)
    repo.get_refresh_token = AsyncMock(return_value=rt)
    mock_db.flush = AsyncMock()

    await repo.revoke_refresh_token("jti-rev")
    assert rt.is_revoked is True
    mock_db.flush.assert_called_once()


@pytest.mark.asyncio
async def test_token_repo_revoke_nonexistent_is_noop(mock_db):
    from repositories.token_repo import TokenRepository
    repo = TokenRepository(mock_db)
    repo.get_refresh_token = AsyncMock(return_value=None)
    mock_db.flush = AsyncMock()
    await repo.revoke_refresh_token("ghost-jti")
    mock_db.flush.assert_not_called()


# ---------------------------------------------------------------------------
# ContactRepository — additional paths
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_contact_repo_update_applies_changes(mock_db, sample_tenant_id):
    cid = uuid.uuid4()
    contact = MagicMock()
    contact.id = cid
    contact.tenant_id = sample_tenant_id
    contact.first_name = "Old"
    contact.contact_tags = []

    mock_db.flush = AsyncMock()
    mock_db.refresh = AsyncMock()

    from repositories.contact_repo import ContactRepository
    repo = ContactRepository(mock_db)
    repo.get_by_id = AsyncMock(return_value=contact)

    result = await repo.update(cid, sample_tenant_id, {"first_name": "New"})
    assert contact.first_name == "New"
    assert result is contact


# ---------------------------------------------------------------------------
# CompanyRepository — additional paths
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_company_repo_update_applies_changes(mock_db, sample_tenant_id):
    cid = uuid.uuid4()
    company = MagicMock()
    company.name = "Old Name"

    mock_db.flush = AsyncMock()
    mock_db.refresh = AsyncMock()

    from repositories.company_repo import CompanyRepository
    repo = CompanyRepository(mock_db)
    repo.get_by_id = AsyncMock(return_value=company)

    result = await repo.update(cid, sample_tenant_id, {"name": "New Name"})
    assert company.name == "New Name"
    assert result is company


@pytest.mark.asyncio
async def test_company_repo_list(mock_db, sample_tenant_id):
    company = MagicMock()
    scalars_result = MagicMock()
    scalars_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[company]))
    )
    count_result = MagicMock()
    count_result.scalar_one = MagicMock(return_value=1)

    mock_db.execute = AsyncMock(side_effect=[count_result, scalars_result])

    from repositories.company_repo import CompanyRepository
    repo = CompanyRepository(mock_db)
    companies, total = await repo.list(sample_tenant_id)
    assert total == 1
    assert len(companies) == 1


# ---------------------------------------------------------------------------
# TagRepository — additional paths
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tag_repo_get_by_id(mock_db, sample_tenant_id):
    tag = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=tag)
    mock_db.execute = AsyncMock(return_value=result)

    from repositories.tag_repo import TagRepository
    repo = TagRepository(mock_db)
    found = await repo.get_by_id(uuid.uuid4(), sample_tenant_id)
    assert found is tag


@pytest.mark.asyncio
async def test_tag_repo_remove_from_contact_cross_tenant_returns_false(
    mock_db, other_tenant_id
):
    contact_id = uuid.uuid4()
    tag_id = uuid.uuid4()

    none_result = MagicMock()
    none_result.scalar_one_or_none = MagicMock(return_value=None)
    mock_db.execute = AsyncMock(return_value=none_result)

    from repositories.tag_repo import TagRepository
    repo = TagRepository(mock_db)
    result = await repo.remove_from_contact(contact_id, tag_id, other_tenant_id)
    assert result is False


@pytest.mark.asyncio
async def test_tag_repo_assign_existing_tag_is_idempotent(mock_db, sample_tenant_id):
    contact_id = uuid.uuid4()
    tag_id = uuid.uuid4()

    contact = MagicMock()
    tag = MagicMock()
    ct = MagicMock()  # already exists

    # execute calls: 1=get contact, 2=get tag (via get_by_id), 3=existing check
    contact_result = MagicMock()
    contact_result.scalar_one_or_none = MagicMock(return_value=contact)

    tag_result = MagicMock()
    tag_result.scalar_one_or_none = MagicMock(return_value=tag)

    existing_result = MagicMock()
    existing_result.scalar_one_or_none = MagicMock(return_value=ct)

    mock_db.execute = AsyncMock(side_effect=[contact_result, tag_result, existing_result])
    mock_db.add = MagicMock()

    from repositories.tag_repo import TagRepository
    repo = TagRepository(mock_db)
    result = await repo.assign_to_contact(contact_id, tag_id, sample_tenant_id)

    assert result is True
    mock_db.add.assert_not_called()  # already exists — no double insert
