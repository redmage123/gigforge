# CRM Platform — Architecture Overview

**Version:** 0.1 (Sprint 1 baseline)
**Date:** 2026-03-15
**Authors:** gigforge-engineer, gigforge-pm

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CRM Platform                            │
│                                                                 │
│  ┌──────────────┐     ┌──────────────────────────────────────┐  │
│  │  React SPA   │────▶│         FastAPI (uvicorn)            │  │
│  │  (Sprint 3)  │     │  /api/v1 — async, Pydantic v2        │  │
│  └──────────────┘     └──────────────┬───────────────────────┘  │
│                                      │ SQLAlchemy 2.x async      │
│  ┌──────────────┐     ┌──────────────▼───────────────────────┐  │
│  │  AI Agents   │────▶│       PostgreSQL 16                   │  │
│  │  (webhooks,  │     │  • pgcrypto, pg_trgm, btree_gin       │  │
│  │   bulk API)  │     │  • Row-level tenant isolation         │  │
│  └──────────────┘     │  • GIN trigram indexes (search)       │  │
│                        └──────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| API Framework | FastAPI | 0.110+ |
| ASGI Server | Uvicorn | 0.27+ |
| ORM | SQLAlchemy | 2.x async |
| Schema Validation | Pydantic | v2 |
| DB Driver | asyncpg | latest |
| Migrations | Alembic | 1.13+ |
| Database | PostgreSQL | 16 |
| Containerisation | Docker Compose | v2 |
| Authentication | JWT (python-jose) | HS256 |
| Password Hashing | bcrypt | cost=12 |
| Testing | pytest + pytest-asyncio | latest |
| Coverage | pytest-cov | ≥ 80% gate |

---

## Directory Structure

```
projects/crm/
├── backend/
│   ├── app/
│   │   ├── api/         — FastAPI routers (one file per resource)
│   │   ├── core/        — Dependencies, security, config
│   │   ├── models/      — SQLAlchemy ORM models
│   │   ├── schemas/     — Pydantic v2 request/response schemas
│   │   ├── services/    — Business logic (tenant-aware)
│   │   └── repositories/ — DB access layer (org_id always first filter)
│   ├── migrations/      — Alembic versions
│   ├── tests/
│   │   ├── unit/        — Mocked DB tests
│   │   └── integration/ — Real PostgreSQL tests
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/            — React + Vite (Sprint 3)
├── docs/
│   ├── adrs/            — Architecture Decision Records
│   ├── epics/           — Epic-level specs
│   ├── user-stories/    — Individual story files
│   ├── api/             — REST API spec
│   ├── sprints/         — Sprint plans
│   └── architecture/    — (this file)
├── kanban/board.md      — Kanban board (single source of truth)
└── docker-compose.yml
```

---

## Multi-Tenancy Pattern

**Strategy:** Row-level isolation with application-layer enforcement + PostgreSQL session variable as defence-in-depth.

Every tenant-scoped table carries `org_id UUID NOT NULL REFERENCES organizations(id)`.

**Enforcement chain:**
1. JWT includes `org_id` claim (set at login, signed with HS256)
2. `get_current_org_id` FastAPI dependency validates JWT + extracts `org_id`
3. `SET LOCAL app.tenant_id = '<uuid>'` executed on every DB session
4. Every repository method accepts `org_id` as first parameter; it is always the first `.where()` clause
5. Cross-tenant access returns `404` — existence is never revealed

**See:** `docs/adrs/ADR-001-multi-tenant-strategy.md`

---

## Authentication

- **Access token:** JWT HS256, 15-minute TTL, `jti` claim for blacklist lookup
- **Refresh token:** JWT, 7-day TTL, rotation on use, stored in DB
- **Logout:** `jti` written to `token_blacklist` table; cleaned up on expiry
- **AI agents:** `is_agent = true` users; password-less; system-issued JWTs

**See:** `docs/adrs/ADR-002-authentication.md`

---

## RBAC

Four roles (stored in JWT): `admin` | `manager` | `agent` | `viewer`

- `require_role(*roles)` dependency factory — composable, no DB lookup at check time
- `agent` role ownership checks applied at service layer, not route level

---

## Repository Pattern

All database access goes through typed repository classes:

```python
class ContactRepository:
    async def get(self, session, org_id, contact_id) -> Contact | None: ...
    async def list(self, session, org_id, *, filters, pagination) -> Page[Contact]: ...
    async def create(self, session, org_id, data) -> Contact: ...
    async def update(self, session, org_id, contact_id, data) -> Contact: ...
    async def soft_delete(self, session, org_id, contact_id) -> None: ...
```

`org_id` is always the second parameter (after `session`) and always the first DB filter.

---

## Testing Strategy

| Layer | Framework | Coverage Gate |
|-------|----------|---------------|
| Unit | pytest + unittest.mock | ≥ 80% |
| Integration | pytest-asyncio + real PostgreSQL | All acceptance criteria |
| Tenant isolation | `tests/test_tenant_isolation.py` | Cross-tenant leak = instant fail |
| CI gate | `docker compose exec api pytest --cov` | Blocks merge if < 80% |

---

## ADRs

| ADR | Decision | Status |
|-----|---------|--------|
| ADR-001 | Multi-tenant strategy: row-level isolation + PostgreSQL RLS | Accepted |
| ADR-002 | Authentication: JWT HS256, 15-min access / 7-day refresh | Accepted |
| ADR-003 | Audit logging: immutable append-only table | Accepted |
| ADR-004 | Custom fields: sparse-column EAV vs JSONB | Pending |

---

## Future Sprints

| Sprint | Focus |
|--------|-------|
| Sprint 1 | Foundation, Auth, Contacts/Companies/Tags CRUD |
| Sprint 2 | Search, Custom Fields, Pipelines, Deals |
| Sprint 3 | Activities/Tasks, Dashboard/Analytics, Agent API (webhooks), React Frontend |
| Sprint 4 | Import/Export, Email integration, Audit dashboard, Production hardening |
