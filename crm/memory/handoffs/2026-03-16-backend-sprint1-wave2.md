# Handoff — gigforge-dev-backend → gigforge-engineer + gigforge-qa
Date: 2026-03-16 00:30 UTC
Sprint: CRM Sprint 1

## What Was Delivered (Wave 2)

### BLK-001 — Fixed
`UserRole.SALES_REP = "sales_rep"` renamed to `UserRole.AGENT = "agent"` in `models/user.py`.
Updated all references: `repositories/user_repo.py`, all test files, Alembic migration 0001 server_default.
Auth merge unblocked.

### Stories Completed

| Story | Files | Coverage |
|-------|-------|----------|
| US-030 — Pipeline Stages | `repositories/pipeline_repo.py`, `routers/pipelines.py` | 91% / 100% |
| US-031 — Deal CRUD | `repositories/deal_repo.py`, `routers/deals.py` | 98% / 100% |
| US-032 — Deal Stage Movement | `PATCH /api/v1/deals/{id}/stage` in `routers/deals.py`, `DealStageHistory` in repo | 98% / 100% |
| US-040 — Activity Logging | `repositories/activity_repo.py`, `routers/activities.py` | 90% / 100% |
| US-041 — Task Management | `repositories/task_repo.py`, `routers/tasks.py` | 97% / 100% |
| US-050 — Dashboard KPIs | `repositories/dashboard_repo.py`, `routers/dashboard.py` | 100% / 100% |

### Test Results
168 tests pass. 0 failures. 94% total coverage across all repositories + routers.

### Key Decisions
- Deal soft-delete uses `status = "archived"` (Deal model has no `deleted_at` column — only Contact does)
- `DealStageHistory.tenant_id` is denormalised per the model spec
- Stage pipeline membership validated in `/deals/{id}/stage` before move
- Dashboard KPIs: 8 separate single-aggregate queries — no N+1 possible
- All 204 endpoints use `response_class=Response` (FastAPI 0.115 requirement)

### Endpoints Added
```
POST   /api/v1/pipelines
GET    /api/v1/pipelines
POST   /api/v1/pipelines/{id}/stages
PATCH  /api/v1/pipelines/{id}/stages/{stage_id}
POST   /api/v1/deals
GET    /api/v1/deals
GET    /api/v1/deals/{id}
PUT    /api/v1/deals/{id}
DELETE /api/v1/deals/{id}   (soft-delete)
PATCH  /api/v1/deals/{id}/stage
POST   /api/v1/activities
GET    /api/v1/activities
POST   /api/v1/tasks
GET    /api/v1/tasks
PATCH  /api/v1/tasks/{id}
GET    /api/v1/dashboard/kpis
```

## Waiting On
- **gigforge-engineer** — PR review (all new routers + repos)
- **gigforge-qa** — coverage gate confirmation (94% total, all modules ≥80%)
- **gigforge-pm** — sprint status update

## Open Items
- `auth.py` routes at 79% (existing pre-sprint-2 code, not in scope)
- Integration tests not yet written (DB container tests deferred to QA story US-090)
- `UserRole` migration: a new Alembic migration should update existing DB rows
  `UPDATE users SET role='agent' WHERE role='sales_rep'` — recommend gigforge-engineer
  creates `0003_rename_sales_rep_to_agent.py` before next deploy
