# ADR-001: Multi-Tenancy Strategy

**Status:** Accepted
**Date:** 2026-03-15
**Author:** gigforge-engineer
**Context:** GigForge + TechUni CRM Platform

---

## Context

The CRM platform serves two organizations — GigForge and TechUni — on shared infrastructure. Both orgs share:

- A single PostgreSQL 16 database cluster
- A single FastAPI application deployment
- A single set of Docker containers / deployment unit

The fundamental requirement is **data isolation**: a GigForge user must never see, modify, or infer the existence of TechUni's contacts, deals, or any other records — and vice versa. This isolation must hold even in the presence of application bugs, misconfigured queries, or accidental omission of filters.

Additionally, the platform must support AI agents (e.g. `gigforge-sales`, `gigforge-scout`) that authenticate programmatically and query the API. These agents have the same isolation requirements as human users.

The platform is expected to grow to support additional organizations (e.g. future clients of the AI Elevate agency offering), so the tenancy model must be extensible without requiring re-architecture.

---

## Decision

We adopt **row-level tenancy**: every tenant-scoped table carries an `org_id UUID NOT NULL` column that is a foreign key to the `organizations` table. Tenant isolation is enforced at the application layer through a combination of:

1. **JWT claims** — every authenticated JWT contains an `org_id` claim that identifies the tenant.
2. **FastAPI dependency injection** — a shared `get_current_org_id()` dependency extracts `org_id` from the decoded JWT and injects it into every route handler.
3. **Repository pattern** — all database access is mediated by repository classes. Every repository method receives `org_id` as a required first parameter and includes it as the first `WHERE` clause in every SQL query.
4. **SQLAlchemy filter convention** — `org_id` is always added as the first filter, before any other conditions, on every query against a tenant-scoped table.

**The `org_id` filter is never optional.** It is not a default argument. It is a required parameter that every repository method must receive from the route layer.

### Schema Convention

Every tenant-scoped table follows this pattern:

```sql
CREATE TABLE contacts (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    -- ... other columns
);

CREATE INDEX idx_contacts_org_... ON contacts (org_id, ...);
```

The `org_id` column is the first column in every composite index, ensuring PostgreSQL can use the index for any tenant-scoped query.

### Tables that are NOT tenant-scoped

Only the `organizations` table itself is global. All other tables are tenant-scoped.

---

## Alternatives Considered

### Alternative 1: Schema-per-Tenant

Each tenant gets its own PostgreSQL schema (e.g. `gigforge.contacts`, `techuni.contacts`). Queries are routed by setting `search_path` at the connection level.

**Why rejected:**
- Schema management complexity explodes as tenant count grows. Adding a column or index requires running DDL across every tenant schema.
- Alembic does not natively support multi-schema migrations — workarounds are fragile and error-prone.
- Connection pooling (PgBouncer) is significantly more complex with schema-level routing.
- `search_path` manipulation in async SQLAlchemy sessions is unreliable and has caused production incidents at companies that adopted this pattern.
- Offers marginally stronger isolation than row-level, but not enough to justify the operational cost.

### Alternative 2: Database-per-Tenant

Each tenant gets its own PostgreSQL database instance (or at minimum, a separate database on the same cluster).

**Why rejected:**
- At two tenants, the operational overhead is manageable — but the pattern does not scale gracefully to 10, 50, or 500 tenants.
- Cross-tenant analytics (e.g. platform-wide revenue reporting by the `gigforge-finance` agent) becomes impossible without a federated query layer (e.g. PostgreSQL foreign data wrappers), which adds significant complexity.
- Database connection pools must be maintained per-tenant, multiplying resource consumption.
- Alembic migrations must be run against each database independently.
- Backup and restore procedures multiply in complexity.

### Alternative 3: Row-Level Security (PostgreSQL RLS)

Use PostgreSQL's native Row Security Policies to enforce `org_id` filtering at the database level, independent of the application.

**Why not adopted as the primary mechanism:**
- RLS policies require setting a session variable (e.g. `SET app.current_org_id = 'uuid'`) at the start of every database connection/transaction. This is fragile in async connection pools where connections are reused across requests.
- SQLAlchemy async sessions do not have first-class support for per-request session variables; workarounds are complex.
- Debugging RLS failures is significantly harder than debugging application-layer filtering bugs.
- RLS adds a secondary enforcement layer on top of the application filter, not a replacement for it — both must still be correct.

**RLS is earmarked as a defense-in-depth addition** in a future security hardening phase. When implemented, it will be an additional layer on top of the application-layer enforcement described in this ADR, not a replacement.

---

## Consequences

### Positive

- **Operational simplicity.** One database, one schema, one Alembic migration set. Schema changes (new columns, indexes) are applied once and affect all tenants immediately.
- **Efficient resource use.** PostgreSQL connection pools are shared across all tenants. No per-tenant connection overhead.
- **Cross-tenant analytics.** Platform-level reporting (e.g. aggregate revenue across all orgs) is straightforward SQL across the shared `organizations` and `audit_log` tables.
- **Extensible.** Adding a third tenant requires only inserting a row in `organizations` and creating the org's seed data (pipeline stages, admin user). No infrastructure changes.

### Negative / Risks

- **Application-layer vigilance required.** Every developer (and every AI agent writing repository code) must remember to include the `org_id` filter. A missing filter is a data leak. This is mitigated by:
  - The repository pattern making `org_id` a required parameter (not optional).
  - Integration tests that deliberately test cross-org isolation (attempt to access Org B's records with Org A's JWT and assert `404`).
  - Code review checklist item: "Does every query include `org_id`?"
- **Composite index discipline.** Every index on tenant-scoped tables must start with `org_id`. An index that does not begin with `org_id` will not be used by tenant-scoped queries and will degrade to a full table scan.
- **Cascading deletes.** Deleting an org cascades to all its data. This is the correct behaviour but must be protected by admin-only authorization and an explicit confirmation mechanism.

### Neutral

- **No row-level security in v1.** This is a known accepted risk. It will be revisited in a security hardening sprint. The application-layer enforcement is tested and audited.
- **`audit_log` is the safety net.** Every write operation is logged with `org_id`, `actor_id`, and `changes`. If a cross-tenant data exposure ever occurs, the audit log provides a forensic trail.

---

## Implementation Notes

### Repository Base Class

```python
# app/repositories/base.py

from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Base

class TenantRepository:
    """
    Base class for all repositories.
    Subclasses MUST pass org_id to every query method.
    Never query without org_id — this is not negotiable.
    """

    model: type[Base]

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, org_id: UUID, record_id: UUID):
        stmt = (
            select(self.model)
            .where(self.model.org_id == org_id)  # tenant gate — always first
            .where(self.model.id == record_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
```

### Cross-Org Isolation Test Pattern

```python
# tests/test_isolation.py

async def test_contact_isolation(client_gigforge, client_techuni, gigforge_contact):
    """
    GigForge contact must not be accessible via TechUni credentials.
    Must return 404, not 403, to avoid leaking existence.
    """
    response = await client_techuni.get(f"/api/contacts/{gigforge_contact.id}")
    assert response.status_code == 404
```

This test pattern must exist for every resource type (contacts, companies, deals, activities, tasks).
