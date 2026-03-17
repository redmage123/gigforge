# ADR-001: Multi-Tenant Strategy

**Status:** Accepted
**Date:** 2026-03-15
**Deciders:** gigforge-engineer, gigforge-pm

---

## Context

The CRM must serve two tenants with fully isolated data — GigForge (freelance
consultancy) and TechUni (edtech platform) — sharing a single PostgreSQL
instance and a single FastAPI application.

Three strategies were evaluated:

| Strategy | Description | Pros | Cons |
|----------|-------------|------|------|
| **Database-per-tenant** | Separate PostgreSQL database per tenant | Strongest isolation; easy backup/restore per tenant | Operational complexity; connection pooling is hard; N databases to migrate |
| **Schema-per-tenant** | Separate PostgreSQL schema (namespace) per tenant | Good isolation; single DB server | Alembic multi-schema migrations are complex; connection pooling requires search_path tricks |
| **Row-level isolation** | Single schema, `tenant_id` FK on every table, PostgreSQL RLS | Simple migrations; easy horizontal scaling; works with any connection pooler | Requires disciplined FK enforcement; "noisy neighbour" risk at extreme scale |

---

## Decision

**Row-level isolation with PostgreSQL Row Level Security (RLS).**

Every table that holds tenant-owned data carries a `tenant_id UUID NOT NULL`
column with a FK to `tenants`. At the database layer, RLS policies are applied
on all tenant-owned tables using `current_setting('app.tenant_id')::uuid`.

The application middleware sets this session variable on every request:

```sql
SET LOCAL app.tenant_id = '<tenant-uuid-from-jwt>';
```

This means a query that accidentally omits a `WHERE tenant_id = ?` filter is
still blocked by the database — defence in depth.

FastAPI middleware (`TenantMiddleware`) extracts `tenant_id` from the validated
JWT and injects it into every SQLAlchemy session via `EXECUTE 'SET LOCAL ...'`.

---

## Consequences

**Positive:**
- Single Alembic migration tree — all tenants share the same schema version
- Works with PgBouncer transaction pooling (SET LOCAL is transaction-scoped)
- Straightforward horizontal scaling via read replicas
- Easy cross-tenant analytics (admin queries bypass RLS via `SET row_security = off`)

**Negative:**
- All tenant data lives in the same tables — a misconfigured RLS policy could
  theoretically expose cross-tenant data. Mitigated by: integration tests that
  explicitly verify cross-tenant isolation, and periodic RLS policy audits.
- Tenant data cannot be independently archived to separate storage without
  export tooling (acceptable; export endpoint covers this).

---

## Implementation Notes

- `tenant_id` is always a `UUID` (not integer) to avoid enumeration attacks
- The `tenants` table itself has no RLS (it holds public slugs only)
- Service accounts used for migrations run with `SET row_security = off`
- RLS is tested in `tests/test_tenant_isolation.py` — cross-tenant leak tests
  run on every CI build
