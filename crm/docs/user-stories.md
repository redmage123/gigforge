# CRM Platform — User Stories (Epics 1–4)

**Project:** Multi-Tenant CRM Platform
**PM:** gigforge-pm
**Last Updated:** 2026-03-15
**Status:** PLANNING — awaiting schema sign-off from gigforge-engineer

---

## Story Point Scale

| Points | Effort |
|--------|--------|
| 1 | Trivial (< 1h) |
| 2 | Small (1-2h) |
| 3 | Medium (2-4h) |
| 5 | Large (4-8h) |
| 8 | XL (8-16h) |
| 13 | Epic (> 1 day) |

---

## Epic 1: Foundation

> Scaffold the project, define data models, set up the database, and create a running Docker environment.

---

### Story 1.1 — Project Scaffolding
**ID:** CRM-101
**Epic:** Foundation
**Assigned:** gigforge-dev-backend
**Points:** 3
**Priority:** P0 (blocks all stories)
**Status:** TODO

**User Story:**
> As a developer, I want a well-structured FastAPI project with clear module separation, dependency injection, config management, and a working dev server, so that the team has a solid foundation to build on.

**Acceptance Criteria:**
- [ ] FastAPI app created with uvicorn entry point
- [ ] Config loaded from `.env` via `pydantic-settings` (`BaseSettings`)
- [ ] Directory structure: `app/api/`, `app/models/`, `app/schemas/`, `app/services/`, `app/core/`
- [ ] Database session factory (`AsyncSession`) with connection pooling configured
- [ ] `GET /health` returns `{"status": "ok", "version": "0.1.0"}`
- [ ] `requirements.txt` or `pyproject.toml` with pinned dependencies
- [ ] `.env.example` documents all required variables
- [ ] App starts with `uvicorn app.main:app --reload` without errors

**Test Cases (TDD — write before implementing):**
- `test_health_check_returns_200_with_status_ok`
- `test_missing_required_env_var_raises_on_startup`
- `test_db_session_dependency_yields_and_closes`

---

### Story 1.2 — SQLAlchemy Models: Full Entity Set
**ID:** CRM-102
**Epic:** Foundation
**Assigned:** gigforge-engineer
**Points:** 8
**Priority:** P0 (blocks all data stories)
**Status:** IN PROGRESS (Tenant, User done — see `backend/models/`)

**User Story:**
> As a developer, I want SQLAlchemy 2.x mapped models for all CRM entities, so that I can write type-safe queries and generate migrations from code.

**Entities Required:**
- [x] `Tenant` — isolation root
- [x] `User` — tenant-scoped with UserRole enum
- [ ] `Contact` — person CRM record, belongs to tenant, optional company
- [ ] `Company` — organisation record, belongs to tenant
- [ ] `Tag` — many-to-many with contacts, companies, deals
- [ ] `CustomField` — JSON schema definition per tenant
- [ ] `Pipeline` — named stage sequence, belongs to tenant
- [ ] `PipelineStage` — ordered stage in a pipeline with probability %
- [ ] `Deal` — opportunity linked to contact, company, stage
- [ ] `DealStageHistory` — audit log of stage transitions
- [ ] `Activity` — call/email/meeting logged against contact/company/deal
- [ ] `Task` — assigned action item with due date and status
- [ ] `Note` — rich text note linked to any entity
- [ ] `Webhook` — registered endpoint for event delivery
- [ ] `AuditLog` — immutable record of every mutation

**Acceptance Criteria:**
- [ ] All models inherit `Base` and `TimestampMixin` from `base.py`
- [ ] Every tenant-scoped model has `tenant_id` FK with `ondelete="CASCADE"`
- [ ] `tenant_id` is indexed on every child table
- [ ] Enums defined as Python `str, Enum` classes (stored as VARCHAR)
- [ ] All relationships defined (bidirectional where needed)
- [ ] `__repr__` on every model
- [ ] Models importable from `app.models` package `__init__`

---

