# CRM Sprint 1 — Test Plan

**Author:** gigforge-qa
**Sprint:** 1 (2026-03-15 → 2026-03-22)
**Written:** 2026-03-15 (before implementation — TDD-first)
**Stories covered:** CRM-101, CRM-102, CRM-103, CRM-104, CRM-105, CRM-201, CRM-202, CRM-203, CRM-204, CRM-301, CRM-302, CRM-303

---

## 1. Test Strategy

### 1.1 Test Pyramid

```
             ┌─────────────┐
             │  Acceptance  │  ← Docker stack, manual + scripted (Days 7–8)
             ├─────────────┤
             │ Integration  │  ← Real PostgreSQL 16 via test DB container
             ├─────────────┤
             │    Unit      │  ← Mocked dependencies, fast, isolated
             └─────────────┘
```

| Layer | Tool | DB | Speed | When Run |
|-------|------|----|-------|----------|
| Unit | `pytest` + `unittest.mock` | Mocked | < 5s per file | Every PR |
| Integration | `pytest` + `pytest-asyncio` | Real test DB | < 60s total | Every PR |
| Acceptance | Docker stack + `pytest` + manual | Full stack | < 120s | Sprint end (Day 7–8) |

### 1.2 Coverage Gate

- **Minimum:** 80% line coverage enforced by `pytest-cov --fail-under=80`
- **Command:** `docker compose exec api pytest --cov=app --cov-fail-under=80 --cov-report=term-missing`
- Coverage measured per story as it lands; do not defer to end-of-sprint.

### 1.3 Test Organisation

```
backend/
  tests/
    unit/
      test_auth_service.py       # CRM-201, CRM-204
      test_tenant_middleware.py  # CRM-202
      test_rbac.py               # CRM-203
      test_contacts_service.py   # CRM-301
      test_companies_service.py  # CRM-302
      test_tags_service.py       # CRM-303
      test_health.py             # CRM-101
    integration/
      test_auth_integration.py   # CRM-201, CRM-204
      test_tenant_isolation.py   # CRM-202 — CRITICAL
      test_rbac_integration.py   # CRM-203
      test_contacts_integration.py  # CRM-301
      test_companies_integration.py # CRM-302
      test_tags_integration.py      # CRM-303
      test_migrations.py            # CRM-103
      test_seed.py                  # CRM-105
    acceptance/
      test_docker_stack.py          # CRM-104
      test_cross_tenant_attack.py   # CRM-202 — end-to-end adversarial
    conftest.py                     # fixtures: test DB, async client, tenant tokens
```

### 1.4 Test Database Setup

- Separate PostgreSQL 16 test database: `crm_test`
- Schema created via `alembic upgrade head` in `conftest.py` session fixture
- Each test function gets a clean transaction rolled back after (no data bleed)
- Two test tenants pre-seeded: `gigforge` (tenant_id: fixed UUID-A) + `techuni` (tenant_id: fixed UUID-B)

---

## 2. Cross-Tenant Isolation Suite (CRITICAL — Write First)

These tests represent the highest-risk failure mode. Write stubs before any CRUD implementation.

**File:** `tests/integration/test_tenant_isolation.py`

### 2.1 Required Test Stubs

```python
# Contacts
test_gigforge_user_cannot_list_techuni_contacts
test_gigforge_user_cannot_get_techuni_contact_by_id
test_gigforge_user_cannot_update_techuni_contact
test_gigforge_user_cannot_delete_techuni_contact
test_cross_tenant_contact_id_in_url_returns_404

# Companies
test_cross_tenant_company_id_in_url_returns_404

# Tags
test_cross_tenant_tag_assignment_returns_404
test_gigforge_user_cannot_list_techuni_tags
```

### 2.2 Test Logic Pattern

Each cross-tenant test follows this invariant:

1. Create resource R belonging to tenant **TechUni**
2. Authenticate as a **GigForge** user (valid JWT, different `tenant_id`)
3. Attempt to access/modify R using R's real UUID in the URL
4. **Assert:** HTTP 404 (not 403 — do not reveal existence)
5. **Assert:** Response body does NOT contain TechUni data

