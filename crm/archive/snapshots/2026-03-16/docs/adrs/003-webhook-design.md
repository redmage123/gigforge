# ADR-003: Webhook Design

**Status:** Accepted
**Date:** 2026-03-15
**Author:** gigforge-engineer
**Context:** GigForge + TechUni CRM Platform

---

## Context

The CRM platform hosts data that AI agents need to act on in real-time. Specifically:

- `gigforge-sales` needs to know immediately when a new contact is created by `gigforge-scout`, so it can begin proposal drafting.
- `gigforge-pm` needs to know when a deal moves to a new stage, so it can trigger sprint planning.
- `gigforge-dev-*` agents need to know when a task is assigned to them.
- `gigforge-finance` needs to know when a deal is won, so it can trigger invoice generation.
- External systems (e.g. a future Slack bot, an email sequencing tool) need to react to CRM events.

The platform must provide a mechanism for any interested party — AI agents or external systems — to receive real-time notifications of CRM events without requiring them to poll the API continuously.

The following requirements shaped this decision:

1. **Delivery reliability.** If an endpoint is temporarily unavailable, events must not be lost. Retry with backoff is required.
2. **Security.** Consumers must be able to verify that a webhook payload genuinely originated from this CRM platform and has not been tampered with in transit.
3. **Observability.** Every delivery attempt must be logged so that failures can be investigated and replayed if necessary.
4. **Org isolation.** Webhooks are org-scoped. A GigForge webhook endpoint must never receive TechUni events.
5. **Simplicity for consumers.** AI agents receiving webhook events should be able to implement a simple HTTP server endpoint and verify a signature header. No complex protocol required.
6. **Async delivery.** Webhook dispatch must not block the API response. A user creating a contact must not wait for the webhook to be delivered before receiving their `201 Created` response.

---

## Decision

We implement **outbound HTTP webhooks with async background delivery, HMAC-SHA256 payload signing, exponential backoff retry, and a persistent delivery log**.

### Architecture Overview

```
CRM API Request
      │
      ▼
Route Handler
  ├── Write to database (contact, deal, etc.)
  ├── Write audit_log entry
  ├── Commit transaction
  └── Enqueue background task: dispatch_webhook(event_type, org_id, entity_data)
            │
            ▼
     Background Worker (FastAPI BackgroundTasks or Celery)
       ├── Query: SELECT * FROM webhooks WHERE org_id = ? AND ? = ANY(events) AND is_active
       ├── For each webhook:
       │     ├── Serialize payload JSON
       │     ├── Compute HMAC-SHA256 signature
       │     ├── INSERT INTO webhook_events (status='pending')
       │     └── POST to webhook.url with signature header
       │           ├── 2xx → UPDATE webhook_events SET status='delivered'
       │           └── non-2xx / timeout → UPDATE SET status='retrying', next_retry_at=...
       └── Retry worker (background cron, every 30s):
             SELECT * FROM webhook_events WHERE status IN ('pending','retrying')
               AND next_retry_at <= now()
             → Reattempt delivery
             → After 4 attempts: UPDATE SET status='failed'
```

### Payload Format

Every webhook POST delivers a JSON body with this structure:

```json
{
  "event":      "deal.stage_changed",
  "timestamp":  "2026-03-15T14:30:00.000Z",
  "org_id":     "gigforge-org-uuid",
  "actor_id":   "agent-user-uuid",
  "actor_type": "agent",
  "data": {
    "deal_id":     "uuid",
    "deal_title":  "Acme — Enterprise License",
    "value":       75000.00,
    "from_stage":  { "id": "uuid", "name": "Qualified" },
    "to_stage":    { "id": "uuid", "name": "Negotiation" },
    "changed_by":  { "id": "uuid", "name": "gigforge-pm" }
  }
}
```

**Payload design principles:**
- `event` is a dot-separated string: `<entity>.<verb>` (e.g. `contact.created`, `deal.stage_changed`)
- `timestamp` is always UTC ISO 8601 with millisecond precision
- `org_id` is included so consumers can validate they're receiving the correct org's events (defense-in-depth alongside the HMAC signature)
- `actor_id` and `actor_type` are included so consumers know whether a human or an AI agent triggered the event
- `data` contains the complete, denormalized entity state — consumers should not need to make follow-up API calls for the common case

