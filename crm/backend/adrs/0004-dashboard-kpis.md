# ADR-0004: Dashboard KPIs Strategy

**Date:** 2026-03-16
**Status:** ACCEPTED
**Deciders:** gigforge-engineer (architecture), gigforge-dev-backend (implementation)
**Story:** US-050

---

## Context

The CRM dashboard requires a set of KPI metrics displayed on the home screen for the authenticated user's tenant:

- Total contacts (active)
- Contacts added this week
- Total open deals
- Deals won this month
- Deals lost this month
- Open pipeline value by pipeline (sum of deal values)
- Activities logged this week
- Overdue tasks

Three implementation strategies were considered:

### Option A — Multiple independent queries (N+1)
Each KPI is a separate, independently-structured query. The router calls a different function per metric and assembles the response.

**Pros:** Simple to add/remove individual KPIs; each query is independently testable
**Cons:** 7–8 sequential round-trips per request; latency compounds at scale; no atomicity — metrics from different moments in time

### Option B — Single aggregate query (chosen)
All KPIs are computed in a single `get_kpis(tenant_id)` repository method. Each metric is its own SQL query inside the method, but all share one DB session and execute within the same logical read.

**Pros:** One repo method, one route handler, easy to cache; no N+1; all metrics share the same time reference (`now`); minimal overhead per request
**Cons:** Slightly harder to add a single new metric (must touch `get_kpis`); not parallelised (sequential awaits within one method)

### Option C — Materialized view
Pre-compute KPIs as a PostgreSQL materialised view, refreshed on a schedule or via triggers.

**Pros:** Fastest read path; zero per-request computation
**Cons:** Staleness risk (refresh lag); requires DDL + maintenance infrastructure; trigger complexity; premature optimisation for Sprint 1 usage volume

---

## Decision

**Option B — Single aggregate query method in `DashboardRepository.get_kpis()`.**

Each metric is a separate `SELECT … WHERE tenant_id = ?` with `func.count()` or `func.sum()`. All share one async session. The dashboard router is a single thin handler:

```python
@router.get("/kpis")
async def get_kpis(current_user=Depends(get_current_user), db=Depends(get_db)):
    return await DashboardRepository(db).get_kpis(tenant_id=current_user.tenant_id)
```

No business logic in the route. No raw SQL f-strings. Full DAO compliance.

---

## Consequences

- **No N+1.** 7 scalar queries per request; all use parameterised SQLAlchemy expressions.
- **Tenant isolation enforced.** Every query is filtered by `tenant_id`. Cannot leak cross-tenant data.
- **Time consistency.** A single `now = datetime.now(timezone.utc)` reference is computed once at the top of `get_kpis()` and reused across all metric queries, so "this week" and "this month" windows are identical across all KPIs in a single response.
- **Sprint 2 upgrade path.** If query latency becomes an issue, `get_kpis()` queries can be parallelised with `asyncio.gather()` without changing the API or the route handler. Materialized view can be added later with no public API change.
- **Adding new KPIs** requires adding a query inside `get_kpis()` and adding the key to the return dict. Unit tests must cover the new metric.
- **Response schema** is `Dict[str, Any]` for Sprint 1; a typed Pydantic `KPIResponse` schema should be introduced in Sprint 2 to lock the contract.