### 2.3 Test Case Detail

| Test ID | Method | URL Pattern | Expected | Notes |
|---------|--------|-------------|----------|-------|
| CT-01 | GET | `/contacts` | 200 — empty list | GigForge list must not bleed TechUni contacts |
| CT-02 | GET | `/contacts/{techuni_contact_id}` | 404 | Valid UUID, wrong tenant |
| CT-03 | PUT | `/contacts/{techuni_contact_id}` | 404 | Must not update |
| CT-04 | PATCH | `/contacts/{techuni_contact_id}` | 404 | Must not partial-update |
| CT-05 | DELETE | `/contacts/{techuni_contact_id}` | 404 | Must not soft-delete |
| CT-06 | GET | `/companies/{techuni_company_id}` | 404 | Company isolation |
| CT-07 | POST | `/contacts/{gigforge_contact_id}/tags` with `techuni_tag_id` | 404 | Cross-tenant tag assign |
| CT-08 | GET | `/tags` | 200 — only gigforge tags | Tag list isolation |

---

## 3. Security Tests

**File:** `tests/unit/test_auth_service.py`, `tests/integration/test_auth_integration.py`

### 3.1 Authentication Attack Vectors

| Test ID | Scenario | Expected |
|---------|----------|----------|
| SEC-01 | `test_login_wrong_password_returns_401` | 401 — generic message, no user enumeration |
| SEC-02 | `test_login_unknown_email_returns_401` | 401 — same message as wrong password |
| SEC-03 | `test_login_unknown_tenant_slug_returns_401` | 401 |
| SEC-04 | `test_access_token_expires_after_15_minutes` | 401 after mock-time advance |
| SEC-05 | `test_expired_token_rejected_on_all_endpoints` | 401 on `/contacts`, `/companies`, `/tags` |
| SEC-06 | `test_missing_authorization_header_returns_401` | 401 — no bearer token |
| SEC-07 | `test_malformed_bearer_token_returns_401` | 401 — not a valid JWT |
| SEC-08 | `test_jwt_signed_with_wrong_secret_returns_401` | 401 — signature invalid |
| SEC-09 | `test_blacklisted_token_rejected_on_next_request` | 401 after logout |
| SEC-10 | `test_refresh_token_rotation_invalidates_old_token` | 401 — old refresh token rejected |
| SEC-11 | `test_expired_refresh_token_returns_401` | 401 with `"Refresh token expired"` |
| SEC-12 | `test_password_stored_as_bcrypt_hash` | DB `password_hash` starts with `$2b$` |

### 3.2 RBAC Attack Vectors

| Test ID | Scenario | Expected |
|---------|----------|----------|
| RBAC-01 | `test_viewer_cannot_create_contact_returns_403` | 403 `"Insufficient permissions"` |
| RBAC-02 | `test_viewer_cannot_update_contact_returns_403` | 403 |
| RBAC-03 | `test_viewer_cannot_delete_contact_returns_403` | 403 |
| RBAC-04 | `test_sales_rep_cannot_update_other_users_deal` | 403 |
| RBAC-05 | `test_sales_rep_can_update_own_deal` | 200 |
| RBAC-06 | `test_admin_can_delete_any_contact` | 200/204 |
| RBAC-07 | `test_manager_can_delete_any_contact` | 200/204 |
| RBAC-08 | `test_require_role_multiple_allowed_roles` | 200 for each allowed role |

---

## 4. Test Cases Per Story

### CRM-101 — Project Scaffolding

**Unit tests (`tests/unit/test_health.py`):**

| Test | Verifies |
|------|----------|
| `test_health_check_returns_200_with_status_ok` | GET /health → `{"status": "ok", "version": "0.1.0"}` |
| `test_missing_required_env_var_raises_on_startup` | Pydantic-settings raises `ValidationError` on missing required env var |
| `test_db_session_dependency_yields_and_closes` | `AsyncSession` yielded and closed cleanly; no connection leak |

---

### CRM-102 — SQLAlchemy Models

**Unit tests (`tests/unit/test_models.py`):**

