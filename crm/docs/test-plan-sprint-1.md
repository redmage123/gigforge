# CRM Platform — QA Test Plan: Sprint 1

**Author:** gigforge-qa
**Sprint:** Sprint 1 (2026-03-15 → 2026-03-22)
**Stories in scope:** CRM-101, CRM-102, CRM-103, CRM-104, CRM-105, CRM-201, CRM-202, CRM-203, CRM-204, CRM-301, CRM-302, CRM-303
**Status:** ACTIVE

---

## 1. Test Strategy

### 1.1 Three-Layer Pyramid

| Layer | Type | When runs | DB | What it verifies |
|-------|------|-----------|----|-----------------|
| **Unit** | Mocked, pure Python | Every commit | None (mocked) | Business logic, validation, edge cases |
| **Integration** | Real FastAPI + real PostgreSQL | Per story completion | Live PostgreSQL 16 (test DB) | SQL queries, ORM mappings, FK constraints, tenant scoping |
| **Acceptance** | Full Docker stack | Sprint-end gate | Docker Compose stack | End-to-end user flows, cross-tenant isolation, OpenAPI spec |

### 1.2 Test Runner Configuration

```ini
# pytest.ini
[pytest]
asyncio_mode = auto
testpaths = tests
addopts =
    --cov=app
    --cov-report=term-missing
    --cov-report=html:htmlcov
    -v

markers =
    unit: Pure unit tests — no DB, no network
    integration: Requires real PostgreSQL (docker compose up db)
    acceptance: Requires full Docker stack
    slow: Takes > 10s — excluded from fast runs
    security: Auth and isolation tests — always run
```

### 1.3 Coverage Target

```bash
# Enforced gate — run inside Docker
docker compose exec api pytest --cov=app --cov-fail-under=80

# Fast run (unit + integration, skip slow)
docker compose exec api pytest -m "not slow and not acceptance"

# Full suite
docker compose exec api pytest
```

Coverage collected on `app/` package only. Test code excluded. Minimum **80%** — sprint cannot close below this threshold.

### 1.4 Database Isolation Strategy

- Each integration test uses a **separate transaction rolled back after each test** (no persistent state between tests).
- `conftest.py` provides:
  - `gigforge_tenant` fixture — creates the GigForge tenant
  - `techuni_tenant` fixture — creates the TechUni tenant
  - `gigforge_token` / `techuni_token` fixtures — valid JWTs for each tenant
  - `async_client` fixture — `httpx.AsyncClient` pointed at the test app

### 1.5 Fixture Structure

```
tests/
├── conftest.py              # DB setup, fixtures, client
├── unit/
│   ├── test_auth.py
│   ├── test_tenant_isolation.py
│   ├── test_rbac.py
│   ├── test_contacts.py
│   ├── test_companies.py
│   └── test_tags.py
├── integration/
│   ├── test_migrations.py
│   ├── test_auth_flow.py
│   ├── test_tenant_isolation_integration.py
│   ├── test_contacts_api.py
│   ├── test_companies_api.py
│   └── test_tags_api.py
└── security/
    ├── test_cross_tenant.py     ← CRITICAL — written first
    └── test_auth_security.py
```

---

## 2. Coverage Target

**Threshold:** ≥ 80% line coverage on `app/` package.

Enforced via:
```bash
pytest --cov=app --cov-fail-under=80
```

Coverage configuration in `pyproject.toml`:
```toml
[tool.coverage.run]
source = ["app"]
omit = ["app/main.py"]  # entry point only

[tool.coverage.report]
fail_under = 80
show_missing = true
```

Per-module targets:

| Module | Min coverage | Notes |
|--------|-------------|-------|
| `app/core/security.py` | 95% | JWT encode/decode — safety critical |
| `app/core/tenant.py` | 95% | Isolation middleware — safety critical |
| `app/api/routes/auth.py` | 90% | Auth endpoints |
| `app/api/routes/contacts.py` | 85% | CRUD |
| `app/api/routes/companies.py` | 85% | CRUD |
| `app/api/routes/tags.py` | 85% | CRUD |
| `app/models/` | 70% | ORM models — mostly structural |
| `app/services/` | 85% | Business logic |

---

## 3. Test Cases Per Story

### CRM-101 — Project Scaffolding

**File:** `tests/unit/test_scaffolding.py`, `tests/integration/test_health.py`

| Test ID | Layer | What it verifies |
|---------|-------|-----------------|
| `test_health_check_returns_200_with_status_ok` | Unit | `GET /health` → `{"status": "ok", "version": "0.1.0"}` |
| `test_health_check_includes_version_field` | Unit | Response body contains `version` key |
| `test_missing_required_env_var_raises_on_startup` | Unit | App raises `ValidationError` when required env var absent |
| `test_db_session_dependency_yields_and_closes` | Unit | Session dependency yields `AsyncSession`, closes on teardown |
| `test_app_starts_and_health_returns_200_in_docker` | Acceptance | `docker compose up` → `curl /health` → 200 |

