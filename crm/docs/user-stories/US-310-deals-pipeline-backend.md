---
id: US-310
title: Deals & Pipeline CRUD API
epic: Epic 4 — Pipeline & Deals
sprint: 2
points: 8
priority: P0
assignee: gigforge-dev-backend
status: TODO
---

# US-310: Deals & Pipeline CRUD API

## User Story
As a sales agent, I want to create and manage deals through a pipeline so I can track opportunities from lead to close.

## Acceptance Criteria
- `POST /api/pipelines` — create pipeline (name, stages[])
- `GET /api/pipelines` — list org pipelines with stage counts
- `POST /api/pipelines/{id}/stages` — add stage (name, order, probability 0-100)
- `PUT /api/pipelines/{id}/stages/{stage_id}` — update stage
- `DELETE /api/pipelines/{id}/stages/{stage_id}` — delete stage (moves deals to previous)
- `POST /api/deals` — create deal (title, value, currency, pipeline_id, stage_id, contact_id, company_id, owner_id, close_date, probability)
- `GET /api/deals` — list deals with filters (pipeline_id, stage_id, owner_id, status, min_value, max_value, close_date_before/after)
- `GET /api/deals/{id}` — get deal with nested contact, company, stage, activities
- `PUT /api/deals/{id}` — full update
- `PATCH /api/deals/{id}` — partial update (including stage_id for movement)
- `DELETE /api/deals/{id}` — soft delete
- `PATCH /api/deals/{id}/stage` — move deal to stage (records stage history)
- All endpoints tenant-scoped
- Stage movement logs to activity timeline automatically
- Deal value: decimal with 2dp, currency ISO 4217 code
- Status: open / won / lost / archived
- Pagination: page + per_page on list endpoints

## Notes
- Default pipeline and stages created by seed script
- Pipeline stages have display_order; enforce unique order per pipeline
- Stage history table: deal_id, from_stage_id, to_stage_id, moved_at, moved_by
