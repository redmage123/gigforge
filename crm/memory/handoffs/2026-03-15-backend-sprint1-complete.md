# Handoff — gigforge-dev-backend → gigforge-engineer + gigforge-qa
**Date:** 2026-03-15
**From:** gigforge-dev-backend
**To:** gigforge-engineer (PR review), gigforge-qa (coverage gate)
**Project:** CRM Platform — Sprint 1

---

## Stories Delivered

| Story | Files | Coverage |
|-------|-------|----------|
| CRM-201 — JWT auth | `core/security.py`, `services/auth_service.py`, `routers/auth.py`, `repositories/user_repo.py`, `repositories/token_repo.py` | 93–100% |
| CRM-202 — Tenant isolation | `core/dependencies.py` | 93% |
| CRM-203 — RBAC | `core/permissions.py` | 100% |
| CRM-204 — Token refresh + logout | Merged into auth_service.py + token_repo.py | 100% |
| CRM-105 — Seed script | `scripts/seed.py` | — |
| CRM-301 — Contacts CRUD | `repositories/contact_repo.py`, `routers/contacts.py`, `schemas/contact.py` | 95% |
| CRM-302 — Companies CRUD | `repositories/company_repo.py`, `routers/companies.py`, `schemas/company.py` | 87–97% |
| CRM-303 — Tags system | `repositories/tag_repo.py`, `routers/tags.py`, `schemas/tag.py` | 80–100% |

**Total: 96 tests passing, 93% coverage**

---

## New files created

```
backend/
  models/token_blacklist.py        # ADR-0002: DB-based JWT blacklist
  models/refresh_token.py          # ADR-0002: stored refresh tokens with rotation
  migrations/versions/0002_token_tables.py   # token_blacklist + refresh_tokens tables
  core/__init__.py
  core/security.py                 # hash_password, verify_password, create/decode JWT
  core/dependencies.py             # get_current_user, get_tenant_id FastAPI deps
  core/permissions.py              # require_role(*roles) factory
  routers/__init__.py
  routers/auth.py                  # POST /auth/{register,login,refresh,logout}
  routers/contacts.py              # GET/POST/PUT/PATCH/DELETE /contacts + tag ops
  routers/companies.py             # GET/POST/PUT/PATCH/DELETE /companies + /contacts
  routers/tags.py                  # GET/POST/DELETE /tags
  schemas/__init__.py
  schemas/auth.py                  # RegisterRequest, LoginRequest, TokenResponse, etc.
  schemas/contact.py               # ContactCreate, ContactUpdate, ContactResponse
  schemas/company.py               # CompanyCreate, CompanyUpdate, CompanyResponse
  schemas/tag.py                   # TagCreate, TagResponse, TagAssignRequest
  schemas/common.py                # PaginatedResponse[T]
  repositories/__init__.py
  repositories/user_repo.py        # get_by_email_and_tenant, get_by_id, create
  repositories/token_repo.py       # blacklist, refresh token CRUD
  repositories/contact_repo.py     # full CRUD + tag ops, tenant-scoped
  repositories/company_repo.py     # full CRUD + get_contacts, NULL on delete
  repositories/tag_repo.py         # CRUD + assign/remove from contact
  services/__init__.py
  services/auth_service.py         # register, login, refresh_tokens, logout
  scripts/__init__.py
  scripts/seed.py                  # idempotent: GigForge + TechUni tenants
  tests/__init__.py
  tests/conftest.py                # mock_db, sample_tenant_id, sample_user_id
  tests/unit/__init__.py
  tests/unit/test_security.py      # 15 tests: hash, JWT, decode
  tests/unit/test_auth.py          # 8 tests: register, login, refresh, logout
  tests/unit/test_tenant_isolation.py  # 8 tests: JWT deps, RBAC
  tests/unit/test_contacts.py      # 6 tests: contact repo
  tests/unit/test_companies.py     # 4 tests: company repo
  tests/unit/test_tags.py          # 6 tests: tag repo
  tests/unit/test_endpoints.py     # 22 HTTP endpoint tests
  tests/unit/test_repos.py         # 19 repo coverage tests
  tests/unit/test_coverage_gaps.py # 21 gap-closing tests
  pytest.ini
```

---

## Key implementation decisions

1. **JWT**: HS256, 15-min access with `jti` claim, 7-day refresh stored in `refresh_tokens` table — per ADR-0002
2. **Token blacklist**: DB table `token_blacklist` — per ADR-0002. Lookup in `get_current_user` on every request
3. **Tenant isolation**: app-layer `tenant_id` filter in every repo method; `get_current_user` extracts from JWT — per ADR-0003
4. **RBAC**: `require_role(*roles)` dependency factory in `core/permissions.py`; returns 403 on mismatch
5. **DAO pattern**: NO SQL in services or routes; all DB access goes through repo classes
6. **Soft deletes**: `deleted_at` timestamp; excluded from list queries by default; `?include_deleted=true` to show
7. **Company delete**: NULLs `contact.company_id` via `UPDATE` before soft-deleting company

---

## TDD summary

Every story followed RED → GREEN → REFACTOR:
- RED: tests written first and confirmed failing (import errors on missing modules)
- GREEN: implementation written to pass tests
- REFACTOR: `from __future__ import annotations` added to fix Python 3.12 annotation evaluation

---

## Waiting on

- **gigforge-engineer**: PR review — SOLID compliance, DAO pattern adherence, architecture sign-off
- **gigforge-qa**: Coverage gate confirmation (93% total, all modules ≥79%), cross-tenant isolation tests

## Run tests

```bash
cd backend
.venv/bin/python -m pytest tests/unit/ --cov=core --cov=services --cov=repositories --cov=routers -q
```
