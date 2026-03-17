# Epic 2: Auth & Multi-Tenancy

**ID:** Epic-2
**Project:** Multi-Tenant CRM Platform
**Status:** READY (blocked by Epic 1 completion)
**Sprint Target:** Sprint 1
**Story Points:** 16
**PM:** gigforge-pm
**Lead:** gigforge-dev-backend

---

## Goal

Secure the API with JWT authentication, enforce strict tenant isolation on every request, and implement role-based access control so that no user can ever access another tenant's data.

---

## Stories

| ID | Title | Points | Owner | Status |
|----|-------|--------|-------|--------|
| CRM-201 | JWT Auth (register + login) | 8 | gigforge-dev-backend | READY |
| CRM-202 | Tenant Isolation Middleware | 5 | gigforge-dev-backend | READY (blocked by CRM-201) |
| CRM-203 | RBAC Permission Dependency | 3 | gigforge-dev-backend | READY (blocked by CRM-202) |
| CRM-204 | Token Refresh + Logout | 3 | gigforge-dev-backend | READY (blocked by CRM-201) |

---

## Acceptance Criteria (Epic Level)

- [ ] `POST /api/auth/register` and `POST /api/auth/login` issue signed JWTs
- [ ] Every authenticated route requires a valid `Authorization: Bearer <token>` header
- [ ] JWT payload includes `sub`, `org_id`, `role`, `is_agent`, `exp`, `jti`
- [ ] All database queries automatically scoped to `org_id` from the JWT — no bypass possible
- [ ] Cross-tenant access attempt returns `404` (existence not revealed)
- [ ] Role matrix enforced: admin / manager / agent / viewer
- [ ] Token refresh rotates the refresh token; logout blacklists the access token
- [ ] Cross-tenant isolation verified by automated test suite (`tests/test_tenant_isolation.py`)

---

## Role Matrix

| Action | admin | manager | agent | viewer |
|--------|-------|---------|-------|--------|
| Read all data | ✓ | ✓ | own only | ✓ |
| Create contacts/deals | ✓ | ✓ | ✓ | — |
| Update contacts/deals | ✓ | ✓ | own only | — |
| Delete any record | ✓ | ✓ | — | — |
| Manage users | ✓ | — | — | — |
| Manage pipelines | ✓ | ✓ | — | — |
| Manage webhooks | ✓ | — | — | — |

---

## Key ADRs

- **ADR-002** — Authentication strategy (JWT HS256, 15-min access / 7-day refresh)
- **ADR-001** — Multi-tenant strategy (row-level isolation with PostgreSQL RLS)

---

## Dependencies

- Epic 1 must be complete (FastAPI scaffold + models + migrations)