---

### CRM-102 — SQLAlchemy Models

**File:** `tests/unit/test_models.py`

| Test ID | Layer | What it verifies |
|---------|-------|-----------------|
| `test_all_models_importable_from_app_models` | Unit | `from app.models import Contact, Company, Tag, ...` — no ImportError |
| `test_tenant_scoped_models_have_tenant_id_fk` | Unit | Each tenant-scoped model has `tenant_id` column with FK |
| `test_timestamp_mixin_applied_to_all_models` | Unit | All models have `created_at`, `updated_at` columns |
| `test_contact_repr_is_defined` | Unit | `repr(Contact(...))` returns non-empty string |
| `test_company_repr_is_defined` | Unit | `repr(Company(...))` returns non-empty string |
| `test_deal_repr_is_defined` | Unit | `repr(Deal(...))` returns non-empty string |
| `test_enums_stored_as_varchar` | Unit | `UserRole` enum inherits `str` |
| `test_user_email_tenant_unique_constraint_defined` | Unit | `User.__table__` has unique constraint on `(tenant_id, email)` |
| `test_pipeline_slug_tenant_unique_constraint_defined` | Unit | `Pipeline.__table__` has unique constraint on `(tenant_id, slug)` |

---

### CRM-103 — Alembic Migrations

**File:** `tests/integration/test_migrations.py`

| Test ID | Layer | What it verifies |
|---------|-------|-----------------|
| `test_alembic_upgrade_head_creates_all_tables` | Integration | After `upgrade head`, all expected tables exist in `information_schema` |
| `test_alembic_downgrade_base_removes_all_tables` | Integration | After `downgrade base`, no app tables exist |
| `test_migration_creates_gin_index_on_contacts_search_vector` | Integration | `pg_indexes` contains GIN index on `contacts.search_vector` |
| `test_migration_creates_tenant_id_indexes` | Integration | `tenant_id` is indexed on all child tables |
| `test_migration_idempotent_on_second_run` | Integration | Running `upgrade head` twice raises no error |

---

### CRM-104 — Docker Compose Stack

**File:** `tests/acceptance/test_docker_stack.py`

| Test ID | Layer | What it verifies |
|---------|-------|-----------------|
| `test_docker_compose_up_health_returns_200` | Acceptance | `GET /health` → 200 with stack running |
| `test_db_service_healthy_before_api_starts` | Acceptance | Docker health check dependency respected |
| `test_api_hot_reload_in_dev_mode` | Acceptance | Source mount: edit file → app reloads without restart |
| `test_pgadmin_service_accessible` | Acceptance | pgAdmin responds on configured port |
| `test_multi_stage_dockerfile_runner_is_nonroot` | Acceptance | Container runs as non-root user |

---

### CRM-105 — Seed Data

**File:** `tests/integration/test_seed.py`

| Test ID | Layer | What it verifies |
|---------|-------|-----------------|
| `test_seed_creates_gigforge_tenant` | Integration | Tenant with slug `gigforge` exists after seed |
| `test_seed_creates_techuni_tenant` | Integration | Tenant with slug `techuni` exists after seed |
| `test_seed_creates_gigforge_admin_user` | Integration | `admin@gigforge.ai` exists with role `admin` |
| `test_seed_creates_techuni_admin_user` | Integration | `admin@techuni.ai` exists with role `admin` |
| `test_seed_is_idempotent` | Integration | Running seed twice produces exactly 2 tenants, 2 users |
| `test_seed_reads_passwords_from_env` | Unit | Seed uses `GIGFORGE_ADMIN_PASSWORD` env var, not hardcoded |
| `test_seed_tenants_are_isolated` | Integration | GigForge tenant cannot see TechUni users via ORM query |

---

### CRM-201 — User Registration + JWT Login

**File:** `tests/unit/test_auth.py`, `tests/integration/test_auth_flow.py`

| Test ID | Layer | What it verifies |
|---------|-------|-----------------|
| `test_register_new_user_returns_201_with_tokens` | Integration | `POST /auth/register` → 201, body has `access_token`, `refresh_token`, `user` |
| `test_register_duplicate_email_same_tenant_returns_409` | Integration | Registering same email in same tenant → 409 |
| `test_register_same_email_different_tenants_allowed` | Integration | Same email can exist in GigForge and TechUni separately |
| `test_login_valid_credentials_returns_tokens` | Integration | `POST /auth/login` → 200, body has tokens |
| `test_login_wrong_password_returns_401` | Integration | Bad password → 401 (not 403, not 404) |
| `test_login_unknown_tenant_slug_returns_401` | Integration | Non-existent tenant → 401 (no enumeration) |
| `test_access_token_expires_after_15_minutes` | Unit | Token with `exp = now - 1s` rejected by validator |
| `test_access_token_is_hs256_signed` | Unit | Decoded token header has `alg: HS256` |
| `test_password_stored_as_bcrypt_hash` | Integration | DB `password_hash` column starts with `$2b$` |
| `test_bcrypt_cost_factor_is_12_or_higher` | Unit | Cost factor in stored hash ≥ 12 |
| `test_registration_requires_tenant_slug` | Integration | `POST /auth/register` without `tenant_slug` → 422 |

