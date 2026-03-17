# CRM Platform — Sprint Kanban Board

Last updated: 2026-03-15 19:00 UTC
Active Sprint: Sprint 1 (2026-03-16 to 2026-03-29) — KICKOFF CONFIRMED
SRS: v2.0 — ACCEPTED AS AUTHORITATIVE (2026-03-15)

---

## PRE-SPRINT DELIVERABLES — ALL COMPLETE ✅

| Deliverable | Owner | Status |
|-------------|-------|--------|
| SQLAlchemy models (14 files) | gigforge-engineer | ✅ DONE 2026-03-15 |
| API spec (~80 endpoints, docs/api-spec.md) | gigforge-engineer | ✅ DONE 2026-03-15 |
| ADR-001 (RLS row isolation) | gigforge-engineer | ✅ DONE 2026-03-15 |
| ADR-002 (RS256 JWT + refresh token) | gigforge-engineer | ✅ DONE 2026-03-15 |
| ADR-003 (audit log decorator) | gigforge-engineer | ✅ DONE 2026-03-15 |
| Alembic migration 0001_initial_schema | gigforge-engineer | ✅ DONE 2026-03-15 |
| Docker Compose (postgres/backend/frontend/nginx) | gigforge-devops | ✅ DONE 2026-03-15 |

Sprint 1 is UNBLOCKED. gigforge-dev-backend starts 2026-03-16 with CRM-201 (JWT auth).

---

## BACKLOG

| Story | Title | Points | Assignee | Epic |
|-------|-------|--------|----------|------|
| US-001 | Docker Compose: all services up | 3 | gigforge-devops | Infra |
| US-002 | Alembic migrations configured | 2 | gigforge-dev-backend | Infra |
| US-003 | pytest + coverage configured | 2 | gigforge-dev-backend | Infra |
| US-004 | GitHub Actions CI | 2 | gigforge-devops | Infra |
| US-010 | User registration | 5 | gigforge-dev-backend | Auth |
| US-011 | Login + JWT tokens | 3 | gigforge-dev-backend | Auth |
| US-012 | Token refresh | 2 | gigforge-dev-backend | Auth |
| US-013 | Logout + blacklist | 2 | gigforge-dev-backend | Auth |
| US-014 | Org isolation middleware | 5 | gigforge-dev-backend | Auth |
| US-015 | Agent long-lived tokens | 3 | gigforge-dev-backend | Auth |
| US-020 | Contact CRUD API | 5 | gigforge-dev-backend | Contacts |
| US-021 | Contact search (pg_trgm) | 3 | gigforge-dev-backend | Contacts |
| US-022 | Contact tags | 3 | gigforge-dev-backend | Contacts |
| US-023 | CSV import | 3 | gigforge-dev-backend | Contacts |
| US-024 | Contacts page (frontend) | 5 | gigforge-dev-frontend | Contacts |
| US-025 | Companies CRUD | 3 | gigforge-dev-backend | Companies |
| US-030 | Pipeline stages config | 3 | gigforge-dev-backend | Deals |
| US-031 | Deal CRUD | 5 | gigforge-dev-backend | Deals |
| US-032 | Deal stage movement | 5 | gigforge-dev-backend | Deals |
| US-033 | Kanban pipeline board (frontend) | 5 | gigforge-dev-frontend | Deals |
| US-040 | Activity logging | 5 | gigforge-dev-backend | Activities |
| US-041 | Task management | 3 | gigforge-dev-backend | Tasks |
| US-042 | Activity timeline (frontend) | 5 | gigforge-dev-frontend | Activities |
| US-050 | Dashboard KPIs API | 5 | gigforge-dev-backend | Dashboard |
| US-051 | Pipeline chart (frontend) | 3 | gigforge-dev-frontend | Dashboard |
| US-052 | Global search | 3 | gigforge-dev-backend | Search |
| US-060 | Webhook registration + dispatch | 5 | gigforge-dev-backend | Webhooks |
| US-061 | Webhook delivery history | 3 | gigforge-dev-backend | Webhooks |
| US-070 | CSV export | 3 | gigforge-dev-backend | Import/Export |
| US-080 | Dark theme polish | 3 | gigforge-dev-frontend | Frontend |
| US-081 | Mobile responsive | 3 | gigforge-dev-frontend | Frontend |
| US-090 | QA acceptance test pass | 5 | gigforge-qa | QA |
| US-091 | Client Advocate review | 3 | gigforge-advocate | QA |

---

## SPRINT 1 (2026-03-16 to 2026-03-29) — Infrastructure + Auth

| Story | Title | Points | Status |
|-------|-------|--------|--------|
| US-001 | Docker Compose setup | 3 | **DONE** ✓ (2026-03-15) |
| US-002 | Alembic migrations | 2 | **DONE** ✓ (2026-03-15 — 0001_initial_schema applied, 14 tables live) |
| US-003 | pytest + coverage | 2 | TODO |
| US-004 | GitHub Actions CI | 2 | TODO |
| US-010 | User registration | 5 | TODO |
| US-011 | Login + JWT | 3 | TODO |
| US-012 | Token refresh | 2 | TODO |
| US-013 | Logout + blacklist | 2 | TODO |
| US-014 | Org isolation middleware | 5 | TODO |
| US-015 | Agent long-lived tokens | 3 | TODO |
| **Sprint 1 Total** | | **29 pts** | |

---