### HMAC-SHA256 Signature

Every webhook delivery includes a signature header computed over the raw request body:

```
X-CRM-Signature: sha256=<hex_digest>
```

**Signing algorithm:**

```python
import hmac
import hashlib

def sign_payload(secret: str, body: bytes) -> str:
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"
```

**Consumer verification (Python):**

```python
def verify_signature(secret: str, body: bytes, signature_header: str) -> bool:
    expected = sign_payload(secret, body)
    return hmac.compare_digest(expected, signature_header)
```

**Consumer verification (Node.js):**

```javascript
const crypto = require('crypto');

function verifySignature(secret, body, signatureHeader) {
    const expected = 'sha256=' + crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');
    return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signatureHeader)
    );
}
```

**Security properties:**
- The `secret` is generated per webhook registration and stored only in the `webhooks` table (never returned in API responses after creation)
- HMAC uses constant-time comparison (`hmac.compare_digest`) to prevent timing attacks
- The signature covers the raw body bytes, including whitespace — consumers must not re-serialize the payload before verifying

### Retry Policy

Delivery attempts follow exponential backoff:

| Attempt | Delay from previous failure | `next_retry_at` |
|---------|----------------------------|-----------------|
| 1 (initial) | Immediate | — |
| 2 | 1 minute | `now() + 1 min` |
| 3 | 5 minutes | `now() + 5 min` |
| 4 | 30 minutes | `now() + 30 min` |
| Terminal | — | `status = 'failed'` |

After 4 failed attempts, `webhook_events.status` is set to `'failed'`. No further retries are attempted automatically. The admin can manually trigger a redelivery via the API (`POST /api/webhooks/{id}/events/{event_id}/retry` — available as a future endpoint).

**Timeout:** Each delivery attempt times out after 10 seconds. The consumer endpoint must respond within 10 seconds; otherwise the attempt is counted as failed.

**Idempotency:** Consumers should implement idempotent event processing. Webhook events include a unique `id` field (the `webhook_events.id`) that consumers can use to deduplicate redeliveries.

### Database Persistence (webhook_events table)

Every delivery attempt is recorded in `webhook_events`:

```sql
-- Status lifecycle:
-- pending → delivered      (first attempt succeeded)
-- pending → retrying       (first attempt failed, retry scheduled)
-- retrying → delivered     (retry succeeded)
-- retrying → retrying      (retry failed, next retry scheduled)
-- retrying → failed        (max attempts reached)
```

The `webhook_events` table serves three purposes:
1. **Retry queue** — the retry worker scans for `status IN ('pending', 'retrying') AND next_retry_at <= now()`
2. **Delivery audit** — admins can see all delivery history for a webhook endpoint
3. **Debugging** — `response_status_code` and `response_body` let the platform team diagnose why a delivery failed

### FastAPI Implementation Pattern