| Test | Verifies |
|------|----------|
| `test_all_models_importable_from_app_models` | `from app.models import Contact, Company, Tag, Deal, ...` — no ImportError |
| `test_tenant_scoped_models_have_tenant_id_fk` | Inspect `__table__.c` — `tenant_id` column with FK to `tenants.id` |
| `test_timestamp_mixin_on_all_models` | `created_at`, `updated_at` columns present |
| `test_all_models_have_repr` | `repr(instance)` returns non-empty string |
| `test_user_role_enum_values` | UserRole has `admin`, `manager`, `sales_rep`, `viewer` |

---

### CRM-103 — Alembic Migrations

**Integration tests (`tests/integration/test_migrations.py`):**

| Test | Verifies |
|------|----------|
| `test_alembic_upgrade_head_creates_all_tables` | Run upgrade head; all expected tables exist in pg_tables |
| `test_alembic_downgrade_base_removes_all_tables` | Run downgrade base; no CRM tables remain |
| `test_composite_unique_constraint_tenant_email_on_users` | Insert duplicate (tenant_id, email) → `IntegrityError` |
| `test_composite_unique_constraint_tenant_slug_on_pipelines` | Insert duplicate (tenant_id, slug) → `IntegrityError` |
| `test_gin_index_on_contacts_search_vector` | `pg_indexes` contains GIN index on `contacts.search_vector` |
| `test_tenant_id_indexed_on_all_child_tables` | `pg_indexes` confirms `tenant_id` index on contacts, companies, deals, tags |

---

### CRM-104 — Docker Compose Stack

**Acceptance tests (`tests/acceptance/test_docker_stack.py`):**

| Test | Verifies |
|------|----------|
| `test_docker_health_endpoint_returns_200` | `GET http://localhost:8000/health` → 200 from running stack |
| `test_openapi_spec_loads_without_errors` | `GET /docs` → 200; `GET /openapi.json` → valid JSON |
| `test_pgadmin_service_reachable` | pgAdmin port responds (HTTP) |
| `test_hot_reload_not_active_in_runner_stage` | `Dockerfile` runner stage does not use `--reload` flag |

---

### CRM-105 — Seed Script

**Integration tests (`tests/integration/test_seed.py`):**

| Test | Verifies |
|------|----------|
| `test_seed_creates_gigforge_tenant` | `tenants` table has row with `slug="gigforge"` |
| `test_seed_creates_techuni_tenant` | `tenants` table has row with `slug="techuni"` |
| `test_seed_creates_gigforge_admin_user` | `users` table has `admin@gigforge.ai`, role=admin |
| `test_seed_creates_techuni_admin_user` | `users` table has `admin@techuni.ai`, role=admin |
| `test_seed_is_idempotent` | Run seed twice → no `IntegrityError`, no duplicate rows |
| `test_gigforge_admin_password_is_hashed` | `password_hash` starts with `$2b$`; raw password not stored |

---

### CRM-201 — JWT Auth (Register + Login)

**Unit tests (`tests/unit/test_auth_service.py`):**

| Test | Verifies |
|------|----------|
| `test_register_new_user_returns_201_with_tokens` | 201, body has `access_token`, `refresh_token`, `user.id` |
| `test_register_duplicate_email_same_tenant_returns_409` | 409 Conflict |
| `test_register_duplicate_email_different_tenant_succeeds` | 201 — same email allowed across tenants |
| `test_login_valid_credentials_returns_tokens` | 200, valid JWT in response |
| `test_login_wrong_password_returns_401` | 401, generic message |
| `test_login_unknown_tenant_slug_returns_401` | 401 |
| `test_access_token_expires_after_15_minutes` | Token invalid after mock-time + 16min |
| `test_access_token_payload_contains_tenant_id` | JWT decode → `tenant_id` claim present |
| `test_password_stored_as_bcrypt_hash_not_plaintext` | DB column is bcrypt hash |

**Integration tests (`tests/integration/test_auth_integration.py`):**

| Test | Verifies |
|------|----------|
| `test_register_and_login_full_flow` | Register → login → access protected endpoint → 200 |
| `test_invalid_token_on_protected_endpoint_returns_401` | Tampered JWT → 401 |