### Story 1.3 — Alembic Migrations: Baseline Schema
**ID:** CRM-103
**Epic:** Foundation
**Assigned:** gigforge-dev-backend
**Points:** 5
**Priority:** P0
**Status:** TODO (blocked by CRM-102)

**User Story:**
> As a DevOps engineer, I want an Alembic migration that creates the full schema from scratch, including indexes, FK constraints, and PostgreSQL RLS policies, so that any fresh database can be bootstrapped deterministically.

**Acceptance Criteria:**
- [ ] `alembic init` configured with `async` driver
- [ ] `alembic.ini` reads DB URL from env var
- [ ] Initial migration (`0001_baseline`) creates all tables in correct dependency order
- [ ] Composite unique constraint: `(tenant_id, email)` on users
- [ ] Composite unique constraint: `(tenant_id, slug)` on pipelines
- [ ] GIN index on `contacts.search_vector` for full-text search
- [ ] `alembic upgrade head` runs cleanly against a fresh PostgreSQL 16 instance
- [ ] `alembic downgrade base` removes all tables cleanly

**Test Cases:**
- `test_alembic_upgrade_head_creates_all_tables`
- `test_alembic_downgrade_base_removes_all_tables`

---

### Story 1.4 — Docker Compose: Full Dev Stack
**ID:** CRM-104
**Epic:** Foundation
**Assigned:** gigforge-devops
**Points:** 3
**Priority:** P0
**Status:** TODO

**User Story:**
> As a developer, I want a `docker-compose.yml` that starts PostgreSQL 16, the FastAPI app, and a pgAdmin instance with one command, so that I can develop locally with zero manual setup.

**Acceptance Criteria:**
- [ ] `docker-compose.yml` at project root
- [ ] Services: `db` (postgres:16), `api` (FastAPI/uvicorn), `pgadmin` (pgAdmin 4)
- [ ] `db` uses a named volume for persistence
- [ ] `api` mounts source code for hot-reload in dev mode
- [ ] Health check on `db` service; `api` depends on healthy `db`
- [ ] Environment variables sourced from `.env` file
- [ ] `docker compose up` starts all services; `GET /health` returns 200
- [ ] README section documents all `docker compose` commands
- [ ] Multi-stage `Dockerfile`: `deps` → `builder` → `runner` (non-root user in runner)

---

### Story 1.5 — Seed Data: GigForge + TechUni Tenants
**ID:** CRM-105
**Epic:** Foundation
**Assigned:** gigforge-dev-backend
**Points:** 2
**Priority:** P1
**Status:** TODO (blocked by CRM-102, CRM-103)

**User Story:**
> As a developer running the system for the first time, I want a seed script that creates the GigForge and TechUni tenants with one admin user each, so that I can immediately test multi-tenancy without manual data entry.

**Acceptance Criteria:**
- [ ] Seed script at `scripts/seed.py`
- [ ] Creates tenant `gigforge` (slug: `gigforge`) with admin user `admin@gigforge.ai`
- [ ] Creates tenant `techuni` (slug: `techuni`) with admin user `admin@techuni.ai`
- [ ] Passwords read from env vars (`GIGFORGE_ADMIN_PASSWORD`, `TECHUNI_ADMIN_PASSWORD`)
- [ ] Script is idempotent — safe to run twice without duplicating data
- [ ] `docker compose exec api python scripts/seed.py` completes without errors

---

## Epic 2: Auth & Multi-Tenancy

> Secure the API with JWT authentication, enforce strict tenant isolation on every request, and implement role-based access control.

---

### Story 2.1 — User Registration + JWT Login
**ID:** CRM-201
**Epic:** Auth & Multi-Tenancy
**Assigned:** gigforge-dev-backend
**Points:** 5
**Priority:** P0
**Status:** TODO (blocked by CRM-101, CRM-102)

**User Story:**
> As a new user, I want to register with my email and password and receive a JWT access token, so that I can authenticate subsequent API requests.