---

### CRM-202 — Tenant Isolation Middleware

**File:** `tests/security/test_cross_tenant.py`

> **⚠️ CRITICAL SUITE — written first, must pass with 0 failures before sprint closes.**

| Test ID | Layer | What it verifies |
|---------|-------|-----------------|
| `test_gigforge_user_cannot_list_techuni_contacts` | Security | GigForge token on `GET /contacts` returns only GigForge contacts — TechUni contacts absent |
| `test_gigforge_user_cannot_get_techuni_contact_by_id` | Security | GigForge token + TechUni contact UUID → 404 |
| `test_gigforge_user_cannot_update_techuni_contact` | Security | GigForge token + `PUT /contacts/{techuni_id}` → 404 |
| `test_gigforge_user_cannot_delete_techuni_contact` | Security | GigForge token + `DELETE /contacts/{techuni_id}` → 404 |
| `test_cross_tenant_company_id_in_url_returns_404` | Security | GigForge token + TechUni company UUID → 404 |
| `test_cross_tenant_tag_assignment_returns_404` | Security | GigForge token + `POST /contacts/{gf_id}/tags` with TechUni tag_id → 404 |
| `test_tenant_id_extracted_correctly_from_jwt` | Unit | `get_current_tenant` dependency returns correct `tenant_id` from token |
| `test_injecting_different_tenant_id_cannot_leak_data` | Unit | Service method with wrong `tenant_id` returns empty/404 even with valid DB rows |
| `test_cross_tenant_deal_update_returns_404` | Security | GigForge token + TechUni deal UUID → 404 |
| `test_unauthenticated_request_returns_401` | Security | No token on any protected endpoint → 401 |

Additional unit coverage for `app/core/tenant.py`:

| Test ID | Layer | What it verifies |
|---------|-------|-----------------|
| `test_get_current_tenant_raises_401_on_missing_token` | Unit | No `Authorization` header → raises `HTTPException(401)` |
| `test_get_current_tenant_raises_401_on_invalid_signature` | Unit | Tampered token → raises `HTTPException(401)` |
| `test_get_current_tenant_raises_401_on_expired_token` | Unit | Expired token → raises `HTTPException(401)` |
| `test_all_service_methods_require_tenant_id_parameter` | Unit | Introspect service layer — every method signature includes `tenant_id` |

---

### CRM-203 — RBAC Permission Dependency

**File:** `tests/unit/test_rbac.py`, `tests/security/test_auth_security.py`

| Test ID | Layer | What it verifies |
|---------|-------|-----------------|
| `test_viewer_cannot_create_contact_returns_403` | Integration | Viewer token + `POST /contacts` → 403 |
| `test_viewer_cannot_delete_contact_returns_403` | Integration | Viewer token + `DELETE /contacts/{id}` → 403 |
| `test_viewer_can_list_contacts_returns_200` | Integration | Viewer token + `GET /contacts` → 200 |
| `test_admin_can_delete_any_contact` | Integration | Admin token + `DELETE /contacts/{id}` → 204 |
| `test_sales_rep_cannot_update_other_users_deal` | Integration | sales_rep token + `PUT /deals/{id}` (owner = other user) → 403 |
| `test_sales_rep_can_update_own_deal` | Integration | sales_rep token + `PUT /deals/{id}` (owner = self) → 200 |
| `test_require_role_multiple_allowed_roles` | Unit | `require_role("admin", "manager")` — admin passes, manager passes, viewer fails |
| `test_insufficient_role_returns_403_with_detail` | Unit | 403 body = `{"detail": "Insufficient permissions"}` exactly |
| `test_manager_can_manage_pipelines` | Integration | Manager token + `POST /pipelines` → 201 |
| `test_sales_rep_cannot_manage_pipelines` | Integration | sales_rep token + `POST /pipelines` → 403 |
| `test_admin_can_manage_webhooks` | Integration | Admin token + `POST /webhooks` → 201 |
| `test_manager_cannot_manage_webhooks` | Integration | Manager token + `POST /webhooks` → 403 |

---

### CRM-204 — Token Refresh + Logout