```python
# app/services/webhook_dispatcher.py

import httpx
from uuid import UUID
from datetime import datetime, timezone
from app.core.signing import sign_payload
from app.repositories.webhooks import WebhookRepository, WebhookEventRepository

RETRY_DELAYS = [60, 300, 1800]  # seconds: 1min, 5min, 30min
MAX_ATTEMPTS = 4
DELIVERY_TIMEOUT_SECONDS = 10

async def dispatch_webhook_event(
    org_id: UUID,
    event_type: str,
    data: dict,
    actor_id: UUID,
    actor_type: str,
    session: AsyncSession,
) -> None:
    """
    Called as a background task after each write operation.
    Queries active webhooks subscribed to this event type, delivers to each.
    """
    webhooks = await WebhookRepository(session).get_active_for_event(
        org_id=org_id,
        event_type=event_type,
    )

    for webhook in webhooks:
        payload = {
            "event":      event_type,
            "timestamp":  datetime.now(timezone.utc).isoformat(),
            "org_id":     str(org_id),
            "actor_id":   str(actor_id),
            "actor_type": actor_type,
            "data":       data,
        }
        body = json.dumps(payload, default=str).encode("utf-8")
        signature = sign_payload(webhook.secret, body)

        event_record = await WebhookEventRepository(session).create(
            webhook_id=webhook.id,
            event_type=event_type,
            payload=payload,
            status="pending",
        )

        try:
            async with httpx.AsyncClient(timeout=DELIVERY_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    webhook.url,
                    content=body,
                    headers={
                        "Content-Type":    "application/json",
                        "X-CRM-Signature": signature,
                        "X-CRM-Event":     event_type,
                        "X-CRM-Event-ID":  str(event_record.id),
                    },
                )
            if response.is_success:
                await WebhookEventRepository(session).mark_delivered(
                    event_record.id,
                    response_status_code=response.status_code,
                    response_body=response.text[:2000],
                )
            else:
                await schedule_retry(session, event_record, response, attempt=1)

        except (httpx.TimeoutException, httpx.RequestError) as e:
            await schedule_retry(session, event_record, error=str(e), attempt=1)


async def schedule_retry(session, event_record, response=None, error=None, attempt: int = 1):
    if attempt >= MAX_ATTEMPTS:
        await WebhookEventRepository(session).mark_failed(event_record.id, response, error)
        return

    delay_seconds = RETRY_DELAYS[attempt - 1]
    next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)

    await WebhookEventRepository(session).mark_retrying(
        event_record.id,
        next_retry_at=next_retry_at,
        attempts=attempt,
        response_status_code=response.status_code if response else None,
        response_body=response.text[:2000] if response else error,
    )
```

### Integration in Route Handlers

```python
# app/api/contacts.py

@router.post("/contacts", status_code=201)
async def create_contact(
    body: ContactCreate,
    background_tasks: BackgroundTasks,
    org_id: UUID = Depends(get_current_org_id),
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    contact = await contacts_repo.create(session, org_id=org_id, data=body, created_by=current_user["sub"])

    # Webhook dispatch is async — does not block the HTTP response
    background_tasks.add_task(
        dispatch_webhook_event,
        org_id     = org_id,
        event_type = "contact.created",
        data       = ContactSchema.model_validate(contact).model_dump(),
        actor_id   = UUID(current_user["sub"]),
        actor_type = "agent" if current_user["is_agent"] else "user",
        session    = session,
    )

    return ContactSchema.model_validate(contact)
```

---

## Alternatives Considered

### Alternative 1: WebSocket Push (Server-Sent Events)

Maintain persistent WebSocket connections from AI agents to the CRM server. Push events over the connection in real-time.

**Why rejected:**
- AI agents are stateless HTTP clients. Maintaining a persistent WebSocket connection requires the agent to run a dedicated listener process, complicating deployment.
- WebSocket connections are stateful and are not compatible with horizontal scaling without a sticky session or pub/sub relay (e.g. Redis pub/sub).
- Reconnection logic, heartbeats, and connection management add significant complexity to both server and client implementations.
- Webhook receivers are simpler: they are plain HTTP servers (or serverless functions) that handle POST requests. The receiver does not need to manage a persistent connection.
- For AI agents that only care about specific events, the polling and subscription overhead of WebSockets is unnecessary.

**Possible future addition:** Server-Sent Events (SSE) or WebSocket streams may be added for the web UI to enable real-time Kanban board updates. This is orthogonal to the webhook mechanism and does not conflict with this ADR.

### Alternative 2: Message Queue (RabbitMQ / Kafka)

Publish events to a message queue. Consumers subscribe to topics/queues and receive events via the queue protocol.

**Why rejected for this use case:**
- Introduces a significant operational dependency (RabbitMQ cluster or Kafka cluster) that is not justified for the current scale of two organizations.
- AI agents and external integrations would need to implement a queue client (AMQP/Kafka protocol), which is far more complex than receiving an HTTP POST.
- External integrations (third-party tools, partner systems) cannot consume from a private message queue — they require HTTP webhooks.
- Webhooks are the de facto standard for CRM event delivery (Stripe, HubSpot, Salesforce, GitHub all use webhooks). The pattern is well understood by integration developers.

