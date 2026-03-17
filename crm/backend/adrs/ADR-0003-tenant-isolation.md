# ADR-0003: Tenant Isolation Strategy — App-Layer Filtering vs PostgreSQL RLS

**Status:** ACCEPTED
**Date:** 2026-03-15
**Author:** gigforge-engineer
**Reviewed by:** gigforge-pm

---

## Context

The CRM is multi-tenant: GigForge and TechUni share a single PostgreSQL instance and database. Every tenant-scoped table has a `tenant_id` column. We must ensure that a user from Tenant A can never read or write data belonging to Tenant B.

**Options:**

1. **App-layer filtering** — every DAO query includes `WHERE tenant_id = :current_tenant_id`. Enforced by code conventions, reviewed in PRs.
2. **PostgreSQL Row-Level Security (RLS)** — define RLS policies on each table; the database engine enforces isolation at the storage layer regardless of what SQL the app generates.
3. **Hybrid** — app-layer filtering as the primary mechanism + RLS as a defence-in-depth backstop.

---

## Decision

**Use hybrid: app-layer filtering (primary) + PostgreSQL RLS (backstop).**

### App-layer filtering

The `tenant_id` is extracted from the JWT token by `TenantMiddleware` and stored on the request state:

```python
class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        token = extract_jwt(request)
        request.state.tenant_id = token["tenant_id"]
        return await call_next(request)
```

Every DAO base class receives `tenant_id` at construction and automatically scopes queries:

```python
class BaseDAO:
    def __init__(self, session: AsyncSession, tenant_id: UUID):
        self._session = session
        self._tenant_id = tenant_id

    def _tenant_filter(self, model_class):
        return model_class.tenant_id == self._tenant_id
```

Any DAO that forgets to apply `_tenant_filter` will be caught in code review and in the cross-tenant isolation test suite.

### RLS policies (defence in depth)

Applied in the Alembic migration for every tenant-scoped table:

```sql
-- Enable RLS on each table
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Create policy: the app connects as role 'crm_app'; its tenant_id is
-- set per-transaction via SET LOCAL app.current_tenant_id = '<uuid>';
CREATE POLICY tenant_isolation ON contacts
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

The DAO base class sets the session variable at transaction start:

```python
await session.execute(
    text("SET LOCAL app.current_tenant_id = :tid"),
    {"tid": str(self._tenant_id)},
)
```

---

## Rationale

**Why app-layer filtering as primary:**
- Simpler to develop against — no need to set session variables on every transaction.
- Easier to test — unit tests can mock the session without the RLS machinery.
- Standard pattern in FastAPI/SQLAlchemy multi-tenant apps; the dev team knows it.

**Why RLS as backstop:**
- A future developer forgets `tenant_id` in a raw query → RLS catches it at the DB layer.
- Protects against SQL injection attacks that bypass the ORM.
- Satisfies security-conscious enterprise clients who ask "what happens if the app has a bug?"

**Why not RLS alone:**
- RLS session variable must be set before every query — this is ORM-unfriendly and adds boilerplate.
- Debugging is harder when isolation is enforced invisibly at the DB layer.
- The async SQLAlchemy session lifecycle makes `SET LOCAL` trickier to manage reliably.

---

## Consequences

- `TenantMiddleware` must be registered before any route that touches the DB.
- Every DAO must inherit `BaseDAO` and apply `_tenant_filter` to every query.
- Alembic migration must enable RLS on all tenant-scoped tables and create the isolation policy.
- The `crm_app` database role must NOT have superuser privileges (RLS is bypassed for superusers).
- Integration tests must include a dedicated cross-tenant suite that confirms data from Tenant A is not accessible to Tenant B.
- `gigforge-qa` must run cross-tenant tests before the sprint is marked done.