**Acceptance Criteria:**
- [ ] `POST /auth/register` creates user, hashes password with bcrypt, returns `{access_token, refresh_token, user}`
- [ ] `POST /auth/login` accepts `{email, password, tenant_slug}` — verifies credentials, returns tokens
- [ ] Access token: JWT, 15-minute TTL, signed with HS256
- [ ] Refresh token: JWT, 7-day TTL, stored in DB for rotation
- [ ] Passwords stored as bcrypt hash (cost factor ≥ 12)
- [ ] Registration requires `tenant_slug` to scope the user correctly
- [ ] Duplicate email within same tenant returns `409 Conflict`
- [ ] Wrong password returns `401 Unauthorized` (no user enumeration)

**Test Cases (TDD):**
- `test_register_new_user_returns_201_with_tokens`
- `test_register_duplicate_email_same_tenant_returns_409`
- `test_login_valid_credentials_returns_tokens`
- `test_login_wrong_password_returns_401`
- `test_login_unknown_tenant_slug_returns_401`
- `test_access_token_expires_after_15_minutes` (mock time)

---

### Story 2.2 — Tenant Isolation Middleware
**ID:** CRM-202
**Epic:** Auth & Multi-Tenancy
**Assigned:** gigforge-dev-backend
**Points:** 5
**Priority:** P0
**Status:** TODO (blocked by CRM-201)

**User Story:**
> As a system architect, I want every database query automatically scoped to the authenticated user's tenant, so that no user can ever read or write another tenant's data regardless of URL manipulation.

**Acceptance Criteria:**
- [ ] FastAPI dependency `get_current_tenant` extracts `tenant_id` from validated JWT
- [ ] All service layer methods accept `tenant_id` as a required parameter
- [ ] No route can return data from a different tenant even if a valid ID is supplied in the URL
- [ ] Cross-tenant access attempt returns `404 Not Found` (not `403`) — do not reveal existence
- [ ] Unit tests verify that injecting a different `tenant_id` cannot leak data
- [ ] PostgreSQL RLS policies applied as a secondary defence layer (belt-and-braces)

**Test Cases (TDD):**
- `test_gigforge_user_cannot_read_techuni_contact`
- `test_gigforge_user_cannot_update_techuni_deal`
- `test_cross_tenant_id_in_url_returns_404`
- `test_tenant_id_extracted_correctly_from_jwt`

---

### Story 2.3 — RBAC Permission Dependency
**ID:** CRM-203
**Epic:** Auth & Multi-Tenancy
**Assigned:** gigforge-dev-backend
**Points:** 3
**Priority:** P0
**Status:** TODO (blocked by CRM-202)

**User Story:**
> As an API designer, I want a composable FastAPI dependency that enforces role-based access, so that I can protect individual endpoints with a single decorator without duplicating permission logic.

**Role Matrix:**

| Action | admin | manager | sales_rep | viewer |
|--------|-------|---------|-----------|--------|
| Read all data | ✓ | ✓ | own only | ✓ |
| Create contacts/deals | ✓ | ✓ | ✓ | — |
| Update contacts/deals | ✓ | ✓ | own only | — |
| Delete any record | ✓ | ✓ | — | — |
| Manage users | ✓ | — | — | — |
| Manage pipelines | ✓ | ✓ | — | — |
| Manage webhooks | ✓ | — | — | — |

**Acceptance Criteria:**
- [ ] `require_role(*roles)` dependency factory usable as `Depends(require_role("admin", "manager"))`
- [ ] Insufficient role returns `403 Forbidden` with `{"detail": "Insufficient permissions"}`
- [ ] `viewer` role can `GET` all resources but cannot `POST/PUT/DELETE`
- [ ] `sales_rep` can only update records where `owner_id == current_user.id`

**Test Cases (TDD):**
- `test_viewer_cannot_create_contact_returns_403`
- `test_admin_can_delete_any_contact`
- `test_sales_rep_cannot_update_other_users_deal`
- `test_require_role_multiple_allowed_roles`

---

### Story 2.4 — Token Refresh + Logout
**ID:** CRM-204
**Epic:** Auth & Multi-Tenancy
**Assigned:** gigforge-dev-backend
**Points:** 3
**Priority:** P1
**Status:** TODO (blocked by CRM-201)