**File:** `tests/integration/test_auth_flow.py`, `tests/security/test_auth_security.py`

| Test ID | Layer | What it verifies |
|---------|-------|-----------------|
| `test_refresh_returns_new_tokens` | Integration | `POST /auth/refresh` with valid refresh token → 200, new access+refresh tokens |
| `test_old_refresh_token_rejected_after_rotation` | Integration | Use old refresh token after rotation → 401 |
| `test_logout_blacklists_access_token` | Integration | `POST /auth/logout` → 200; subsequent request with same token → 401 |
| `test_blacklisted_token_rejected_on_next_request` | Integration | Blacklisted access token on `GET /contacts` → 401 |
| `test_expired_refresh_token_returns_401_with_message` | Integration | Expired refresh token → 401 `{"detail": "Refresh token expired"}` |
| `test_refresh_token_has_7_day_ttl` | Unit | Decoded refresh token `exp - iat == 7 days` |
| `test_access_token_has_15_minute_ttl` | Unit | Decoded access token `exp - iat == 15 minutes` |

---

### CRM-301 — Contacts CRUD API

**File:** `tests/integration/test_contacts_api.py`

| Test ID | Layer | What it verifies |
|---------|-------|-----------------|
| `test_create_contact_returns_201_with_id` | Integration | `POST /contacts` → 201, body has `id` (UUID) |
| `test_create_contact_missing_email_returns_422` | Integration | `POST /contacts` without `email` → 422 |
| `test_create_contact_missing_first_name_returns_422` | Integration | `POST /contacts` without `first_name` → 422 |
| `test_create_contact_missing_last_name_returns_422` | Integration | `POST /contacts` without `last_name` → 422 |
| `test_list_contacts_pagination_works` | Integration | `GET /contacts?page=2&per_page=5` returns correct page |
| `test_list_contacts_default_per_page_is_20` | Integration | `GET /contacts` returns ≤ 20 records by default |
| `test_list_contacts_max_per_page_100` | Integration | `GET /contacts?per_page=200` → 422 or clamped to 100 |
| `test_list_contacts_scoped_to_tenant` | Integration | GigForge user sees only GigForge contacts |
| `test_update_contact_returns_200` | Integration | `PUT /contacts/{id}` → 200, updated fields in response |
| `test_patch_contact_partial_update` | Integration | `PATCH /contacts/{id}` with one field → only that field updated |
| `test_delete_contact_soft_deletes` | Integration | `DELETE /contacts/{id}` → 204; `GET /contacts/{id}` → 404 |
| `test_deleted_contact_visible_with_include_deleted_flag` | Integration | `GET /contacts?include_deleted=true` shows soft-deleted record |
| `test_cross_tenant_contact_id_returns_404` | Security | Covered in cross-tenant suite |
| `test_list_contacts_filter_by_company_id` | Integration | `?company_id=X` returns only contacts at that company |
| `test_list_contacts_filter_by_tag_ids` | Integration | `?tag_ids=X,Y` returns contacts with both tags (AND) |
| `test_contact_response_includes_company_name` | Integration | Response body has `company.name` nested |
| `test_contact_response_includes_tags` | Integration | Response body has `tags: [...]` list |
| `test_put_nonexistent_contact_returns_404` | Integration | `PUT /contacts/{unknown_id}` → 404 |

---

### CRM-302 — Companies CRUD API

**File:** `tests/integration/test_companies_api.py`

| Test ID | Layer | What it verifies |
|---------|-------|-----------------|
| `test_create_company_returns_201` | Integration | `POST /companies` with `name` → 201 |
| `test_create_company_missing_name_returns_422` | Integration | `POST /companies` without `name` → 422 |
| `test_list_companies_scoped_to_tenant` | Integration | GigForge user sees only GigForge companies |
| `test_get_company_contacts_returns_associated_records` | Integration | `GET /companies/{id}/contacts` returns linked contacts |
| `test_get_company_contacts_paginated` | Integration | Accepts `page`, `per_page` params |
| `test_delete_company_nulls_contact_company_id` | Integration | After `DELETE /companies/{id}`, associated contacts have `company_id = null` |
| `test_delete_company_does_not_delete_contacts` | Integration | Contacts still exist after company deletion |
| `test_update_company_optional_fields` | Integration | `PUT /companies/{id}` with `domain`, `industry`, `website` → 200 |
| `test_cross_tenant_company_returns_404` | Security | Covered in cross-tenant suite |

---

### CRM-303 — Tags System

**File:** `tests/integration/test_tags_api.py`

