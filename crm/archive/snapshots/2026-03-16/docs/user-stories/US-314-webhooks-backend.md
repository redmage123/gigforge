---
id: US-314
title: Webhook System
epic: Epic 7 — Agent API
sprint: 2
points: 5
priority: P1
assignee: gigforge-dev-backend
status: TODO
---

# US-314: Webhook System

## User Story
As an AI agent developer, I want webhook notifications when CRM data changes so my agents can react to events in real time.

## Acceptance Criteria
- `POST /api/webhooks` — register endpoint (url, events[], secret, description)
- `GET /api/webhooks` — list webhooks for org
- `PUT /api/webhooks/{id}` — update endpoint / events / secret
- `DELETE /api/webhooks/{id}` — deregister
- `GET /api/webhooks/{id}/deliveries` — last 100 delivery attempts (status, response_code, duration_ms, attempted_at)
- Events to support: contact.created, contact.updated, contact.deleted, deal.created, deal.stage_changed, deal.won, deal.lost, task.created, task.completed
- Delivery: POST JSON payload to registered URL with headers:
  - X-CRM-Event: <event_type>
  - X-CRM-Delivery: <uuid>
  - X-CRM-Signature: HMAC-SHA256 of body using webhook secret
- Retry: 3 attempts with exponential backoff (immediate, 1min, 5min)
- Delivery runs async (background task, does not block API response)
- Webhook secret min 16 chars; stored hashed in DB, never returned in API responses
- Admin/manager roles only can manage webhooks