**User Story:**
> As a logged-in user, I want to refresh my access token without re-entering my password, and securely log out by invalidating my tokens, so that my session is both convenient and secure.

**Acceptance Criteria:**
- [ ] `POST /auth/refresh` accepts `{refresh_token}`, returns new `{access_token, refresh_token}`
- [ ] Old refresh token is rotated (invalidated) on each refresh
- [ ] `POST /auth/logout` blacklists the current access token until its natural expiry
- [ ] Blacklist stored in the DB (or Redis if configured)
- [ ] Blacklisted token returns `401 Unauthorized` on any subsequent request
- [ ] Expired refresh token returns `401` with `{"detail": "Refresh token expired"}`

**Test Cases (TDD):**
- `test_refresh_returns_new_tokens`
- `test_old_refresh_token_rejected_after_rotation`
- `test_logout_blacklists_access_token`
- `test_blacklisted_token_rejected_on_next_request`

---

## Epic 3: Core CRM

> The bread-and-butter CRM operations: contacts, companies, tags, search, and custom fields.

---

### Story 3.1 — Contacts CRUD API
**ID:** CRM-301
**Epic:** Core CRM
**Assigned:** gigforge-dev-backend
**Points:** 5
**Priority:** P0
**Status:** TODO (blocked by CRM-202, CRM-203)

**User Story:**
> As a sales rep, I want to create, view, update, and delete contact records — each scoped to my tenant — so that I can manage my prospect and customer list.

**Endpoints:**
- `POST /contacts` — create
- `GET /contacts` — list (paginated, filterable)
- `GET /contacts/{id}` — detail
- `PUT /contacts/{id}` — full update
- `PATCH /contacts/{id}` — partial update
- `DELETE /contacts/{id}` — soft delete (sets `deleted_at`)

**Acceptance Criteria:**
- [ ] All endpoints require valid JWT; all queries scoped to `tenant_id`
- [ ] `POST` validates required fields: `first_name`, `last_name`, `email`
- [ ] `GET /contacts` supports: `page`, `per_page` (default 20, max 100), `sort_by`, `order`
- [ ] Filter params: `company_id`, `tag_ids`, `owner_id`, `created_after`, `created_before`
- [ ] Response includes nested company name and tag list
- [ ] Soft delete: record hidden from list by default; `?include_deleted=true` shows it
- [ ] `PUT` on non-existent contact returns `404`; cross-tenant contact returns `404`

**Test Cases (TDD):**
- `test_create_contact_returns_201_with_id`
- `test_create_contact_missing_email_returns_422`
- `test_list_contacts_pagination_works`
- `test_list_contacts_scoped_to_tenant`
- `test_update_contact_returns_200`
- `test_delete_contact_soft_deletes`
- `test_cross_tenant_contact_id_returns_404`

---

### Story 3.2 — Companies CRUD API
**ID:** CRM-302
**Epic:** Core CRM
**Assigned:** gigforge-dev-backend
**Points:** 3
**Priority:** P1
**Status:** TODO (blocked by CRM-202)

**User Story:**
> As a sales rep, I want to manage company records and link contacts to companies, so that I can track relationships at the organisational level.

**Endpoints:** same CRUD pattern as contacts (`/companies`)

**Acceptance Criteria:**
- [ ] Required fields: `name`
- [ ] Optional: `domain`, `industry`, `size`, `website`, `phone`, `address`, `custom_fields`
- [ ] `GET /companies/{id}/contacts` returns all contacts at this company (paginated)
- [ ] Deleting a company NULLs `company_id` on associated contacts (no orphan cascade delete)

**Test Cases (TDD):**
- `test_create_company_returns_201`
- `test_get_company_contacts_returns_associated_records`
- `test_delete_company_nulls_contact_company_id`

---

### Story 3.3 — Tags System
**ID:** CRM-303
**Epic:** Core CRM
**Assigned:** gigforge-dev-backend
**Points:** 3
**Priority:** P1
**Status:** TODO (blocked by CRM-202)

