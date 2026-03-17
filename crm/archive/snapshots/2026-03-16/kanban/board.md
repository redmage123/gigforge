# CRM Platform — Kanban Board

**Last Updated:** 2026-03-16
**Sprint:** 2 COMPLETE
**Sprint Dates:** 2026-03-16 → 2026-03-16

---

## DONE (Sprint 1 Complete)

| Story | Title | Assignee | Points | Completed |
|-------|-------|----------|--------|-----------|
| CRM-101 | Project scaffolding | gigforge-dev-backend | 3 | 2026-03-15 |
| CRM-104 | Docker Compose stack | gigforge-devops | 3 | 2026-03-15 |
| CRM-103 | Alembic migrations (3) | gigforge-dev-backend | 5 | 2026-03-15 |
| CRM-102 | SQLAlchemy models (20) | gigforge-dev-backend | 8 | 2026-03-15 |
| CRM-201 | JWT authentication | gigforge-dev-backend | 8 | 2026-03-15 |
| CRM-202 | Tenant isolation middleware | gigforge-dev-backend | 5 | 2026-03-15 |
| CRM-203 | RBAC permission dependency | gigforge-dev-backend | 5 | 2026-03-15 |
| CRM-204 | Token refresh + logout | gigforge-dev-backend | 3 | 2026-03-15 |
| CRM-301 | Contacts CRUD API | gigforge-dev-backend | 5 | 2026-03-15 |
| CRM-302 | Companies CRUD API | gigforge-dev-backend | 3 | 2026-03-15 |
| CRM-303 | Tags system | gigforge-dev-backend | 3 | 2026-03-15 |
| CRM-FE1 | Login page | gigforge-dev-frontend | 3 | 2026-03-15 |
| CRM-FE2 | Contacts list page | gigforge-dev-frontend | 3 | 2026-03-15 |
| CRM-FE3 | Deal Pipeline page (scaffolded) | gigforge-dev-frontend | 2 | 2026-03-15 |
| CRM-QA1 | Test coverage: 96.46%, 206 tests | gigforge-qa | 5 | 2026-03-16 |
| CRM-DOC | 8 ADRs, API spec, SRS, Epics | gigforge-pm | 5 | 2026-03-15 |

**Sprint 1 Velocity: 69 points delivered**
**Coverage: 96.46% | Tests: 206 passing | Failures: 0**

---

## DONE (Sprint 2 — Backend)

| Story | Title | Assignee | Points | Completed |
|-------|-------|----------|--------|-----------|
| US-310 | Deals & Pipeline CRUD API | gigforge-dev-backend | 8 | 2026-03-16 |
| US-311 | Activities & Tasks CRUD API | gigforge-dev-backend | 5 | 2026-03-16 |
| US-312 | Notes API | gigforge-dev-backend | 3 | 2026-03-16 |
| US-313 | Dashboard KPIs & Analytics API (5 endpoints) | gigforge-dev-backend | 5 | 2026-03-16 |
| US-314 | Webhook System | gigforge-dev-backend | 5 | 2026-03-16 |
| US-315 | Global Search API | gigforge-dev-backend | 3 | 2026-03-16 |
| ADR-006 | Webhook delivery strategy ADR | gigforge-dev-backend | - | 2026-03-16 |
| ADR-007 | Search strategy ADR | gigforge-dev-backend | - | 2026-03-16 |
| ADR-008 | Background job runner ADR | gigforge-dev-backend | - | 2026-03-16 |

**Sprint 2 Backend Velocity: 29 points delivered**
**Coverage: 94% | Tests: 266 passing | Failures: 0**

---

## DONE (Sprint 2 — Frontend)

| Story | Title | Assignee | Points | Completed |
|-------|-------|----------|--------|-----------|
| ADR-009 | Frontend state management ADR | gigforge-dev-frontend | - | 2026-03-16 |
| ADR-010 | Drag-and-drop library ADR | gigforge-dev-frontend | - | 2026-03-16 |
| US-401 | Deal Pipeline Kanban — full build: DnD, side panel, Won/Lost, contact names, close-date colors, per-column add, pipeline selector | gigforge-dev-frontend | 8 | 2026-03-16 |
| US-402 | Companies list + detail pages | gigforge-dev-frontend | 5 | 2026-03-16 |
| US-403 | Tasks page (Today/Overdue/High/Done filters, optimistic toggle) | gigforge-dev-frontend | 5 | 2026-03-16 |
| US-404 | ActivityTimeline reusable component | gigforge-dev-frontend | 3 | 2026-03-16 |
| US-405 | Dashboard charts (KPI tiles, bar chart, funnel chart) | gigforge-dev-frontend | 5 | 2026-03-16 |
| US-406 | GlobalSearch Cmd+K overlay with 300ms debounce typeahead | gigforge-dev-frontend | 3 | 2026-03-16 |
| US-407 | CSV Import UI (CsvImportPage) | gigforge-dev-frontend | 3 | 2026-03-16 |

**Sprint 2 Frontend Velocity: 32 points delivered (all P0+P1+P2)**
**Build: ✅ clean (Vite 423ms) | TypeScript: ✅ no errors**

---

## DONE (Sprint 2 — Final)

| Story | Title | Assignee | Points | Completed |
|-------|-------|----------|--------|-----------|
| US-316 | CSV Contact Import — company find-or-create, tag find-or-create, 1000-row limit | gigforge-dev-backend | 3 | 2026-03-16 |
| US-501 | Test Coverage ≥97% (283 passing) | gigforge-qa | 8 | 2026-03-16 |

**Sprint 2 Final Velocity: 72 points delivered**
**Coverage: 94% | Tests: 278 passing | Failures: 0**

---

## IN PROGRESS

*(none — Sprint 2 complete)*

---

## BLOCKED

*(none)*

---

## Metrics

| Metric | Sprint 1 | Sprint 2 Target |
|--------|----------|-----------------|
| Story points | 69 delivered | 72 |
| Test coverage | 96.46% | ≥90% |
| Tests passing | 206 | TBD |
| ADRs written | 8 | +5 (ADR-005 to 009) |
| Endpoints | ~45 | ~80 |
