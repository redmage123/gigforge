# CRM Platform — Sprint 1 Plan

**Status:** ACTIVE — infra complete, auth sprint in progress
**Sprint Dates:** 2026-03-15 → 2026-03-22
**PM:** gigforge-pm
**Kickoff:** 2026-03-15 (infra + migrations delivered same day)

---

## Sprint Goal

Deliver a running multi-tenant CRM backend with full authentication, tenant isolation, RBAC, and basic Contacts/Companies/Tags CRUD — all covered by automated tests and running in Docker. The sprint is the foundation every downstream sprint builds on.

**Definition of Done:**
- All 11 stories listed below pass their acceptance criteria
- Test coverage ≥ 80% (pytest-cov)
- `docker compose up && docker compose exec api pytest` completes with 0 failures
- Alembic migrations run cleanly on a fresh PostgreSQL 16 instance
- GigForge and TechUni tenants seeded and independently isolated (cross-tenant tests pass)
- API spec (OpenAPI) auto-generated and accessible at `/docs`

---

## Dependency Order (Critical Path)

```
CRM-102 (schema) ──► CRM-101 (scaffold) ──► CRM-103 (migrations) ──► CRM-201 (auth)
                                                                           │
                  CRM-104 (docker) ─────────────────────────────────► CRM-105 (seed)
                                                                           │
                                                              CRM-202 (tenant isolation)
                                                                           │
                                                              CRM-203 (RBAC) ──► CRM-301 (contacts)
                                                              CRM-204 (refresh)  CRM-302 (companies)
                                                                                 CRM-303 (tags)
```

**Start immediately (no blockers):**
- CRM-102 (gigforge-engineer — in progress)
- CRM-104 (gigforge-devops — can start now)

**Start when CRM-102 is approved:**
- CRM-101 (gigforge-dev-backend)

---

## Sprint Backlog

| ID | Story | Points | Owner | Priority | Status | Blocked By |
|----|-------|--------|-------|----------|--------|-----------|
| CRM-101 | Project scaffolding | 3 | gigforge-dev-backend | P0 | **DONE** ✓ | — |
| CRM-104 | Docker Compose stack | 3 | gigforge-devops | P0 | **DONE** ✓ | — |
| CRM-103 | Alembic migrations baseline | 5 | gigforge-dev-backend | P0 | **DONE** ✓ | — |
| CRM-102 | SQLAlchemy models (all entities) | 8 | gigforge-engineer | P0 | IN PROGRESS | — |
| CRM-201 | JWT auth (register + login) | 8 | gigforge-dev-backend | P0 | READY | — |
| CRM-202 | Tenant isolation middleware | 5 | gigforge-dev-backend | P0 | READY | CRM-201 |
| CRM-203 | RBAC permission dependency | 5 | gigforge-dev-backend | P0 | READY | CRM-202 |
| CRM-204 | Token refresh + logout | 3 | gigforge-dev-backend | P1 | READY | CRM-201 |
| CRM-105 | Seed data (GigForge + TechUni) | 2 | gigforge-dev-backend | P1 | BLOCKED | CRM-102 review |
| CRM-301 | Contacts CRUD API | 5 | gigforge-dev-backend | P0 | READY | CRM-202, CRM-203 |
| CRM-302 | Companies CRUD API | 3 | gigforge-dev-backend | P1 | READY | CRM-202 |
| CRM-303 | Tags system | 3 | gigforge-dev-backend | P1 | READY | CRM-202 |

**Total: 48 story points**

---

## Team Assignments

### gigforge-engineer
- **CRM-102** — Design and implement all remaining SQLAlchemy models (Contact, Company, Tag, Pipeline, PipelineStage, Deal, DealStageHistory, Activity, Task, Note, CustomField, Webhook, AuditLog)
- Review all backend code for SOLID compliance, DAO pattern adherence
- Approve architecture before any implementation begins on CRM-101

### gigforge-dev-backend
- **CRM-101** — Project scaffolding (FastAPI, uvicorn, pydantic-settings, session factory, health check)
- **CRM-103** — Alembic baseline migration (all tables, indexes, FK constraints, RLS policies)
- **CRM-201** — JWT auth: register + login endpoints
- **CRM-202** — Tenant isolation middleware
- **CRM-203** — RBAC `require_role()` dependency
- **CRM-204** — Token refresh + logout (blacklist)
- **CRM-105** — Seed script (GigForge + TechUni tenants)
- **CRM-301** — Contacts CRUD (6 endpoints, paginated, filtered, soft-delete)
- **CRM-302** — Companies CRUD
- **CRM-303** — Tags system + contact/company/deal association

**Engineering Methodology (mandatory):**
- TDD: write failing tests BEFORE writing implementation (RED → GREEN → REFACTOR)
- Each story: tests live in `tests/unit/` (mocked) and `tests/integration/` (real DB)
- Minimum 80% coverage on all new code before story is marked done
- Use `pytest-asyncio` for async test cases

### gigforge-devops
- **CRM-104** — Docker Compose (PostgreSQL 16, FastAPI, pgAdmin) with hot-reload, health checks, `.env` sourcing, multi-stage Dockerfile

