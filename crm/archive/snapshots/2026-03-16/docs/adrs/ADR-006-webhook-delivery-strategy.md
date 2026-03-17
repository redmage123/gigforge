# ADR-006: Webhook Delivery Strategy

**Status:** Accepted
**Date:** 2026-03-16
**Deciders:** gigforge-engineer, gigforge-dev-backend

---

## Context

The CRM needs to notify external systems when key events occur (deal stage changes, contact creation, task completion, etc.). We need a reliable, auditable delivery mechanism that works within the existing FastAPI + PostgreSQL stack without adding operational complexity for an MVP.

Three strategies were evaluated:

| Strategy | Description | Pros | Cons |
|----------|-------------|------|------|
| **FastAPI BackgroundTasks + httpx** | Async HTTP delivery in-process, signed with HMAC-SHA256, delivery log in PostgreSQL | No new infrastructure; simple deploy; auditable via DB | If process dies, in-flight deliveries are lost; not suitable for high volume |
| **Celery + Redis** | Distributed task queue for webhook delivery | Durable; horizontally scalable; retry semantics built-in | Requires Redis deployment; operational overhead; overkill for MVP load |
| **Redis Queue (RQ)** | Lightweight Redis-backed job queue | Simpler than Celery; durable | Still requires Redis; adds infra dependency |

---

## Decision

**FastAPI BackgroundTasks with httpx, HMAC-SHA256 signing, 3 retries with exponential backoff, and a PostgreSQL delivery log.**

Delivery flow:
1. Service layer fires event (e.g., `contact.created`) after successful DB commit.
2. `WebhookService.dispatch(event_type, payload, tenant_id)` queries active webhooks subscribed to that event.
3. For each matched webhook, a `WebhookDelivery` row is created (status=`pending`) and delivery is enqueued via `BackgroundTasks`.
4. Background task signs payload with `HMAC-SHA256(secret, json_body)`, POSTs to webhook URL.
5. On HTTP 2xx: delivery row updated to `success`.
6. On failure: retry up to 3 times with exponential backoff (2s, 4s, 8s). After 3 failures, status set to `failed`.
7. All attempts logged in `WebhookDelivery.attempt_count` and `last_attempted_at`.

HMAC signature sent as `X-CRM-Signature: sha256=<hex>` header so receivers can verify.

---

## Alternatives Considered

- **Celery + Redis:** Provides durability and horizontal scaling, but adds Redis and a Celery worker to the Docker Compose stack. Not justified for current load. Will revisit in Sprint 3 if delivery volume exceeds ~1000 events/hour.
- **Redis Queue (RQ):** Lighter than Celery but still requires Redis. Same conclusion.
- **Synchronous delivery in request path:** Rejected — webhook delivery latency would directly impact API response times.

---

## Consequences

- Webhook deliveries are lost if the FastAPI process crashes mid-background-task. Acceptable for MVP; delivery log allows manual re-trigger.
- Delivery log grows unbounded; add a cleanup job in Sprint 3 to prune entries older than 30 days.
- `WebhookDelivery` table required for auditability.
- Migrate to Celery in Sprint 3 if production load demands it (see ADR-008).
