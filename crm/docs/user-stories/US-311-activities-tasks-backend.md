---
id: US-311
title: Activities & Tasks CRUD API
epic: Epic 5 — Activities & Tasks
sprint: 2
points: 5
priority: P0
assignee: gigforge-dev-backend
status: TODO
---

# US-311: Activities & Tasks CRUD API

## User Story
As a sales agent, I want to log activities and assign tasks so I can track all interactions and follow-up actions.

## Acceptance Criteria
- `POST /api/activities` — log activity (type: call/email/meeting/note/demo/other, contact_id, deal_id, company_id [at least one required], subject, body, occurred_at)
- `GET /api/activities` — list with filters (contact_id, deal_id, company_id, type, occurred_after/before)
- `GET /api/activities/{id}` — get single activity
- `PUT /api/activities/{id}` — update
- `DELETE /api/activities/{id}` — soft delete
- `POST /api/tasks` — create task (title, description, due_date, priority: low/medium/high/urgent, status: todo/in_progress/done/cancelled, contact_id, deal_id, assignee_id)
- `GET /api/tasks` — list with filters (assignee_id, status, priority, due_before/after, contact_id, deal_id)
- `GET /api/tasks/{id}` — get single task
- `PUT /api/tasks/{id}` — update
- `PATCH /api/tasks/{id}/status` — update status only
- `DELETE /api/tasks/{id}` — soft delete
- All endpoints tenant-scoped
- Activities appear in contact/deal/company timeline automatically
- Tasks overdue (past due_date and not done) flagged in list response

## Notes
- Activity body supports markdown
- Task reminders table for future notification system