---

### CRM-202 — Tenant Isolation Middleware

**Unit tests (`tests/unit/test_tenant_middleware.py`):**

| Test | Verifies |
|------|----------|
| `test_tenant_id_extracted_correctly_from_jwt` | `get_current_tenant(token)` returns correct `tenant_id` |
| `test_missing_tenant_id_in_jwt_raises_401` | Malformed JWT without tenant claim → 401 |

**Integration tests (`tests/integration/test_tenant_isolation.py`):**

| Test | Verifies |
|------|----------|
| `test_gigforge_user_cannot_list_techuni_contacts` | GigForge JWT → GET /contacts → 200 empty (not TechUni records) |
| `test_gigforge_user_cannot_get_techuni_contact_by_id` | Valid TechUni contact UUID → 404 |
| `test_gigforge_user_cannot_update_techuni_contact` | PUT with TechUni contact UUID → 404 |
| `test_gigforge_user_cannot_delete_techuni_contact` | DELETE with TechUni contact UUID → 404 |
| `test_cross_tenant_contact_id_in_url_returns_404` | Generic URL manipulation test |
| `test_cross_tenant_company_id_in_url_returns_404` | Company isolation |
| `test_cross_tenant_tag_assignment_returns_404` | Assign TechUni tag to GigForge contact → 404 |
| `test_gigforge_user_cannot_read_techuni_contact` | Same as CT-02 (alias per PM spec) |
| `test_gigforge_user_cannot_update_techuni_deal` | PUT /deals/{techuni_deal_id} → 404 |
| `test_cross_tenant_id_in_url_returns_404` | Generic (alias per PM spec) |

---

### CRM-203 — RBAC Permission Dependency

**Unit tests (`tests/unit/test_rbac.py`):**

| Test | Verifies |
|------|----------|
| `test_require_role_factory_returns_dependency` | `require_role("admin")` is callable |
| `test_require_role_passes_for_correct_role` | No exception raised |
| `test_require_role_raises_403_for_wrong_role` | `HTTPException(403)` |
| `test_require_role_multiple_allowed_roles` | Any of the allowed roles passes |
| `test_viewer_cannot_create_contact_returns_403` | POST /contacts with viewer token → 403 |
| `test_viewer_cannot_update_contact_returns_403` | PUT /contacts/{id} with viewer token → 403 |
| `test_viewer_cannot_delete_contact_returns_403` | DELETE /contacts/{id} with viewer token → 403 |
| `test_admin_can_delete_any_contact` | DELETE with admin token → 200/204 |
| `test_sales_rep_cannot_update_other_users_deal` | PATCH /deals/{other_user_deal} with sales_rep → 403 |
| `test_sales_rep_can_update_own_deal` | PATCH /deals/{own_deal} with sales_rep → 200 |

---

### CRM-204 — Token Refresh + Logout

**Unit tests (`tests/unit/test_auth_service.py`):**

| Test | Verifies |
|------|----------|
| `test_refresh_returns_new_tokens` | POST /auth/refresh → new `access_token` + `refresh_token` |
| `test_old_refresh_token_rejected_after_rotation` | Reuse old refresh token → 401 |
| `test_logout_blacklists_access_token` | POST /auth/logout → access token recorded in blacklist |
| `test_blacklisted_token_rejected_on_next_request` | Use blacklisted token → 401 |
| `test_expired_refresh_token_returns_401` | 401 with `"Refresh token expired"` |
| `test_refresh_token_rotation_invalidates_old_token` | Same as `test_old_refresh_token_rejected_after_rotation` (PM alias) |

---

### CRM-301 — Contacts CRUD API

**Unit tests (`tests/unit/test_contacts_service.py`):**