**Future consideration:** If the platform grows to hundreds of tenants with high-frequency events (millions of events/day), the webhook dispatch layer could be backed by a Kafka topic internally, with the HTTP delivery happening from Kafka consumers. This would not change the external API — webhooks would still be the consumer-facing interface.

### Alternative 3: Polling (GET /api/events?since=timestamp)

Expose an events API endpoint that consumers poll on a schedule to fetch new events.

**Why rejected:**
- Polling introduces latency between event creation and agent reaction (up to the polling interval).
- Polling generates unnecessary API traffic — every poll request is a database query even when there are no new events.
- Rate limits constrain polling frequency. A Scout agent checking every 10 seconds for new contacts would consume 6 requests/minute just for the polling, leaving less budget for actual work.
- Consumers must maintain their own "last seen" cursor to avoid re-processing events, adding state management complexity.
- Push (webhooks) is strictly superior for real-time event notification when the consumer can run an HTTP server.

---

## Consequences

### Positive

- **Non-blocking API responses.** Webhook dispatch is enqueued as a background task. The API caller receives their `201 Created` immediately; webhook delivery happens asynchronously.
- **Reliable delivery.** The retry policy with exponential backoff ensures temporary endpoint failures do not cause event loss. Events are persisted in `webhook_events` before any delivery attempt.
- **Secure.** HMAC-SHA256 signature on every payload lets consumers cryptographically verify authenticity. The secret is write-only — never returned in API responses.
- **Observable.** The `webhook_events` table provides a full delivery audit trail. Admins can see exactly what was delivered, when, how many attempts were made, and what the endpoint returned.
- **Standard protocol.** HTTP POST with JSON payload and a signature header is the industry standard for webhooks. Any HTTP-capable client (including AI agent frameworks like LangChain, AutoGPT, or custom FastAPI services) can consume events without special libraries.
- **Per-org isolation.** The webhook query filters by `org_id` before checking event subscriptions. GigForge webhooks only fire for GigForge events; TechUni webhooks only fire for TechUni events.

### Negative / Risks

- **At-least-once delivery.** Webhooks guarantee at least one delivery attempt per event — not exactly-once. Consumers must implement idempotent event processing (check the event ID before acting on it).
- **No delivery guarantee after 4 attempts.** If an endpoint is down for more than ~36 minutes (1 + 5 + 30 min), the event is marked `failed` and no further retries occur. This is an accepted trade-off for simplicity. A manual retry mechanism (admin triggers re-delivery) is planned as a follow-up.
- **Delivery latency.** Webhook delivery depends on the consumer endpoint's response time. A slow endpoint (approaching the 10-second timeout) delays the background worker. Mitigated by the per-request timeout and the async dispatch pattern.
- **Secret management.** Webhook secrets must be stored securely by consumers. If a secret is compromised, an attacker can forge webhook payloads. Consumers should treat the secret with the same care as API keys. Secret rotation is supported via `PUT /api/webhooks/{id}`.

### Neutral

- The retry worker runs on a 30-second polling interval. Events due for retry within the next 30 seconds may be delivered up to 30 seconds late. This is acceptable for the agent notification use case.
- The `webhook_events` table will grow proportionally to event volume. For high-volume deployments, add a TTL-based cleanup job to archive or delete `delivered` and `failed` records older than 30 days. This is a v2 operational task.

---

## Event Type Registry

The following events are defined in v1. New event types require a code change and documentation update.

| Event Type | Fired When |
|------------|-----------|
| `contact.created` | A new contact is saved |
| `contact.updated` | Any contact field changes |
| `contact.deleted` | A contact is archived/soft-deleted |
| `deal.created` | A new deal is saved |
| `deal.updated` | Any deal field changes (except stage) |
| `deal.stage_changed` | Deal moves to a new stage (active → active) |
| `deal.won` | Deal moves to a stage with `stage_type = 'won'` |
| `deal.lost` | Deal moves to a stage with `stage_type = 'lost'` |
| `activity.created` | An activity (call, email, meeting, etc.) is logged |
| `task.created` | A task is created |
| `task.completed` | A task is marked as complete |

**Event type validation:** When registering a webhook, the `events` array is validated against this registry. Unknown event types return `400 Bad Request`.