| Test ID | Layer | What it verifies |
|---------|-------|-----------------|
| `test_create_tag_returns_201` | Integration | `POST /tags` → 201 |
| `test_list_tags_returns_tenant_tags_only` | Integration | `GET /tags` scoped to tenant |
| `test_tag_name_unique_per_tenant` | Integration | Duplicate tag name in same tenant → 409 |
| `test_same_tag_name_allowed_in_different_tenants` | Integration | TechUni and GigForge can each have a "VIP" tag |
| `test_tag_name_case_insensitive_unique` | Integration | "VIP" and "vip" in same tenant → 409 |
| `test_assign_tag_to_contact` | Integration | `POST /contacts/{id}/tags` → 200; contact response includes tag |
| `test_remove_tag_from_contact` | Integration | `DELETE /contacts/{id}/tags/{tag_id}` → 204 |
| `test_assign_nonexistent_tag_returns_404` | Integration | `POST /contacts/{id}/tags` with invalid `tag_id` → 404 |
| `test_cross_tenant_tag_assignment_returns_404` | Security | Covered in cross-tenant suite |
| `test_delete_tag_removes_from_all_associations` | Integration | Delete tag → removed from all contacts/companies |
| `test_filter_contacts_by_tag_ids_and_logic` | Integration | `GET /contacts?tag_ids=X,Y` — contact must have BOTH tags |

---

## 4. Cross-Tenant Isolation Suite (CRITICAL)

**File:** `tests/security/test_cross_tenant.py`

These tests are written **before any CRUD implementation begins**. They start as failing tests (RED) and must all be GREEN before the sprint closes. This suite runs on every PR.

```python
"""
Cross-Tenant Isolation Test Suite
==================================
These tests verify that a user authenticated to Tenant A
cannot read, modify, or delete data belonging to Tenant B —
regardless of URL manipulation or ID guessing.

All tests use real PostgreSQL (integration layer).
All tests mark: @pytest.mark.security
"""
import pytest
import httpx

pytestmark = [pytest.mark.security, pytest.mark.integration]


@pytest.fixture
async def cross_tenant_setup(async_client, gigforge_tenant, techuni_tenant,
                              gigforge_token, techuni_token, db_session):
    """
    Creates one contact in each tenant and returns their IDs.
    GigForge user will attempt to access TechUni resources.
    """
    # Create a TechUni contact
    resp = await async_client.post(
        "/contacts",
        json={"first_name": "Alice", "last_name": "Smith", "email": "alice@techuni.ai"},
        headers={"Authorization": f"Bearer {techuni_token}"},
    )
    assert resp.status_code == 201
    techuni_contact_id = resp.json()["id"]

    # Create a TechUni company
    resp = await async_client.post(
        "/companies",
        json={"name": "TechUni Corp"},
        headers={"Authorization": f"Bearer {techuni_token}"},
    )
    assert resp.status_code == 201
    techuni_company_id = resp.json()["id"]

    # Create a TechUni tag
    resp = await async_client.post(
        "/tags",
        json={"name": "VIP"},
        headers={"Authorization": f"Bearer {techuni_token}"},
    )
    assert resp.status_code == 201
    techuni_tag_id = resp.json()["id"]

    # Create a GigForge contact (for tag-assignment test)
    resp = await async_client.post(
        "/contacts",
        json={"first_name": "Bob", "last_name": "Jones", "email": "bob@gigforge.ai"},
        headers={"Authorization": f"Bearer {gigforge_token}"},
    )
    assert resp.status_code == 201
    gigforge_contact_id = resp.json()["id"]

    return {
        "techuni_contact_id": techuni_contact_id,
        "techuni_company_id": techuni_company_id,
        "techuni_tag_id": techuni_tag_id,
        "gigforge_contact_id": gigforge_contact_id,
    }


async def test_gigforge_user_cannot_list_techuni_contacts(
    async_client, cross_tenant_setup, gigforge_token
):
    """
    GigForge user lists /contacts.
    Must only see GigForge contacts — TechUni contact must be absent.
    """
    resp = await async_client.get(
        "/contacts",
        headers={"Authorization": f"Bearer {gigforge_token}"},
    )
    assert resp.status_code == 200
    ids = [c["id"] for c in resp.json()["items"]]
    assert cross_tenant_setup["techuni_contact_id"] not in ids, (
        "TechUni contact leaked into GigForge tenant's contact list"
    )


async def test_gigforge_user_cannot_get_techuni_contact_by_id(
    async_client, cross_tenant_setup, gigforge_token
):
    """
    GigForge user attempts GET /contacts/{techuni_contact_id}.
    Must return 404 — must NOT return 403 (do not reveal existence).
    """
    techuni_id = cross_tenant_setup["techuni_contact_id"]
    resp = await async_client.get(
        f"/contacts/{techuni_id}",
        headers={"Authorization": f"Bearer {gigforge_token}"},
    )
    assert resp.status_code == 404, (
        f"Expected 404 but got {resp.status_code} — cross-tenant contact leaked"
    )


async def test_gigforge_user_cannot_update_techuni_contact(
    async_client, cross_tenant_setup, gigforge_token
):
    """
    GigForge user attempts PUT /contacts/{techuni_contact_id}.
    Must return 404.
    """
    techuni_id = cross_tenant_setup["techuni_contact_id"]
    resp = await async_client.put(
        f"/contacts/{techuni_id}",
        json={"first_name": "Hacked", "last_name": "Name", "email": "hacked@evil.com"},
        headers={"Authorization": f"Bearer {gigforge_token}"},
    )
    assert resp.status_code == 404, (
        f"Expected 404 but got {resp.status_code} — cross-tenant update succeeded"
    )


async def test_gigforge_user_cannot_delete_techuni_contact(
    async_client, cross_tenant_setup, gigforge_token
):
    """
    GigForge user attempts DELETE /contacts/{techuni_contact_id}.
    Must return 404.
    """
    techuni_id = cross_tenant_setup["techuni_contact_id"]
    resp = await async_client.delete(
        f"/contacts/{techuni_id}",
        headers={"Authorization": f"Bearer {gigforge_token}"},
    )
    assert resp.status_code == 404, (
        f"Expected 404 but got {resp.status_code} — cross-tenant delete succeeded"
    )


async def test_cross_tenant_company_id_in_url_returns_404(
    async_client, cross_tenant_setup, gigforge_token
):
    """
    GigForge user attempts GET /companies/{techuni_company_id}.
    Must return 404.
    """
    techuni_co_id = cross_tenant_setup["techuni_company_id"]
    resp = await async_client.get(
        f"/companies/{techuni_co_id}",
        headers={"Authorization": f"Bearer {gigforge_token}"},
    )
    assert resp.status_code == 404, (
        f"Expected 404 but got {resp.status_code} — cross-tenant company leaked"
    )


async def test_cross_tenant_tag_assignment_returns_404(
    async_client, cross_tenant_setup, gigforge_token
):
    """
    GigForge user attempts to assign a TechUni tag to a GigForge contact.
    The TechUni tag_id must not be found → 404.
    """
    gf_contact_id = cross_tenant_setup["gigforge_contact_id"]
    techuni_tag_id = cross_tenant_setup["techuni_tag_id"]
    resp = await async_client.post(
        f"/contacts/{gf_contact_id}/tags",
        json={"tag_ids": [techuni_tag_id]},
        headers={"Authorization": f"Bearer {gigforge_token}"},
    )
    assert resp.status_code == 404, (
        f"Expected 404 but got {resp.status_code} — cross-tenant tag assignment succeeded"
    )
```