### gigforge-qa
- Write test plan covering all 12 stories before any implementation starts
- Run final acceptance testing at sprint end against Docker stack
- Confirm cross-tenant isolation with dedicated test script
- Coverage report must show ≥ 80% before APPROVED

---

## What We Are NOT Doing This Sprint

- Frontend (Epic 8) — Sprint 3
- Activity/Task/Note endpoints (Epic 5) — Sprint 3
- Webhooks (Epic 7) — Sprint 3
- Import/Export (Epic 9) — Sprint 3
- Search (CRM-304) — Sprint 2
- Custom fields (CRM-305) — Sprint 2

---

## Sprint Schedule (indicative)

| Day | Focus |
|-----|-------|
| Day 1 (2026-03-15) | CRM-102 complete, CRM-104 complete |
| Day 2 (2026-03-16) | CRM-101, CRM-103 |
| Day 3 (2026-03-17) | CRM-201, CRM-202 |
| Day 4 (2026-03-18) | CRM-203, CRM-204, CRM-105 |
| Day 5 (2026-03-19) | CRM-301, CRM-302 |
| Day 6 (2026-03-20) | CRM-303, QA test plan begins |
| Day 7 (2026-03-21) | QA acceptance testing, bug fixes |
| Day 8 (2026-03-22) | Approval gate, retro, Sprint 2 planning |

---

## Approval Gate

Both reviewers must approve before sprint is marked done:

- **gigforge-qa** — runs `pytest` against Docker stack, verifies all acceptance criteria, confirms ≥ 80% coverage, validates cross-tenant isolation
- **gigforge-advocate** — acts as a developer evaluating the API for integration: tests the OpenAPI spec, attempts a cross-tenant attack, verifies DX quality

---

## Architecture Decisions Required (ADRs)

Before implementation begins, the following decisions need ADR sign-off from gigforge-engineer and gigforge-pm:

| ADR | Decision | Status |
|-----|---------|--------|
| ADR-0001 | Async vs sync SQLAlchemy driver choice | NEEDED |
| ADR-0002 | JWT blacklist storage: DB table vs Redis | NEEDED |
| ADR-0003 | Tenant isolation strategy: app-layer vs PostgreSQL RLS | NEEDED |
| ADR-0004 | Custom fields approach: JSONB vs EAV table | NEEDED |

ADR template: `backend/adrs/0000-template.md`

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| CRM-102 schema takes longer than expected | Medium | High — blocks everything | gigforge-engineer to deliver by EOD Day 1; PM checks in at midday |
| Async SQLAlchemy complexity slows CRM-201/202 | Medium | Medium | Prototype session factory in CRM-101 to de-risk early |
| Cross-tenant isolation hard to test | Low | Critical | gigforge-qa writes cross-tenant test suite before any CRUD is implemented |
| 80% coverage target missed | Medium | Medium | gigforge-dev-backend tracks coverage after each story; do not defer tests |

---

## Standup Report

Daily standups due to gigforge (Operations Director) at start of each working cycle.

Format:
```
## Standup — CRM Sprint 1 — [Date]
**Yesterday:** [what was completed]
**Today:** [what I'm working on]
**Blockers:** [anything blocking progress]
```

---

## Coverage Report — 2026-03-16

**QA Engineer:** gigforge-qa
**Date:** 2026-03-16
**Sprint:** Sprint 1

### Baseline Coverage (before this session)

| Metric | Value |
|--------|-------|
| Coverage % | 95% |
| Tests passing | 168 |
| Tests failing | 0 |

### Final Coverage (after this session)

| Metric | Value |
|--------|-------|
| Coverage % | **96.46%** |
| Tests passing | **206** |
| Tests failing | 0 |
| Tests skipped | 0 |
| New tests added | 38 |

### New Test Files

| File | Tests | Purpose |
|------|-------|---------|
| `tests/integration/test_cross_tenant.py` | 8 | Mandatory cross-tenant isolation tests + UserRole.AGENT regression |
| `tests/unit/test_coverage_final.py` | 30 | Gap-fill: tag_repo, company_repo, activity_repo, pipeline_repo, routers/auth, scripts/seed |

### Coverage by Module (notable changes)

| Module | Before | After |
|--------|--------|-------|
| `repositories/activity_repo.py` | 90% | **100%** |
| `repositories/company_repo.py` | 87% | **100%** |
| `repositories/pipeline_repo.py` | 91% | **100%** |
| `repositories/tag_repo.py` | 80% | **100%** |
| `routers/auth.py` | 79% | **100%** |
| `scripts/seed.py` | 0% | 20% (data structures + helpers tested; async DB calls excluded from unit tests) |

### Approval Gate Status

- [x] Coverage ≥ 80% — **PASSED** (96.46%)
- [x] 0 test failures — **PASSED**
- [x] Cross-tenant isolation — **PASSED** (6 mandatory tests)
- [x] UserRole.AGENT regression test — **PASSED** (BLK-001 verified fixed)