**User Story:**
> As a manager, I want to create tags and apply them to contacts, companies, and deals, so that I can segment and filter records by custom categories.

**Endpoints:**
- `GET /tags` — list tenant's tags
- `POST /tags` — create tag
- `DELETE /tags/{id}` — delete (removes from all associated records)
- `POST /contacts/{id}/tags` — `{tag_ids: [...]}`
- `DELETE /contacts/{id}/tags/{tag_id}`
- (Same pattern for companies and deals)

**Acceptance Criteria:**
- [ ] Tags are tenant-scoped; unique by `(tenant_id, name)` (case-insensitive)
- [ ] Assigning non-existent tag returns `404`
- [ ] Assigning cross-tenant tag returns `404`
- [ ] `GET /contacts?tag_ids=uuid1,uuid2` filters by tag (AND logic)

---

### Story 3.4 — Full-Text Search
**ID:** CRM-304
**Epic:** Core CRM
**Assigned:** gigforge-dev-backend
**Points:** 5
**Priority:** P1
**Status:** TODO (blocked by CRM-103, CRM-301, CRM-302)

**User Story:**
> As a sales rep, I want to search across contacts and companies by name, email, phone, or company name, so that I can find records quickly without knowing which field to filter.

**Endpoint:** `GET /search?q=<term>&types=contacts,companies&page=1&per_page=20`

**Acceptance Criteria:**
- [ ] PostgreSQL `tsvector` on contacts: `first_name || last_name || email || phone`
- [ ] PostgreSQL `tsvector` on companies: `name || domain || industry`
- [ ] GIN index on both `search_vector` columns
- [ ] Search results scoped to tenant; sorted by relevance (`ts_rank`)
- [ ] Response: `{contacts: [...], companies: [...], total: N}`
- [ ] Partial-word matches supported via `:*` prefix search
- [ ] Empty query returns `400 Bad Request`

---

### Story 3.5 — Custom Fields
**ID:** CRM-305
**Epic:** Core CRM
**Assigned:** gigforge-dev-backend
**Points:** 5
**Priority:** P2
**Status:** TODO (blocked by CRM-301)

**User Story:**
> As an admin, I want to define custom fields for contacts specific to my tenant (e.g., "Lead Source", "NPS Score"), so that we can extend the CRM without database migrations.

**Acceptance Criteria:**
- [ ] `POST /custom-fields` — define a field: `{name, entity_type, field_type, required, options}`
- [ ] `field_type` values: `text`, `number`, `boolean`, `date`, `select`, `multi_select`
- [ ] Custom field values stored as JSONB on the contact/company record
- [ ] `POST /contacts` validates custom field values against schema definition
- [ ] `required: true` custom fields enforced on create
- [ ] `GET /contacts` includes `custom_fields` in response

---

## Epic 4: Pipeline & Deals

> Manage sales pipelines, move deals through stages, and track weighted revenue.

---

### Story 4.1 — Pipeline + Stage CRUD
**ID:** CRM-401
**Epic:** Pipeline & Deals
**Assigned:** gigforge-dev-backend
**Points:** 3
**Priority:** P0
**Status:** TODO (blocked by CRM-202)

**User Story:**
> As an admin, I want to create named pipelines with ordered stages, so that deals can progress through a structured sales process.

**Endpoints:**
- `POST /pipelines` — `{name, stages: [{name, order, probability_pct, is_won, is_lost}]}`
- `GET /pipelines` — list with stages embedded
- `PUT /pipelines/{id}` — update name and stages
- `DELETE /pipelines/{id}` — soft delete (cannot delete if active deals exist)

**Acceptance Criteria:**
- [ ] At least one pipeline exists per tenant (enforced by seed script)
- [ ] Each stage has: `name`, `order` (integer, unique per pipeline), `probability_pct` (0-100), `is_won` (bool), `is_lost` (bool)
- [ ] Exactly one stage per pipeline may be `is_won=true`; exactly one may be `is_lost=true`
- [ ] Reordering stages accepted via PUT with full stage array
- [ ] Deleting pipeline with active deals returns `409 Conflict`