---

## 5. Security Tests

**File:** `tests/security/test_auth_security.py`

These tests cover the JWT security boundary independently of the CRUD logic.

| Test ID | Scenario | Expected result |
|---------|----------|----------------|
| `test_request_without_token_returns_401` | No `Authorization` header on any protected endpoint | 401 |
| `test_request_with_malformed_bearer_returns_401` | `Authorization: Bearer not.a.jwt` | 401 |
| `test_request_with_wrong_signature_returns_401` | Token signed with wrong secret | 401 |
| `test_request_with_expired_token_returns_401` | Token `exp` = 1 second ago | 401 |
| `test_blacklisted_token_returns_401` | Token that has been logged out | 401 |
| `test_login_wrong_password_returns_401` | Correct email, wrong password | 401 (no 404) |
| `test_login_wrong_password_same_response_time` | Timing attack resistance | Response time must not leak user existence |
| `test_login_nonexistent_user_returns_401` | Unknown email | 401 (same body as wrong password — no user enumeration) |
| `test_viewer_cannot_post_contact_returns_403` | Viewer role, `POST /contacts` | 403 |
| `test_sales_rep_cannot_manage_users_returns_403` | sales_rep role, `POST /users` | 403 |
| `test_no_token_on_post_contacts_returns_401` | Unauthenticated `POST /contacts` | 401 |
| `test_no_token_on_delete_contact_returns_401` | Unauthenticated `DELETE /contacts/{id}` | 401 |
| `test_token_from_different_tenant_cannot_access_resources` | TechUni token on GigForge endpoint | 404 on specific resources |
| `test_refresh_with_access_token_rejected` | Using access token as refresh token | 401 |

