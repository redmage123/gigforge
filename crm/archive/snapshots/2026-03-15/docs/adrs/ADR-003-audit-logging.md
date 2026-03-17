# ADR-003: Audit Logging Strategy

**Status:** Accepted
**Date:** 2026-03-15
**Deciders:** gigforge-engineer, gigforge-pm

---

## Context

The CRM handles commercially sensitive data (deals, contacts, pricing). Tenants
need a tamper-evident record of who changed what and when, for:
- Internal accountability (who deleted that contact?)
- Compliance (GDPR data-access logging)
- Incident investigation
- Webhook event sourcing

---

## Decision

**Application-layer audit log written to the `audit_log` table, with JSONB
snapshots of the entity state before and after each mutation.**

### Schema

```
audit_log(
  id          UUID PK,
  tenant_id   UUID FK → tenants,
  user_id     UUID FK → users (nullable — system actions),
  action      TEXT,        -- create | update | delete | login | export | import
  entity_type TEXT,        -- contact | deal | company | user | …
  entity_id   TEXT,        -- UUID of the mutated entity
  old_data    JSONB,       -- pre-mutation snapshot (null for creates)
  new_data    JSONB,       -- post-mutation snapshot (null for deletes)
  created_at  TIMESTAMPTZ  -- immutable; no updated_at
)
```

### How logs are written

A `@audit` Python decorator wraps service-layer functions. It:
1. Reads the current DB state before the mutation (`old_data`)
2. Executes the mutation
3. Reads the new state after commit (`new_data`)
4. Writes an `AuditLog` row in the same transaction

Because it runs in the same transaction, the audit row is atomically consistent
with the mutation — if the mutation rolls back, the audit row rolls back too.

### Sensitive field exclusion

Before writing `old_data`/`new_data`, the decorator strips:
- `password_hash`
- Webhook `secret`
- Any field listed in `AUDIT_EXCLUDE_FIELDS` env var

---

## Alternatives Considered

| Option | Reason Rejected |
|--------|----------------|
| PostgreSQL triggers | Logic lives in the database — hard to test, hard to strip sensitive fields, requires DB-level deployment changes |
| Temporal tables / pgaudit extension | `pgaudit` logs all SQL — too noisy, not tenant-scoped, hard to surface in the UI |
| Event streaming (Kafka/Redis Streams) | Durable event bus is correct at scale but adds infra complexity for V1 |
| Separate audit microservice | Correct at scale; premature for a two-tenant V1 |

---

## Consequences

**Positive:**
- Audit rows are co-located with application data — simple JOIN queries for the
  audit timeline UI
- JSONB diffs let the UI show exactly what changed ("value: $5,000 → $7,500")
- Written in the same transaction as the mutation — no eventual consistency lag

**Negative:**
- `audit_log` table will grow indefinitely; requires a retention policy
  (recommendation: partition by `created_at` month after 1M rows)
- Large JSONB blobs for entities with many fields — mitigated by stripping
  computed/derived fields before serialisation
- If the application crashes after commit but before writing the audit row
  (impossible — same transaction), no gap. Risk: a bug in the decorator could
  silently skip logging. Mitigated by: unit tests on the decorator, and a
  separate `audit_log_gaps` health check that periodically counts mutations
  without corresponding audit rows.

---

## Retention Policy (planned V2)

- Partition `audit_log` by `RANGE (created_at)` — monthly partitions
- Detach and archive partitions older than 2 years to cold storage (S3/GCS)
- Expose `/api/v1/export/audit` endpoint for GDPR data-portability requests