## SPRINT 2 (2026-03-30 to 2026-04-12) — Contacts + Companies

| Story | Title | Points | Status |
|-------|-------|--------|--------|
| US-020 | Contact CRUD API | 5 | Blocked (Sprint 1) |
| US-021 | Contact search | 3 | Blocked |
| US-022 | Contact tags | 3 | Blocked |
| US-023 | CSV import | 3 | Blocked |
| US-024 | Contacts page (frontend) | 5 | Blocked |
| US-025 | Companies CRUD | 3 | Blocked |
| **Sprint 2 Total** | | **22 pts** | |

---

## SPRINT 3 (2026-04-13 to 2026-04-26) — Deals + Pipeline

| Story | Title | Points | Status |
|-------|-------|--------|--------|
| US-030 | Pipeline stages | 3 | Blocked |
| US-031 | Deal CRUD | 5 | Blocked |
| US-032 | Deal stage movement | 5 | Blocked |
| US-033 | Kanban board (frontend) | 5 | Blocked |
| **Sprint 3 Total** | | **18 pts** | |

---

## SPRINT 4 (2026-04-27 to 2026-05-10) — Activities + Tasks

| Story | Title | Points | Status |
|-------|-------|--------|--------|
| US-040 | Activity logging | 5 | Blocked |
| US-041 | Task management | 3 | Blocked |
| US-042 | Activity timeline (frontend) | 5 | Blocked |
| **Sprint 4 Total** | | **13 pts** | |

---

## SPRINT 5 (2026-05-11 to 2026-05-24) — Dashboard + Search

| Story | Title | Points | Status |
|-------|-------|--------|--------|
| US-050 | Dashboard KPIs API | 5 | Blocked |
| US-051 | Pipeline chart | 3 | Blocked |
| US-052 | Global search | 3 | Blocked |
| US-080 | Dark theme polish | 3 | Blocked |
| **Sprint 5 Total** | | **14 pts** | |

---

## SPRINT 6 (2026-05-25 to 2026-06-08) — Webhooks + QA + Launch

| Story | Title | Points | Status |
|-------|-------|--------|--------|
| US-060 | Webhook registration + dispatch | 5 | Blocked |
| US-061 | Webhook delivery history | 3 | Blocked |
| US-070 | CSV export | 3 | Blocked |
| US-081 | Mobile responsive | 3 | Blocked |
| US-090 | QA acceptance test pass | 5 | Blocked |
| US-091 | Client Advocate review | 3 | Blocked |
| **Sprint 6 Total** | | **22 pts** | |

---

## IN PROGRESS

_(empty)_

---

## IN REVIEW

| Story | Title | Points | Assignee | Submitted |
|-------|-------|--------|----------|-----------|
| CRM-201 | JWT auth (register + login) | 5 | gigforge-dev-backend | 2026-03-15 |
| CRM-202 | Tenant isolation middleware | 5 | gigforge-dev-backend | 2026-03-15 |
| CRM-203 | RBAC permission dependency | 3 | gigforge-dev-backend | 2026-03-15 |
| CRM-204 | Token refresh + logout | 3 | gigforge-dev-backend | 2026-03-15 |
| CRM-105 | Seed data (GigForge + TechUni) | 2 | gigforge-dev-backend | 2026-03-15 |
| CRM-301 | Contacts CRUD API | 5 | gigforge-dev-backend | 2026-03-15 |
| CRM-302 | Companies CRUD API | 3 | gigforge-dev-backend | 2026-03-15 |
| CRM-303 | Tags system | 3 | gigforge-dev-backend | 2026-03-15 |

Awaiting: gigforge-engineer PR review + gigforge-qa coverage gate

---

## DONE

| Story | Title | Completed | Reviewer |
|-------|-------|-----------|----------|
| CRM-102 | SQLAlchemy models (20 models, all reviewed + 2 fixes applied) | 2026-03-15 | gigforge-engineer |
| -- | Schema design | 2026-03-15 | gigforge-engineer |
| -- | API specification | 2026-03-15 | gigforge-engineer |
| -- | ADR-001: Multi-tenancy | 2026-03-15 | gigforge-engineer |
| -- | ADR-002: Auth strategy | 2026-03-15 | gigforge-engineer |
| -- | ADR-003: Webhook design | 2026-03-15 | gigforge-engineer |
| CRM-104 | Docker Compose stack (3 services, health checks, multi-stage Dockerfile) | 2026-03-15 | gigforge-devops |
| -- | Project plan + kanban | 2026-03-15 | gigforge-pm |
| CRM-SRS-001 | SRS v2.0 — accepted as single source of truth | 2026-03-15 | gigforge-engineer |

---

## Blockers

| ID | Description | Owner | Raised |
|----|-------------|-------|--------|
| BLK-001 | `UserRole` enum uses `SALES_REP = "sales_rep"` but SRS v2.0 specifies role name `agent`. DB column value mismatch will break JWT role claims. Must resolve before CRM-201 merges. | gigforge-engineer | 2026-03-15 |

---

## Velocity Tracking

| Sprint | Planned | Actual | Notes |
|--------|---------|--------|-------|
| Sprint 1 | 29 | TBD | |
| Sprint 2 | 22 | TBD | |
| Sprint 3 | 18 | TBD | |
| Sprint 4 | 13 | TBD | |
| Sprint 5 | 14 | TBD | |
| Sprint 6 | 22 | TBD | |