| Test | Verifies |
|------|----------|
| `test_create_contact_returns_201_with_id` | POST /contacts → 201, `id` UUID present |
| `test_create_contact_missing_email_returns_422` | POST without email → 422 Unprocessable |
| `test_create_contact_missing_first_name_returns_422` | POST without first_name → 422 |
| `test_list_contacts_pagination_works` | `page=2&per_page=5` returns correct slice |
| `test_list_contacts_per_page_max_100` | `per_page=200` clamped/rejected |
| `test_list_contacts_scoped_to_tenant` | Only contacts with matching `tenant_id` returned |
| `test_list_contacts_filter_by_company_id` | Only contacts at that company returned |
| `test_list_contacts_filter_by_tag_ids` | AND logic across multiple tags |
| `test_update_contact_returns_200` | PUT /contacts/{id} → 200 with updated fields |
| `test_patch_contact_partial_update` | PATCH → only specified fields updated |
| `test_delete_contact_soft_deletes` | DELETE sets `deleted_at`; record hidden from default list |
| `test_deleted_contact_visible_with_include_deleted_flag` | `?include_deleted=true` shows soft-deleted record |
| `test_cross_tenant_contact_id_returns_404` | Valid UUID from other tenant → 404 |
| `test_update_nonexistent_contact_returns_404` | PUT /contacts/{random_uuid} → 404 |
| `test_list_contacts_response_includes_company_name` | Nested `company.name` in response |
| `test_list_contacts_response_includes_tags` | `tags: [{id, name}]` in response |

---

### CRM-302 — Companies CRUD API

**Unit tests (`tests/unit/test_companies_service.py`):**

| Test | Verifies |
|------|----------|
| `test_create_company_returns_201` | POST /companies → 201 with `id` |
| `test_create_company_missing_name_returns_422` | Required field enforcement |
| `test_get_company_contacts_returns_associated_records` | GET /companies/{id}/contacts → paginated contact list |
| `test_get_company_contacts_scoped_to_tenant` | Cross-tenant company → 404 |
| `test_delete_company_nulls_contact_company_id` | DELETE company → contacts.company_id set to NULL |
| `test_delete_company_does_not_delete_contacts` | Contacts remain; only FK NULLed |
| `test_cross_tenant_company_returns_404` | Valid UUID from other tenant → 404 |

---

### CRM-303 — Tags System

**Unit tests (`tests/unit/test_tags_service.py`):**

| Test | Verifies |
|------|----------|
| `test_create_tag_returns_201` | POST /tags → 201 with `id`, `name` |
| `test_create_duplicate_tag_name_same_tenant_returns_409` | Unique (tenant_id, name) constraint |
| `test_create_same_tag_name_different_tenant_succeeds` | Cross-tenant name uniqueness not enforced |
| `test_tag_name_comparison_is_case_insensitive` | "VIP" and "vip" treated as duplicate |
| `test_list_tags_returns_only_tenant_tags` | Isolation enforced on GET /tags |
| `test_assign_tag_to_contact` | POST /contacts/{id}/tags → 200, tag in contact response |
| `test_assign_nonexistent_tag_returns_404` | Unknown tag_id → 404 |
| `test_assign_cross_tenant_tag_returns_404` | TechUni tag_id used by GigForge user → 404 |
| `test_remove_tag_from_contact` | DELETE /contacts/{id}/tags/{tag_id} → 200/204 |
| `test_delete_tag_removes_from_all_associations` | DELETE /tags/{id} → removed from contacts, companies, deals |
| `test_filter_contacts_by_tag_ids_and_logic` | `?tag_ids=a,b` → contacts must have BOTH tags |
| `test_filter_contacts_by_single_tag` | `?tag_ids=a` → contacts with tag a |

---

## 5. Sprint-End Acceptance Checklist

Run on Day 7–8 against the full Docker stack (`docker compose up`).

### 5.1 Pre-Flight

- [ ] `docker compose up --build` starts cleanly with no errors
- [ ] `docker compose exec api alembic upgrade head` runs without errors on fresh DB
- [ ] `docker compose exec api python scripts/seed.py` creates both tenants without errors
- [ ] `docker compose exec api python scripts/seed.py` (run again) — no `IntegrityError`, idempotent

### 5.2 Automated Test Gate

```bash
docker compose exec api pytest \
  --cov=app \
  --cov-fail-under=80 \
  --cov-report=term-missing \
  -v \
  2>&1 | tee /tmp/crm-sprint1-test-results.txt
```

