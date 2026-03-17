# ADR-008: Background Job Runner

**Status:** Accepted
**Date:** 2026-03-16
**Deciders:** gigforge-engineer, gigforge-dev-backend

---

## Context

Sprint 2 introduces two background processing needs:
1. **Webhook delivery** — async HTTP dispatch after CRM events
2. **CSV import** — processing uploaded contact files with >100 rows without blocking the HTTP response

We need a background job mechanism that fits the existing FastAPI stack without adding infrastructure.

Three strategies were evaluated:

| Strategy | Description | Pros | Cons |
|----------|-------------|------|------|
| **FastAPI BackgroundTasks** | In-process async tasks scheduled per-request | Zero infrastructure; simple API; works with existing DB session | Tasks lost on process crash; no task queue; not suitable for long-running jobs at scale |
| **Celery + Redis** | Distributed task queue | Durable; horizontal scaling; rich retry/scheduling primitives | Requires Redis + Celery worker; adds Docker service; complex local dev setup |
| **asyncio.create_task** | Python built-in coroutine scheduling | No dependencies | Task state invisible to FastAPI lifecycle; lost on crash; no retry logic |

---

## Decision

**FastAPI BackgroundTasks for Sprint 2 (webhook delivery and CSV import).**

Rationale:
- Current load does not justify Celery's operational cost.
- Webhook delivery failures are tolerable for MVP — the delivery log allows manual inspection and re-trigger.
- CSV imports for typical CRM data volumes (<10k rows) complete within seconds in-process.
- The webhook service wraps BackgroundTasks cleanly, so swapping to Celery in Sprint 3 only requires changing the service layer — the router API stays the same.

Migration path:
- **Sprint 3 trigger:** If webhook volume exceeds 1000 events/hour, or CSV imports regularly exceed 50k rows, migrate to Celery + Redis. The interface is abstracted so the change is contained to `services/`.

---

## Alternatives Considered

- **Celery + Redis:** Correct long-term choice but premature for Sprint 2 scope. Adds Docker Compose service (Redis), Celery worker process, and monitoring complexity (Flower). Deferred to Sprint 3.
- **asyncio.create_task:** Loses all tasks on restart; no retry support; not suitable for webhook delivery which requires at-least-once semantics.

---

## Consequences

- In-flight background tasks lost on process restart (acceptable for MVP).
- FastAPI `BackgroundTasks` must be injected at the router layer and passed to the service — documented in all webhook/import callers.
- Delivery log in PostgreSQL provides observability without needing a task queue dashboard.
- Sprint 3 must revisit this decision based on production load metrics.
