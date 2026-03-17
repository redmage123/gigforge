---
id: US-312
title: Notes API
epic: Epic 5 — Activities & Tasks
sprint: 2
points: 3
priority: P1
assignee: gigforge-dev-backend
status: TODO
---

# US-312: Notes API

## User Story
As a user, I want to create notes on contacts, deals, and companies so I can capture free-form information.

## Acceptance Criteria
- `POST /api/notes` — create note (body: markdown, contact_id, deal_id, company_id [at least one required], is_pinned)
- `GET /api/notes` — list with filters (contact_id, deal_id, company_id, is_pinned)
- `GET /api/notes/{id}` — get single note
- `PUT /api/notes/{id}` — update body / is_pinned
- `DELETE /api/notes/{id}` — soft delete
- Notes tenant-scoped
- is_pinned notes appear first in list
- Body max 10,000 characters
- Author (creator) stored and returned in response