```python
"""
JWT Security Test Stubs
========================
All marked @pytest.mark.security — run on every PR regardless of -m filter.
"""
import pytest
from datetime import datetime, timezone, timedelta
import jwt  # PyJWT

pytestmark = pytest.mark.security

SECRET = "test-secret"  # Matches TEST_JWT_SECRET env var in conftest

def make_token(payload: dict, secret: str = SECRET) -> str:
    return jwt.encode(payload, secret, algorithm="HS256")

def expired_token(user_id: str, tenant_id: str) -> str:
    return make_token({
        "sub": user_id,
        "tenant_id": tenant_id,
        "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
    })

def wrong_sig_token(user_id: str, tenant_id: str) -> str:
    return make_token({
        "sub": user_id,
        "tenant_id": tenant_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
    }, secret="wrong-secret")


async def test_request_without_token_returns_401(async_client):
    resp = await async_client.get("/contacts")
    assert resp.status_code == 401

async def test_request_with_malformed_bearer_returns_401(async_client):
    resp = await async_client.get(
        "/contacts",
        headers={"Authorization": "Bearer not.a.real.jwt"},
    )
    assert resp.status_code == 401

async def test_request_with_wrong_signature_returns_401(
    async_client, gigforge_tenant, gigforge_user
):
    token = wrong_sig_token(str(gigforge_user.id), str(gigforge_tenant.id))
    resp = await async_client.get(
        "/contacts",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 401

async def test_request_with_expired_token_returns_401(
    async_client, gigforge_tenant, gigforge_user
):
    token = expired_token(str(gigforge_user.id), str(gigforge_tenant.id))
    resp = await async_client.get(
        "/contacts",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 401

async def test_blacklisted_token_returns_401(
    async_client, gigforge_token
):
    # Logout first
    logout_resp = await async_client.post(
        "/auth/logout",
        headers={"Authorization": f"Bearer {gigforge_token}"},
    )
    assert logout_resp.status_code == 200

    # Then attempt to use the same token
    resp = await async_client.get(
        "/contacts",
        headers={"Authorization": f"Bearer {gigforge_token}"},
    )
    assert resp.status_code == 401

async def test_login_wrong_password_returns_401(async_client, gigforge_tenant):
    resp = await async_client.post(
        "/auth/login",
        json={
            "email": "admin@gigforge.ai",
            "password": "definitely-wrong-password",
            "tenant_slug": "gigforge",
        },
    )
    assert resp.status_code == 401
    # Must NOT say "user not found" or "wrong password" — no enumeration
    assert "not found" not in resp.text.lower()

async def test_login_nonexistent_user_returns_401(async_client, gigforge_tenant):
    resp = await async_client.post(
        "/auth/login",
        json={
            "email": "nobody@gigforge.ai",
            "password": "any-password",
            "tenant_slug": "gigforge",
        },
    )
    assert resp.status_code == 401

async def test_viewer_cannot_post_contact_returns_403(
    async_client, viewer_token
):
    resp = await async_client.post(
        "/contacts",
        json={"first_name": "X", "last_name": "Y", "email": "x@y.com"},
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Insufficient permissions"

async def test_no_token_on_post_contacts_returns_401(async_client):
    resp = await async_client.post(
        "/contacts",
        json={"first_name": "X", "last_name": "Y", "email": "x@y.com"},
    )
    assert resp.status_code == 401

async def test_refresh_with_access_token_rejected(
    async_client, gigforge_token
):
    """Access token must not be accepted as a refresh token."""
    resp = await async_client.post(
        "/auth/refresh",
        json={"refresh_token": gigforge_token},
    )
    assert resp.status_code == 401
```

---

## 6. Sprint-End Acceptance Checklist

Run this checklist manually on **Day 8 (2026-03-22)** against the full Docker stack before issuing APPROVED.

### 6.1 Environment Setup

```bash
cd /opt/ai-elevate/gigforge/projects/crm
cp .env.example .env
# Set GIGFORGE_ADMIN_PASSWORD, TECHUNI_ADMIN_PASSWORD, JWT_SECRET_KEY
docker compose up -d --build
docker compose exec api alembic upgrade head
docker compose exec api python scripts/seed.py
```

### 6.2 Automated Test Gate

```bash
# Full suite with coverage
docker compose exec api pytest --cov=app --cov-fail-under=80 -v

# Must produce:
# - 0 failures
# - 0 errors
# - ≥ 80% coverage
# - All @pytest.mark.security tests PASSED
```

☐ `pytest` exits 0 (all tests pass)
☐ Coverage report shows ≥ 80%
☐ All 6 cross-tenant tests PASSED
☐ All security tests in `tests/security/` PASSED

### 6.3 Per-Story Acceptance Criteria

**CRM-101 — Scaffolding**
☐ `GET /health` returns `{"status": "ok", "version": "0.1.0"}` (HTTP 200)
☐ App starts with `uvicorn app.main:app --reload` without errors
☐ `.env.example` exists and documents all required variables

**CRM-102 — Models**
☐ All 15 entities importable from `app.models`
☐ All tenant-scoped models have `tenant_id` FK
☐ `alembic revision --autogenerate` produces no diff (models == schema)