- [ ] Exit code 0 (all tests pass)
- [ ] Coverage ≥ 80% reported
- [ ] 0 failures, 0 errors (warnings OK if explained)

### 5.3 Cross-Tenant Attack Verification

Run against live stack:

```bash
docker compose exec api pytest tests/integration/test_tenant_isolation.py \
  tests/acceptance/test_cross_tenant_attack.py -v
```

- [ ] All cross-tenant tests pass (0 failures)
- [ ] No 200 response returned for any cross-tenant resource access
- [ ] No 403 response — must be 404 (do not reveal existence)

### 5.4 Manual AC Verification

**Auth:**
- [ ] `POST /auth/register` → 201 with `access_token`, `refresh_token`
- [ ] `POST /auth/login` → 200 with tokens
- [ ] `POST /auth/refresh` → new token pair; old refresh token → 401
- [ ] `POST /auth/logout` → access token rejected on next call

**Tenant Isolation:**
- [ ] Login as `admin@gigforge.ai`; GET `/contacts` → cannot see TechUni contacts
- [ ] Take a known TechUni contact UUID; GET `/contacts/{uuid}` as GigForge user → 404

**RBAC:**
- [ ] Register viewer-role user; POST `/contacts` → 403 `"Insufficient permissions"`
- [ ] Same viewer; GET `/contacts` → 200 (read allowed)

**Contacts:**
- [ ] Create, list, update, soft-delete, restore flow works end-to-end
- [ ] `GET /contacts?include_deleted=true` shows soft-deleted records
- [ ] Pagination: `?page=1&per_page=5` returns ≤ 5 results; `?page=2` returns next batch

**Companies:**
- [ ] Create company; create contact linked to it; GET `/companies/{id}/contacts` → lists that contact
- [ ] Delete company; check contact still exists, `company_id` is null

**Tags:**
- [ ] Create tag; assign to contact; GET `/contacts/{id}` → tag in response
- [ ] Filter `GET /contacts?tag_ids={id}` → only tagged contacts returned
- [ ] Delete tag → removed from contact response

**OpenAPI:**
- [ ] `GET /docs` → Swagger UI loads without JS errors
- [ ] `GET /openapi.json` → valid JSON, all endpoints listed

### 5.5 Verdict

**APPROVED** if all of the following are true:
1. `pytest --cov-fail-under=80` exits 0
2. Cross-tenant isolation suite: 0 failures
3. All ACs in user-stories.md checked off
4. `/docs` OpenAPI spec loads without errors
5. Seed script idempotent (runs twice cleanly)
6. Attempted cross-tenant attack returns 404 (not 200, not 403)

**REJECTED** (blockers, must fix before delivery):
- Any cross-tenant test fails
- Coverage < 80%
- Any `POST /auth` endpoint returns 500
- OpenAPI spec fails to load

**CONDITIONAL** (fix within 24h, re-test):
- Individual non-security test failures
- Missing optional AC (documented with issue)

---

## 6. Key Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Cross-tenant isolation bug ships | Critical | Write isolation tests first; run on every PR |
| Coverage < 80% discovered at sprint end | High | gigforge-dev-backend checks coverage after each story merge |
| Async SQLAlchemy session leak in tests | Medium | `conftest.py` uses rollback-per-test fixture |
| Blacklist TTL mismatch (access token) | Medium | Unit test mocks time; integration test confirms 401 |
| Docker stack test DB state bleed | Medium | Each integration test gets fresh transaction rolled back |

---

## 7. Dependencies & Coordination

| Blocker | Needed For | Status |
|---------|-----------|--------|
| CRM-102 models merged | CRM-103, CRM-201+ | IN PROGRESS (gigforge-engineer) |
| CRM-101 scaffold merged | CRM-201 unit tests runnable | READY |
| CRM-201 merged | CRM-202, CRM-204 integration tests | READY |
| Docker stack (CRM-104) | Acceptance test execution | DONE |

QA can write all unit test stubs immediately. Integration test execution unblocks when each story's PR is merged. Full acceptance run on Day 7 (2026-03-21).

---

*Test plan v1.0 — gigforge-qa — 2026-03-15*