---

### Story 4.2 — Deals CRUD
**ID:** CRM-402
**Epic:** Pipeline & Deals
**Assigned:** gigforge-dev-backend
**Points:** 5
**Priority:** P0
**Status:** TODO (blocked by CRM-301, CRM-401)

**User Story:**
> As a sales rep, I want to create deal records linked to a contact, company, and pipeline stage, so that I can track sales opportunities through my pipeline.

**Endpoints:** CRUD at `/deals`

**Acceptance Criteria:**
- [ ] Required fields: `title`, `pipeline_id`, `stage_id`, `contact_id`
- [ ] Optional: `company_id`, `value`, `currency`, `expected_close_date`, `owner_id`
- [ ] `GET /deals` supports filtering by: `pipeline_id`, `stage_id`, `owner_id`, `tag_ids`, `min_value`, `max_value`
- [ ] Response includes: stage name, contact name, company name, weighted value (`value * probability_pct / 100`)
- [ ] `sales_rep` can only see deals where `owner_id == current_user.id` (RBAC)

---

### Story 4.3 — Stage Progression
**ID:** CRM-403
**Epic:** Pipeline & Deals
**Assigned:** gigforge-dev-backend
**Points:** 3
**Priority:** P1
**Status:** TODO (blocked by CRM-402)

**User Story:**
> As a sales rep, I want to move a deal to a different stage and have that transition recorded, so that I can track the deal's history and understand where it got stuck.

**Endpoint:** `PATCH /deals/{id}/stage` — `{stage_id, note?}`

**Acceptance Criteria:**
- [ ] Stage must belong to the same pipeline as the deal
- [ ] Moving to `is_won` stage sets `deal.closed_at = now()`, `deal.is_won = true`
- [ ] Moving to `is_lost` stage sets `deal.closed_at = now()`, `deal.is_lost = true`
- [ ] Each transition creates a `DealStageHistory` record: `from_stage_id`, `to_stage_id`, `moved_by`, `moved_at`, `note`
- [ ] `GET /deals/{id}/history` returns all stage transitions chronologically

---

### Story 4.4 — Pipeline Value & Probability
**ID:** CRM-404
**Epic:** Pipeline & Deals
**Assigned:** gigforge-dev-backend
**Points:** 3
**Priority:** P1
**Status:** TODO (blocked by CRM-402)

**User Story:**
> As a manager, I want to see pipeline totals grouped by stage with weighted values, so that I can forecast revenue accurately.

**Endpoint:** `GET /pipelines/{id}/summary`

**Response:**
```json
{
  "pipeline_id": "...",
  "name": "...",
  "stages": [
    {
      "stage_id": "...",
      "name": "...",
      "deal_count": 12,
      "total_value": 48000.00,
      "weighted_value": 19200.00,
      "probability_pct": 40
    }
  ],
  "totals": {
    "open_deals": 34,
    "total_value": 120000.00,
    "weighted_value": 52400.00
  }
}
```

**Acceptance Criteria:**
- [ ] All monetary values in the deal's `currency`; response includes `currency`
- [ ] Closed (won/lost) deals excluded from open totals but available with `?include_closed=true`
- [ ] Endpoint scoped to tenant; cross-tenant pipeline ID returns `404`

---

## Story Point Summary

| Epic | Stories | Points | Sprint Target |
|------|---------|--------|---------------|
| Epic 1: Foundation | CRM-101 to 105 | 21 | Sprint 1 |
| Epic 2: Auth & Multi-Tenancy | CRM-201 to 204 | 16 | Sprint 1 |
| Epic 3: Core CRM (partial) | CRM-301 to 303 | 11 | Sprint 1 |
| Epic 3: Core CRM (remaining) | CRM-304 to 305 | 10 | Sprint 2 |
| Epic 4: Pipeline & Deals | CRM-401 to 404 | 14 | Sprint 2 |

**Sprint 1 Total: 48 points**
**Sprint 2 Total: 24 points** (Epics 3 remainder + Epic 4)