**CRM-103 — Migrations**
☐ `alembic upgrade head` runs cleanly on fresh PostgreSQL 16
☐ `alembic downgrade base` removes all tables
☐ GIN index on `contacts.search_vector` confirmed in `pg_indexes`

**CRM-104 — Docker**
☐ `docker compose up` starts all 3 services (db, api, pgadmin)
☐ `GET /health` returns 200 within 30s of `docker compose up`
☐ pgAdmin accessible on configured port
☐ Source code changes hot-reload without container restart

**CRM-105 — Seed**
☐ `python scripts/seed.py` runs without errors
☐ GigForge tenant exists with admin user `admin@gigforge.ai`
☐ TechUni tenant exists with admin user `admin@techuni.ai`
☐ Running seed twice produces no duplicate-key errors

**CRM-201 — JWT Auth**
☐ `POST /auth/register` → 201 with `access_token` + `refresh_token`
☐ `POST /auth/login` → 200 with tokens
☐ Wrong password → 401 (body does not say "wrong password")
☐ Access token TTL = 15 minutes (decode and verify `exp - iat`)
☐ Refresh token TTL = 7 days
☐ Stored password starts with `$2b$12$` (bcrypt cost ≥ 12)

**CRM-202 — Tenant Isolation**
☐ **Manual cross-tenant attack test:**
  ```bash
  # Get a GigForge token
  GF_TOKEN=$(curl -s -X POST /auth/login \
    -d '{"email":"admin@gigforge.ai","password":"...","tenant_slug":"gigforge"}' \
    | jq -r .access_token)

  # Get a TechUni contact ID (via TechUni token)
  TU_CONTACT_ID=$(curl -s /contacts \
    -H "Authorization: Bearer $TU_TOKEN" | jq -r '.items[0].id')

  # Attempt cross-tenant access with GigForge token
  curl -s -o /dev/null -w "%{http_code}" \
    /contacts/$TU_CONTACT_ID \
    -H "Authorization: Bearer $GF_TOKEN"
  # Must print: 404
  ```
☐ Cross-tenant attack returns 404 (not 403, not 200)
☐ PostgreSQL RLS policies present (verify via `\d contacts` in psql)

**CRM-203 — RBAC**
☐ Viewer token → `POST /contacts` → 403 with `{"detail": "Insufficient permissions"}`
☐ Admin token → `DELETE /contacts/{id}` → 204
☐ sales_rep token → `PUT /deals/{other_user_deal}` → 403

**CRM-204 — Refresh + Logout**
☐ `POST /auth/refresh` returns new token pair
☐ Old refresh token rejected after rotation → 401
☐ `POST /auth/logout` → using same token again → 401

**CRM-301 — Contacts CRUD**
☐ Full CRUD cycle manually tested (create → list → get → update → delete)
☐ Soft-deleted contact absent from list; visible with `?include_deleted=true`
☐ Pagination: `?page=1&per_page=5` returns max 5 records
☐ Response includes nested `company.name` and `tags` array

**CRM-302 — Companies CRUD**
☐ Full CRUD cycle manually tested
☐ `GET /companies/{id}/contacts` returns linked contacts
☐ Company deletion nulls `company_id` on linked contacts (contacts still exist)

**CRM-303 — Tags**
☐ Create tag, assign to contact, filter contacts by tag
☐ Duplicate tag name in same tenant → 409
☐ Assign TechUni tag to GigForge contact → 404
☐ Delete tag → removed from all associated contacts

### 6.4 OpenAPI Spec

☐ `/docs` loads without errors in browser
☐ `/openapi.json` is valid JSON
☐ All 30+ endpoints present in spec
☐ Auth endpoints documented with correct request/response schemas
☐ `securitySchemes` includes `BearerAuth`

### 6.5 Final Gate Confirmation

Before writing APPROVED:

1. ☐ `pytest` exit code = 0
2. ☐ Coverage ≥ 80%
3. ☐ Cross-tenant suite: 0 failures / 0 errors
4. ☐ Manual cross-tenant attack test: 404 returned
5. ☐ All story ACs checked off above
6. ☐ OpenAPI spec loads without errors
7. ☐ Seed script creates both tenants in isolation
8. ☐ Docker stack starts cleanly from scratch (`docker compose down -v && docker compose up`)

If any item is ☐ unchecked: **DO NOT issue APPROVED** — file a blocker with gigforge-pm.

---

## 7. Out of Scope (Sprint 1)

The following will be tested in Sprint 2:

- CRM-304 Full-text search
- CRM-305 Custom fields
- CRM-401 to CRM-404 Pipeline & Deals
- Activity, Task, Note endpoints (Epic 5)
- Webhook delivery (Epic 7)
- Frontend (Epic 8)

---

*Test plan authored by gigforge-qa — 2026-03-15*
