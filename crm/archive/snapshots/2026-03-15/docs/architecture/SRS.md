# Software Requirements Specification
## CRM Platform — GigForge + TechUni

**Document version:** 2.0
**Date:** 2026-03-15
**Status:** Ready for review
**Authors:** gigforge-engineer
**API base URL:** `https://api.crm.ai-elevate.ai`
**Frontend URL:** `https://crm.ai-elevate.ai`

> **v2.0 changes from v1.0:** Cursor-based pagination; soft-delete model; `org_slug`-scoped login; flat single-pipeline stage model with `stage_type`; `deal_stage_history` table; enriched Activity schema (`occurred_at`, `duration_minutes`, `outcome`); Task completion via `PATCH /tasks/{id}/complete`; webhook delivery history and retry policy; `multi_select` custom field type; richer Dashboard KPIs (weighted pipeline, avg deal size, by-owner breakdown). All sections updated to match the authoritative API spec and SQLAlchemy models.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Architecture](#2-system-architecture)
3. [Functional Requirements](#3-functional-requirements)
4. [Non-Functional Requirements](#4-non-functional-requirements)
5. [API Specification](#5-api-specification)
6. [Database Schema](#6-database-schema)
7. [Frontend Specification](#7-frontend-specification)
8. [Integration Points](#8-integration-points)
9. [Testing Strategy](#9-testing-strategy)
10. [Deployment](#10-deployment)

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) is the **single authoritative source of truth** for the CRM Platform serving GigForge and TechUni. It defines all functional requirements, system architecture, database schema, API contracts, frontend specification, integration points, testing strategy, and deployment procedures.

Any discrepancy between this document and code or other documentation is resolved in favour of this SRS, unless a superseding ADR exists in `docs/adrs/`.

### 1.2 Scope

The CRM Platform provides:

- Contact, company, and deal lifecycle management with owner-scoped visibility
- Single customisable sales pipeline with typed stages (active/won/lost), Kanban view, and immutable stage-transition history
- Activity timeline (calls, emails, meetings, demos) with outcome tracking
- Task management with priority, due-dates, and completion workflow
- Dashboard KPIs: pipeline value, weighted forecast, conversion rates, per-owner breakdowns
- Agent API — JWT-authenticated REST endpoints consumed by GigForge and TechUni AI agents
- Webhook event delivery with HMAC signing, delivery history, and retry policy
- Tenant-defined custom fields (text, number, date, boolean, select, multi_select) for contacts, companies, and deals
- Full-text global search (GIN trigram)
- Async CSV import / streaming CSV export
- Immutable audit log (every state-changing operation)
- Multi-tenant row-level data isolation (GigForge and TechUni share one PostgreSQL instance)

### 1.3 Definitions and Acronyms

| Term | Definition |
|------|-----------|
| **Organisation / Org** | A tenant in the CRM (GigForge or TechUni). Identified externally by `org_slug`. |
| **`org_id`** | UUID of the organisation, embedded in every JWT and returned in API responses. |
| **`tenant_id`** | Internal SQLAlchemy column name for the same UUID (synonymous with `org_id` at the DB layer). |
| **Contact** | An individual person (lead, prospect, customer, or partner). |
| **Company** | An organisation that contacts may belong to. |
| **Deal** | A sales opportunity moving through the pipeline towards won or lost. |
| **Pipeline Stage** | A single named step in the pipeline. Has a `stage_type`: `active`, `won`, or `lost`. |
| **Stage Type** | Classification of a stage: `active` (in-progress), `won` (closed-won), `lost` (closed-lost). One `won` stage and one `lost` stage per org. |
| **DealStageHistory** | An immutable row appended every time a deal moves to a different stage. |
| **Activity** | A logged interaction: call, email, meeting, demo, note, or task_complete. |
| **Task** | A to-do item with assignee, due date, and completion workflow. |
| **Custom Field** | A tenant-defined metadata field (type: text/number/date/boolean/select/multi_select). |
| **Tag** | A colour-coded label applicable to contacts, companies, and deals. |
| **Webhook** | An outbound HTTP callback triggered by a CRM event, with HMAC-signed payload. |
| **Audit Log** | An immutable per-row ledger of every state-changing operation. |
| **RLS** | PostgreSQL Row Level Security — database-enforced org isolation. |
| **JWT** | JSON Web Token — signed bearer credential for API authentication. |
| **RBAC** | Role-Based Access Control — four roles: admin, manager, agent, viewer. |
| **Owner** | The user responsible for a contact or deal (`owner_id` column). |
| **GIN** | Generalised Inverted Index — PostgreSQL index type for trigram full-text search. |
| **Cursor pagination** | Stateless pagination using an opaque cursor (base64-encoded last-row UUID). |
| **Soft-delete** | Marking a record as archived/lost rather than removing it from the database. |
| **ADR** | Architecture Decision Record (`docs/adrs/`). |
| **SRS** | This document — Software Requirements Specification. |

### 1.4 Product Perspective

The CRM is a standalone multi-tenant platform accessible via:
- **Browser dashboard** — React SPA at `https://crm.ai-elevate.ai`
- **REST API** — FastAPI backend at `https://api.crm.ai-elevate.ai`
- **Agent API** — the same REST API consumed programmatically by GigForge and TechUni AI agents

Two organisations share a single PostgreSQL instance and a single API deployment. Data isolation is enforced at both the application layer (JWT `org_id` claim + middleware that issues `SET LOCAL app.tenant_id`) and the database layer (PostgreSQL RLS policies). No org can read, write, or discover records belonging to another org; cross-org references return `404`, not `403`, to prevent existence disclosure.

### 1.5 User Classes and Roles

| Role | Visibility | Create/Edit | Delete | Admin actions |
|------|-----------|-------------|--------|---------------|
| **Viewer** | All org records | No | No | No |
| **Agent** | Only records they **own** (`owner_id = self`) or are **assigned to** | Yes (own records) | No | No |
| **Manager** | All org records | Yes (any record) | Yes | Pipeline stages, tags |
| **Admin** | All org records | Yes (any record) | Yes | Users, webhooks, custom fields, all manager actions |

An `agent` also carries an `is_agent: bool` flag in the JWT for machine-client identification (e.g. GigForge AI pipeline agent).

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
+---------------------------------------------------------------------+
|                          CLIENTS                                    |
|  +----------------------+      +-----------------------------+      |
|  |  Browser Dashboard   |      |  AI Agents / External Apps  |      |
|  |  React 18 + Vite     |      |  (GigForge, TechUni agents) |      |
|  +----------+-----------+      +--------------+--------------+      |
+-------------+-----------------------------------+-----------------  +
              | HTTPS                             | HTTPS + JWT Bearer
              v                                   v
+---------------------------------------------------------------------+
|                NGINX REVERSE PROXY / TLS TERMINATION               |
|       crm.ai-elevate.ai  <->  api.crm.ai-elevate.ai               |
+----------------------------------+----------------------------------+
                                   |
               +-------------------+--------------------+
               v                                        v
+----------------------+          +------------------------------------+
|  STATIC FRONTEND     |          |    FASTAPI APPLICATION (uvicorn)   |
|  React + Vite build  |          |                                    |
|  (nginx-served)      |          |  Middleware chain:                 |
+----------------------+          |  JWTAuth -> OrgScope -> RBAC       |
                                  |                                    |
                                  |  API routers (10 groups)           |
                                  |  Service layer + audit decorator   |
                                  |  SQLAlchemy 2.x async ORM          |
                                  +------------------+-----------------+
                                                     |
                          +--------------------------+------------------+
                          v                          v                  v
              +------------------+     +-----------------+  +------------------+
              |  POSTGRESQL 16   |     |     REDIS        |  |  BACKGROUND      |
              |                  |     |                   |  |  WORKERS         |
              | - All CRM data   |     | - JWT deny-list   |  |                  |
              | - RLS policies   |     | - Rate-limit      |  | - CSV import     |
              | - GIN indexes    |     |   counters        |  | - Webhook        |
              | - Alembic-managed|     |                   |  |   delivery+retry |
              +------------------+     +-----------------+  +------------------+
```

### 2.2 Component Breakdown

#### React Frontend
- React 18, Vite, TypeScript
- Tailwind CSS (dark theme, CSS variable design tokens)
- React Router v6 (client-side routing, protected routes)
- TanStack Query v5 (server state, caching, optimistic updates)
- Zustand (auth token, org context)
- dnd-kit (Kanban drag-and-drop)
- Recharts (dashboard charts and funnel)
- Headless UI (accessible modals, dropdowns)

#### FastAPI Backend
- FastAPI 0.111+, Python 3.12, uvicorn
- SQLAlchemy 2.x with async engine (asyncpg driver)
- Pydantic v2 (all request/response validation)
- python-jose (JWT RS256 signing and verification)
- passlib + bcrypt (password hashing, cost factor >= 12)
- Background tasks: FastAPI BackgroundTasks (webhooks), ARQ (CSV import)
- structlog + JSON formatter (structured logging)

#### PostgreSQL 16
- Single database, single schema (`public`)
- Extensions: `pgcrypto` (UUID generation), `pg_trgm` (trigram search)
- Row Level Security on all org-scoped tables
- Alembic migrations (initial: `0001_initial_schema.py`)

#### Redis
- JWT access-token `jti` deny-list (logout invalidation)
- Rate-limit sliding-window counters per user/org
- Optional: short-TTL cache for dashboard aggregates

### 2.3 Multi-Tenancy Model

Every org-scoped table carries:
```sql
tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
```

On every authenticated request the OrgScopeMiddleware executes:
```sql
SET LOCAL app.tenant_id = '<org-uuid-from-jwt>';
```

PostgreSQL RLS policies enforce:
```sql
CREATE POLICY tenant_isolation ON <table>
USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

A query that omits `WHERE tenant_id = ?` is still silently scoped to the caller's org — defence in depth. Cross-org references always return `404` to avoid leaking existence information. See ADR-001.

### 2.4 Authentication and Authorisation Flow

```
[Client]                    [FastAPI]                    [Redis] [DB]
   |                            |                           |      |
   |-- POST /api/auth/login --> |                           |      |
   |   {email, password,        |                           |      |
   |    org_slug}               |-- lookup org by slug ------------>|
   |                            |-- bcrypt verify ------------------>|
   |                            |-- gen access_token (RS256, 15m)   |
   |                            |-- gen refresh_token (RS256, 7d)   |
   |<-- 200 + tokens -----------|                           |      |
   |                            |                           |      |
   |-- GET /api/contacts -----> |                           |      |
   |   Authorization: Bearer    |-- validate sig + expiry   |      |
   |                            |-- check jti deny-list --->|      |
   |                            |-- SET LOCAL app.tenant_id |      |
   |                            |-- query (RLS scopes) ------------>|
   |<-- 200 + contacts ---------|                           |      |
   |                            |                           |      |
   |-- POST /api/auth/logout -->|                           |      |
   |                            |-- jti -> Redis (TTL=remaining)    |
   |<-- 204 --------------------|                           |      |
```

**JWT payload structure:**
```json
{
  "sub":      "user-uuid",
  "org_id":   "org-uuid",
  "role":     "agent",
  "is_agent": false,
  "jti":      "unique-token-id",
  "iat":      1710000000,
  "exp":      1710000900
}
```

### 2.5 Data Flow — Deal Stage Move

```
[Frontend / Agent]    [Router]     [Service]              [DB]
      |                  |              |                    |
      |-- PUT /deals/{id}/stage ------> |                    |
      |   {stage_id, note, prob}        |                    |
      |                  |-- validate ->|                    |
      |                  |              |-- load deal ------->|
      |                  |              |-- load target stage->|
      |                  |              |-- UPDATE deals.stage_id ->|
      |                  |              |-- INSERT deal_stage_history ->|
      |                  |              |-- UPDATE deal.status? ------->|
      |                  |              |-- write audit_log ----------->|
      |                  |              |-- COMMIT           |
      |                  |<-- deal obj -|                    |
      |<-- 200 + deal ---|              |                    |
      |                  |-- fire webhook (background)       |
```

---

## 3. Functional Requirements

Requirements tagged: **Priority** P0 (MVP blocker) / P1 (Sprint 1-2) / P2 (Sprint 3-4). **Min role** = minimum RBAC role required.

---

### 3.1 Authentication and User Management

| ID | Requirement | Priority | Min role |
|----|-------------|----------|----------|
| FR-001 | Users authenticate with `email` + `password` + `org_slug`. Email uniqueness is scoped per org (the same email may exist in two orgs). | P0 | — |
| FR-002 | Successful login returns a JWT access token (RS256, 15 min) and a JWT refresh token (RS256, 7 days). Both tokens are returned in the response body. | P0 | — |
| FR-003 | Refresh tokens are **rotated** on every use. The old refresh token is blacklisted; a new access token and refresh token are issued. | P0 | — |
| FR-004 | Logout blacklists the current access token's `jti` in Redis with TTL equal to the token's remaining lifetime. All subsequent requests with that token receive `401`. | P0 | viewer |
| FR-005 | `POST /api/auth/register` supports two modes: `new_org` (creates org + initial admin, no auth required) and `add_user` (adds user to existing org, admin JWT required). | P0 | — / admin |
| FR-006 | Admins can change a user's role and deactivate their account (`is_active = false`). Deactivated users cannot log in. | P1 | admin |
| FR-007 | Passwords are hashed with bcrypt (cost >= 12). Plaintext passwords are never stored, returned, or logged. | P0 | — |
| FR-008 | All endpoints except `POST /api/auth/login` and `POST /api/auth/register` (new_org mode) require a valid JWT. Missing or expired tokens return `401`. | P0 | — |
| FR-009 | RBAC is enforced per endpoint. Insufficient role returns `403`. | P0 | — |
| FR-010 | `agent` role users see only contacts and deals where `owner_id = self` or `assigned_to = self`. All other roles see all org records. | P0 | — |

---

### 3.2 Contact Management

| ID | Requirement | Priority | Min role |
|----|-------------|----------|----------|
| FR-011 | Create a contact with: first_name, last_name, email, phone, company_id, contact_type, status, source, notes, owner_id, tag_ids, custom_fields. At least one of first_name, last_name, or email is required. | P0 | agent |
| FR-012 | Contact types: `lead`, `prospect`, `customer`, `partner`. Contact statuses: `active`, `inactive`, `archived`. | P0 | — |
| FR-013 | List contacts with cursor-based pagination (default 50/page, max 200). | P0 | viewer |
| FR-014 | Contact list filters: owner_id, contact_type, status, company_id, tag_id, source, `q` (search), created date range. Sort: last_name, created_at, updated_at. | P0 | viewer |
| FR-015 | Contact full-text search (`q`) uses PostgreSQL GIN trigram on `first_name || ' ' || last_name || ' ' || email`. Target: <= 100 ms at 100k contacts. | P0 | viewer |
| FR-016 | `GET /api/contacts/search` — dedicated similarity-ranked endpoint (not paginated, limit <= 50), returns `similarity` score per result. | P1 | viewer |
| FR-017 | PUT (full replace, min role: agent/own or manager) and PATCH (partial update) for contacts. | P0 | agent/manager |
| FR-018 | DELETE contact performs a **soft-delete**: sets `status = 'archived'`. Hard deletion not supported in V1. | P1 | manager |
| FR-019 | Contact detail embeds: company summary, tags, custom field values with metadata, open_deals_count, open_tasks_count, activities_count, last_activity_at, recent activities (5), open tasks (5). | P1 | viewer |
| FR-020 | Tags added via `POST /api/contacts/{id}/tags`, removed via `DELETE /api/contacts/{id}/tags/{tag_id}`. Re-adding an existing tag returns `409`. | P1 | agent(own)/manager |
| FR-021 | Custom field values are stored in contact's `custom_fields` JSONB column keyed by `definition_id`. | P1 | — |
| FR-022 | Async CSV import (`POST /api/contacts/import`). Returns `import_id`. Fires `contact.bulk_imported` webhook on completion. | P2 | manager |
| FR-023 | Streaming CSV export (`GET /api/contacts/export`). Accepts all list-endpoint filters. Max 100k rows. | P2 | manager |

---

### 3.3 Company Management

| ID | Requirement | Priority | Min role |
|----|-------------|----------|----------|
| FR-024 | Create a company with: name, domain, industry, size, website, phone, address (structured object: street/city/state/zip/country), notes. | P0 | agent |
| FR-025 | List companies with cursor pagination and filters: `q` (name trigram), industry, size. | P0 | viewer |
| FR-026 | Company detail embeds: contacts_count, open_deals_count, recent_activities, open_tasks_count. | P1 | viewer |
| FR-027 | `GET /api/companies/{id}/contacts` — paginated contacts scoped to this company. | P1 | viewer |
| FR-028 | `GET /api/companies/{id}/deals` — paginated deals scoped to this company. | P1 | viewer |
| FR-029 | PUT (full replace, min role: manager) and PATCH (partial update, min role: agent). | P0 | agent/manager |
| FR-030 | DELETE company nullifies `company_id` on all linked contacts and deals (SET NULL). | P1 | manager |

---

### 3.4 Deal and Pipeline Management

| ID | Requirement | Priority | Min role |
|----|-------------|----------|----------|
| FR-031 | The org has a single pipeline of ordered named stages with: name, position, probability (0-100), stage_type (active/won/lost), color (hex). | P0 | — |
| FR-032 | Exactly one `stage_type = 'won'` stage and one `stage_type = 'lost'` stage per org. They cannot be deleted. | P0 | — |
| FR-033 | Managers create, rename, and reorder stages. `POST /api/pipeline-stages` inserts at the given position and shifts existing stages atomically. | P0 | manager |
| FR-034 | Stage deletion requires `reassign_to_stage_id` if the stage has deals. All deals are atomically moved to the reassignment target before deletion. Won/lost stages cannot be deleted. | P0 | admin |
| FR-035 | `PATCH /api/pipeline-stages/reorder` reorders all stages atomically. Positions must be a contiguous sequence starting at 1. | P0 | manager |
| FR-036 | Create a deal with: title, contact_id, company_id, stage_id, value, currency, probability, expected_close_date, notes, owner_id, tag_ids. | P0 | agent |
| FR-037 | On deal creation, one `DealStageHistory` row is inserted with `from_stage_id = NULL` and `to_stage_id = initial_stage_id`. | P0 | — |
| FR-038 | `PUT /api/deals/{id}/stage` is the canonical stage transition endpoint. It inserts a `DealStageHistory` row and updates `deal.status` to `won`/`lost` if target `stage_type` is `won`/`lost`. Setting `won` also sets `actual_close_date = today()`. Cannot move to the current stage. | P0 | agent(own)/manager |
| FR-039 | `GET /api/deals/pipeline` returns all open deals grouped by stage with per-stage `deals_count`, `total_value`, and a summary (`total_open_value`, `weighted_value`, `total_open_deals`). `weighted_value` = sum of `value * probability / 100`. | P0 | viewer |
| FR-040 | Deal detail embeds: full contact, company, owner, stage, `stage_history` (all transitions), recent activities, open tasks. | P1 | viewer |
| FR-041 | DELETE deal performs a **soft-delete**: sets `status = 'lost'`, `actual_close_date = today()`. | P1 | manager |
| FR-042 | Deal list filters: stage_id, owner_id, status, contact_id, company_id, tag_id, value range, close_date range. | P1 | viewer |

---

### 3.5 Activity Tracking

| ID | Requirement | Priority | Min role |
|----|-------------|----------|----------|
| FR-043 | Log an activity with: activity_type (call/email/meeting/note/task_complete/demo/trial/other), subject, body, contact_id, deal_id, company_id, owner_id, occurred_at, duration_minutes, outcome. At least one of contact_id, deal_id, company_id required. | P0 | agent |
| FR-044 | List activities with filters: contact_id, deal_id, company_id, owner_id, activity_type, occurred_from/occurred_to. Default sort: occurred_at desc. | P1 | viewer |
| FR-045 | Activities appear in contact, deal, and company detail views as `recent_activities` (last 5). | P1 | viewer |
| FR-046 | PUT for full activity replacement. Min role: agent (own), manager (any). DELETE: manager. | P1 | agent/manager |
| FR-047 | When a task is completed with a `note`, an activity of type `task_complete` is automatically logged. | P2 | — |

---

### 3.6 Task Management

| ID | Requirement | Priority | Min role |
|----|-------------|----------|----------|
| FR-048 | Create a task with: title, description, contact_id, deal_id, assigned_to, due_date, priority (low/medium/high/urgent). `created_by` = authenticated user. | P0 | agent |
| FR-049 | Task status model: `open`, `in_progress`, `done`, `cancelled`. API also exposes `is_completed` boolean and `completed_at` timestamp as convenience fields. | P0 | — |
| FR-050 | `PATCH /api/tasks/{id}/complete` toggles completion. `is_completed = true` sets `completed_at = now()` and fires `task.completed` webhook. `is_completed = false` clears `completed_at`. Accepts optional `note` string. | P0 | agent(assigned/created)/manager |
| FR-051 | Task list filters: assigned_to, is_completed, priority, due_from/due_to, contact_id, deal_id, overdue bool. | P1 | viewer |
| FR-052 | PUT for full task replacement, DELETE for removal. | P1 | agent/manager |

---

### 3.7 Notes

| ID | Requirement | Priority | Min role |
|----|-------------|----------|----------|
| FR-053 | Create a note attached to exactly one of: contact, deal, or company. Content is plain text. | P0 | agent |
| FR-054 | Only `content` is mutable after creation. | P0 | agent(own)/manager |
| FR-055 | Deleting a contact, deal, or company cascades to delete all associated notes. | P0 | — |

---

### 3.8 Tags

| ID | Requirement | Priority | Min role |
|----|-------------|----------|----------|
| FR-056 | Create tags with name (unique per org, case-sensitive) and color (6-digit hex, e.g. `#F59E0B`). | P1 | manager |
| FR-057 | Tags applicable to contacts (`contact_tags`), companies (`company_tags`), and deals (`deal_tags`). | P1 | agent(own)/manager |
| FR-058 | Tag list response includes `contacts_count` and `deals_count`. | P2 | viewer |
| FR-059 | DELETE tag cascades to all three join tables. | P1 | admin |

---

### 3.9 Custom Fields

| ID | Requirement | Priority | Min role |
|----|-------------|----------|----------|
| FR-060 | Admins define custom field schemas per entity type (contact/company/deal). Definition: entity_type, field_name (machine key, unique per org+entity, immutable), field_label, field_type, options, is_required, position. | P1 | admin |
| FR-061 | Field types: `text`, `number`, `date`, `boolean`, `select`, `multi_select`. | P1 | — |
| FR-062 | Values stored in entity's `custom_fields` JSONB, keyed by `definition_id` (UUID). | P1 | — |
| FR-063 | `select`/`multi_select` values must be in the defined `options` list. Validated on create/update. | P2 | — |
| FR-064 | PUT on custom field definition can only change: `field_label`, `options`, `is_required`, `position`. `field_name` and `entity_type` are immutable. | P1 | admin |
| FR-065 | DELETE custom field definition removes all stored values for that field (deletes key from entity JSONB). | P1 | admin |

---

### 3.10 Dashboard

| ID | Requirement | Priority | Min role |
|----|-------------|----------|----------|
| FR-066 | `GET /api/dashboard/kpis` returns for a configurable period (this_month/last_month/this_quarter/last_quarter/this_year, optionally scoped to `owner_id`): pipeline_value, weighted_pipeline, deals_won_count, deals_won_value, deals_lost_count, deals_lost_value, conversion_rate, open_tasks, overdue_tasks, contacts_this_period, avg_deal_size, avg_days_to_close. | P1 | viewer |
| FR-067 | KPI response includes `by_stage` — per-stage deals_count, total_value, weighted value. | P1 | viewer |
| FR-068 | KPI response includes `by_owner` — per-user deals_count, total_value, won_count, won_value. | P2 | manager |
| FR-069 | `weighted_pipeline` = sum of `deal.value * deal.probability / 100` for all open deals. | P1 | — |
| FR-070 | `conversion_rate` = `deals_won_count / (deals_won_count + deals_lost_count)` for the period. Returns `0` if no closed deals. | P1 | — |

---

### 3.11 Webhooks

| ID | Requirement | Priority | Min role |
|----|-------------|----------|----------|
| FR-071 | Admins register webhooks with: url, events, secret (optional — auto-generated if omitted), description, is_active. | P2 | admin |
| FR-072 | Webhook `secret` is returned **only once** in the `201` creation response. Never returned in any GET. | P2 | — |
| FR-073 | All deliveries include `X-CRM-Signature: sha256=<hmac-sha256(body, secret)>`. | P2 | — |
| FR-074 | Retry policy: immediate, +1 min, +5 min, +30 min, then `failed`. HTTP `2xx` within 10 s = success. | P2 | — |
| FR-075 | `GET /api/webhooks/{id}/events` — paginated delivery history with status, attempts, response_status_code. | P2 | admin |
| FR-076 | `POST /api/webhooks/{id}/test` — synchronous test delivery. Always returns `200`; outcome in response body. | P2 | admin |

---

### 3.12 Import / Export

| ID | Requirement | Priority | Min role |
|----|-------------|----------|----------|
| FR-077 | `POST /api/contacts/import` — multipart CSV (max 10 MB). Params: file, owner_id, contact_type, source, skip_duplicates. Required columns: first_name, last_name. Optional: email, phone, company_name, contact_type, source, notes. | P2 | manager |
| FR-078 | Import runs asynchronously. Returns `import_id`. Fires `contact.bulk_imported` webhook on completion. | P2 | — |
| FR-079 | `GET /api/contacts/export` — streaming CSV. All list-endpoint filters apply. Max 100k rows. | P2 | manager |

---

### 3.13 Audit Logging

| ID | Requirement | Priority | Min role |
|----|-------------|----------|----------|
| FR-080 | Every state-changing API operation writes an immutable `audit_log` row in the same database transaction. | P0 | — |
| FR-081 | Audit rows record: tenant_id, user_id, action, entity_type, entity_id, old_data (JSONB), new_data (JSONB), created_at. | P0 | — |
| FR-082 | Sensitive fields (`password_hash`, webhook `secret`) stripped before writing audit snapshots. | P0 | — |
| FR-083 | Audit rows are never modified or deleted by the application. | P0 | — |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| ID | Requirement |
|----|-------------|
| NFR-001 | List endpoint response time (p95): <= 500 ms at 10k records per org. |
| NFR-002 | Trigram search latency (p95): <= 100 ms at 100k contacts per org. |
| NFR-003 | Dashboard KPI endpoint: <= 1 000 ms at 50k deals per org. |
| NFR-004 | Frontend initial page load: <= 2 s on a 10 Mbps connection (Lighthouse >= 80). |
| NFR-005 | Webhook delivery background task initiated within 1 s of the triggering API response. |
| NFR-006 | DB connection pool: min 5, max 20 asyncpg connections per API instance. |

### 4.2 Security

| ID | Requirement |
|----|-------------|
| NFR-007 | All communication uses HTTPS/TLS 1.2+. Internal Docker network isolated from host. |
| NFR-008 | JWTs signed with RS256. Private key loaded from environment variable, never committed. |
| NFR-009 | Passwords: bcrypt, cost factor >= 12. |
| NFR-010 | All SQL queries use SQLAlchemy parameterised statements. Raw f-string SQL is prohibited. |
| NFR-011 | All request bodies validated by Pydantic v2. Validation failures return `422` with field-level detail. |
| NFR-012 | PostgreSQL RLS enforces org isolation independently of application logic. |
| NFR-013 | Rate limiting per user (see §5.4). Exceeded limit returns `429`. |
| NFR-014 | Webhook `secret` never returned in GET responses. |
| NFR-015 | Docker containers run as non-root user. |
| NFR-016 | CI runs `pip-audit` on every push. Critical CVEs block merge. |

### 4.3 Scalability

| ID | Requirement |
|----|-------------|
| NFR-017 | API tier is stateless; horizontal scaling via replicas behind a load balancer. |
| NFR-018 | `SET LOCAL` is transaction-scoped, compatible with PgBouncer transaction pooling. |
| NFR-019 | `audit_log` planned for monthly range partitioning after 1M rows (migration 0002). |
| NFR-020 | GIN trigram indexes prevent full-table scans on ILIKE queries. |

### 4.4 Availability

| ID | Requirement |
|----|-------------|
| NFR-021 | All Docker services define `healthcheck`. `restart: unless-stopped` ensures auto-restart. |
| NFR-022 | FastAPI exposes `GET /healthz` (liveness) and `GET /readyz` (readiness: checks DB + Redis). |
| NFR-023 | Target availability: 99.5% uptime. |

### 4.5 Data Retention and Backup

| ID | Requirement |
|----|-------------|
| NFR-024 | Daily `pg_dump` backups; 30-day retention; off-host storage. |
| NFR-025 | Soft-deleted records remain queryable (managers can filter `status=archived`). |
| NFR-026 | Audit log minimum retention: 2 years. |

---

## 5. API Specification

**Base URL:** `https://api.crm.ai-elevate.ai/api`
**Auth:** `Authorization: Bearer <access_token>` on all endpoints unless noted.

### 5.1 Cursor-Based Pagination

**Request:** `?cursor=<base64-uuid>&limit=50` (max 200)

**Response envelope:**
```json
{
  "items":       [ ... ],
  "next_cursor": "dXVpZC1oZXJl",
  "has_more":    true,
  "total":       412
}
```
`next_cursor` is `null` when `has_more` is `false`.

### 5.2 Standard Error Format

```json
{
  "error": {
    "code":    "RESOURCE_NOT_FOUND",
    "message": "Contact with id 'abc' not found in this organization.",
    "details": { "field": "id", "value": "abc" }
  }
}
```

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `BAD_REQUEST` | Semantic error |
| 401 | `UNAUTHORIZED` | Missing/expired/blacklisted JWT |
| 403 | `FORBIDDEN` | Insufficient role |
| 404 | `RESOURCE_NOT_FOUND` | Not found in this org |
| 409 | `CONFLICT` | Unique constraint violation |
| 422 | `VALIDATION_ERROR` | Pydantic validation failure |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### 5.3 Rate Limits

| Tier | Limit |
|------|-------|
| Default | 300 req / 15 min per user |
| Search | 60 req / min per user |
| Import | 10 req / hour per org |
| Export | 20 req / hour per org |

Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

### 5.4 Endpoint Inventory

| Method | Path | Description | Min role |
|--------|------|-------------|----------|
| POST | `/auth/register` | Create org or add user | — / admin |
| POST | `/auth/login` | Authenticate (email + password + org_slug) | — |
| POST | `/auth/logout` | Blacklist current token | viewer |
| POST | `/auth/refresh` | Rotate refresh token | — |
| GET | `/contacts` | List + filter contacts | viewer |
| POST | `/contacts` | Create contact | agent |
| GET | `/contacts/search` | Similarity-ranked trigram search | viewer |
| POST | `/contacts/import` | Async CSV import | manager |
| GET | `/contacts/export` | Streaming CSV export | manager |
| GET | `/contacts/{id}` | Contact detail | viewer |
| PUT | `/contacts/{id}` | Full update | agent(own)/manager |
| PATCH | `/contacts/{id}` | Partial update | agent(own)/manager |
| DELETE | `/contacts/{id}` | Soft-delete (archive) | manager |
| POST | `/contacts/{id}/tags` | Add tag | agent(own)/manager |
| DELETE | `/contacts/{id}/tags/{tag_id}` | Remove tag | agent(own)/manager |
| GET | `/companies` | List companies | viewer |
| POST | `/companies` | Create company | agent |
| GET | `/companies/{id}` | Company detail | viewer |
| PUT | `/companies/{id}` | Full update | manager |
| PATCH | `/companies/{id}` | Partial update | agent |
| DELETE | `/companies/{id}` | Delete (nullify FKs) | manager |
| GET | `/companies/{id}/contacts` | Company contacts | viewer |
| GET | `/companies/{id}/deals` | Company deals | viewer |
| GET | `/pipeline-stages` | All stages ordered | viewer |
| POST | `/pipeline-stages` | Create stage | manager |
| PUT | `/pipeline-stages/{id}` | Update stage | manager |
| DELETE | `/pipeline-stages/{id}` | Delete + reassign | admin |
| PATCH | `/pipeline-stages/reorder` | Bulk reorder | manager |
| GET | `/deals` | List deals | viewer |
| POST | `/deals` | Create deal | agent |
| GET | `/deals/pipeline` | Kanban grouped view | viewer |
| GET | `/deals/{id}` | Deal detail with history | viewer |
| PUT | `/deals/{id}` | Full update | agent(own)/manager |
| PATCH | `/deals/{id}` | Partial update | agent(own)/manager |
| DELETE | `/deals/{id}` | Soft-delete (mark lost) | manager |
| PUT | `/deals/{id}/stage` | Stage transition | agent(own)/manager |
| GET | `/activities` | List activities | viewer |
| POST | `/activities` | Log activity | agent |
| GET | `/activities/{id}` | Activity detail | viewer |
| PUT | `/activities/{id}` | Full update | agent(own)/manager |
| DELETE | `/activities/{id}` | Delete | manager |
| GET | `/tasks` | List tasks | viewer |
| POST | `/tasks` | Create task | agent |
| GET | `/tasks/{id}` | Task detail | viewer |
| PUT | `/tasks/{id}` | Full update | agent(own-assigned)/manager |
| DELETE | `/tasks/{id}` | Delete | manager |
| PATCH | `/tasks/{id}/complete` | Toggle completion | agent(own-assigned)/manager |
| GET | `/tags` | List all tags | viewer |
| POST | `/tags` | Create tag | manager |
| PUT | `/tags/{id}` | Update tag | manager |
| DELETE | `/tags/{id}` | Delete + cascade joins | admin |
| GET | `/custom-fields` | List definitions | viewer |
| POST | `/custom-fields` | Create definition | admin |
| PUT | `/custom-fields/{id}` | Update definition | admin |
| DELETE | `/custom-fields/{id}` | Delete definition | admin |
| GET | `/dashboard/kpis` | KPI summary | viewer |
| GET | `/webhooks` | List webhooks | admin |
| POST | `/webhooks` | Register webhook | admin |
| GET | `/webhooks/{id}` | Webhook detail | admin |
| PUT | `/webhooks/{id}` | Update webhook | admin |
| DELETE | `/webhooks/{id}` | Delete webhook | admin |
| GET | `/webhooks/{id}/events` | Delivery history | admin |
| POST | `/webhooks/{id}/test` | Test delivery | admin |

For full request/response JSON schemas and example payloads, see `docs/api-spec.md`.

---

## 6. Database Schema

### 6.1 PostgreSQL Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- GIN trigram search
```

### 6.2 Entity Relationship Diagram

```
tenants
  |-- users (tenant_id)
  |-- companies (tenant_id)
  |     |<-- contacts (company_id -> companies)
  |-- contacts (tenant_id)
  |     |-- contact_tags --> tags
  |-- pipeline_stages (tenant_id)
  |     |<-- deals (stage_id -> pipeline_stages, RESTRICT)
  |-- deals (tenant_id)
  |     |-- deal_stage_history (deal_id, from_stage_id, to_stage_id, moved_by)
  |     |-- deal_tags --> tags
  |-- tags (tenant_id)
  |     |-- contact_tags
  |     |-- company_tags --> companies
  |     |-- deal_tags
  |-- activities (tenant_id, contact_id?, deal_id?, company_id?)
  |-- tasks (tenant_id, contact_id?, deal_id?, assigned_to?)
  |-- notes (tenant_id, contact_id? | deal_id? | company_id?)
  |-- custom_fields (tenant_id)  -- field definitions only
  |-- webhooks (tenant_id)
  |-- audit_log (tenant_id, user_id?)
```

### 6.3 Table Definitions

#### `tenants`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, gen_random_uuid() |
| name | VARCHAR(255) | NOT NULL |
| slug | VARCHAR(100) | NOT NULL, UNIQUE, INDEX |
| settings | JSONB | nullable |
| created_at | TIMESTAMPTZ | NOT NULL, default now() |
| updated_at | TIMESTAMPTZ | NOT NULL, default now() |

---

#### `users`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK -> tenants CASCADE, NOT NULL, INDEX |
| username | VARCHAR(100) | NOT NULL |
| email | VARCHAR(255) | NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| role | VARCHAR(50) | NOT NULL, default 'agent' |
| is_agent | BOOLEAN | NOT NULL, default false |
| avatar_url | VARCHAR(512) | nullable |
| is_active | BOOLEAN | NOT NULL, default true |
| last_login_at | TIMESTAMPTZ | nullable |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

Constraints: `UNIQUE(tenant_id, email)`

---

#### `companies`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK -> tenants CASCADE, NOT NULL, INDEX |
| name | VARCHAR(255) | NOT NULL |
| domain | VARCHAR(255) | nullable |
| industry | VARCHAR(100) | nullable |
| size | VARCHAR(50) | nullable |
| website | VARCHAR(512) | nullable |
| phone | VARCHAR(50) | nullable |
| address | JSONB | nullable (street, city, state, zip, country) |
| notes | TEXT | nullable |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

---

#### `contacts`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK -> tenants CASCADE, NOT NULL, INDEX |
| owner_id | UUID | FK -> users SET NULL, nullable, INDEX |
| first_name | VARCHAR(100) | nullable |
| last_name | VARCHAR(100) | nullable |
| email | VARCHAR(255) | nullable, INDEX |
| phone | VARCHAR(50) | nullable |
| company_id | UUID | FK -> companies SET NULL, nullable |
| contact_type | VARCHAR(50) | NOT NULL, default 'lead' |
| status | VARCHAR(50) | NOT NULL, default 'active' |
| source | VARCHAR(100) | nullable |
| notes | TEXT | nullable |
| custom_fields | JSONB | nullable — `{definition_id: value}` |
| created_by | UUID | FK -> users SET NULL, nullable |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

GIN index on `(first_name || ' ' || last_name || ' ' || coalesce(email,'')) gin_trgm_ops`

---

#### `pipeline_stages`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK -> tenants CASCADE, NOT NULL, INDEX |
| name | VARCHAR(255) | NOT NULL |
| position | INTEGER | NOT NULL, default 0 |
| probability | INTEGER | NOT NULL, default 0 (0-100) |
| stage_type | VARCHAR(20) | NOT NULL, default 'active' — active/won/lost |
| color | VARCHAR(20) | nullable (hex) |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

Service-layer constraint: at most one `won` and one `lost` stage per org.

---

#### `deals`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK -> tenants CASCADE, NOT NULL, INDEX |
| title | VARCHAR(500) | NOT NULL |
| owner_id | UUID | FK -> users SET NULL, nullable, INDEX |
| contact_id | UUID | FK -> contacts SET NULL, nullable |
| company_id | UUID | FK -> companies SET NULL, nullable |
| stage_id | UUID | FK -> pipeline_stages RESTRICT, NOT NULL, INDEX |
| value | NUMERIC(12,2) | nullable |
| currency | VARCHAR(3) | NOT NULL, default 'USD' |
| probability | INTEGER | NOT NULL, default 0 |
| expected_close_date | DATE | nullable |
| actual_close_date | DATE | nullable |
| status | VARCHAR(20) | NOT NULL, default 'open' — open/won/lost |
| notes | TEXT | nullable |
| custom_fields | JSONB | nullable |
| created_by | UUID | FK -> users SET NULL, nullable |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

---

#### `deal_stage_history`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK -> tenants CASCADE, NOT NULL, INDEX |
| deal_id | UUID | FK -> deals CASCADE, NOT NULL, INDEX |
| from_stage_id | UUID | FK -> pipeline_stages SET NULL, nullable |
| to_stage_id | UUID | FK -> pipeline_stages RESTRICT, NOT NULL |
| moved_by | UUID | FK -> users SET NULL, nullable |
| created_at | TIMESTAMPTZ | NOT NULL, INDEX (immutable) |

No `updated_at`. Rows are never modified.

---

#### `activities`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK -> tenants CASCADE, NOT NULL, INDEX |
| type | VARCHAR(50) | NOT NULL, INDEX |
| subject | VARCHAR(500) | NOT NULL |
| description | TEXT | nullable |
| contact_id | UUID | FK -> contacts SET NULL, nullable, INDEX |
| deal_id | UUID | FK -> deals SET NULL, nullable, INDEX |
| company_id | UUID | FK -> companies SET NULL, nullable |
| performed_by | UUID | FK -> users SET NULL, nullable |
| scheduled_at | TIMESTAMPTZ | nullable |
| completed_at | TIMESTAMPTZ | nullable |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

*The API exposes `occurred_at`, `duration_minutes`, and `outcome` as additional fields to be added in migration 0002.*

---

#### `tasks`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK -> tenants CASCADE, NOT NULL, INDEX |
| title | VARCHAR(500) | NOT NULL |
| description | TEXT | nullable |
| assigned_to | UUID | FK -> users SET NULL, nullable, INDEX |
| contact_id | UUID | FK -> contacts SET NULL, nullable |
| deal_id | UUID | FK -> deals SET NULL, nullable |
| due_date | TIMESTAMPTZ | nullable, INDEX |
| priority | VARCHAR(20) | NOT NULL, default 'medium' — low/medium/high/urgent |
| status | VARCHAR(20) | NOT NULL, default 'open' — open/in_progress/done/cancelled |
| created_by | UUID | FK -> users SET NULL, nullable |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

---

#### `notes`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK -> tenants CASCADE, NOT NULL, INDEX |
| content | TEXT | NOT NULL |
| contact_id | UUID | FK -> contacts CASCADE, nullable, INDEX |
| deal_id | UUID | FK -> deals CASCADE, nullable, INDEX |
| company_id | UUID | FK -> companies CASCADE, nullable |
| created_by | UUID | FK -> users SET NULL, nullable |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

Application constraint: exactly one of contact_id, deal_id, company_id must be non-null.

---

#### `tags`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK -> tenants CASCADE, NOT NULL, INDEX |
| name | VARCHAR(100) | NOT NULL |
| color | VARCHAR(20) | nullable |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

Constraint: `UNIQUE(tenant_id, name)`

**Join tables:** `contact_tags`, `company_tags`, `deal_tags` — each is a composite-PK join with `<entity>_id` and `tag_id`, both FK CASCADE.

---

#### `custom_fields`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK -> tenants CASCADE, NOT NULL, INDEX |
| entity_type | VARCHAR(50) | NOT NULL — contact/company/deal, INDEX |
| field_name | VARCHAR(100) | NOT NULL (machine key, immutable) |
| field_label | VARCHAR(255) | NOT NULL |
| field_type | VARCHAR(50) | NOT NULL — text/number/date/boolean/select/multi_select |
| options | JSONB | nullable — string array for select/multi_select |
| is_required | BOOLEAN | NOT NULL, default false |
| position | INTEGER | NOT NULL, default 0 |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

Constraint: `UNIQUE(tenant_id, entity_type, field_name)`

---

#### `webhooks`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK -> tenants CASCADE, NOT NULL, INDEX |
| url | VARCHAR(2048) | NOT NULL |
| events | TEXT[] | NOT NULL, default '{}' |
| is_active | BOOLEAN | NOT NULL, default true |
| secret | VARCHAR(255) | nullable (write-only; never returned in GET) |
| description | VARCHAR(500) | nullable |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

---

#### `audit_log`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK -> tenants CASCADE, NOT NULL, INDEX |
| user_id | UUID | FK -> users SET NULL, nullable, INDEX |
| action | VARCHAR(50) | NOT NULL — create/update/delete/stage_move/login/export/import |
| entity_type | VARCHAR(100) | NOT NULL, INDEX |
| entity_id | VARCHAR(255) | nullable |
| old_data | JSONB | nullable |
| new_data | JSONB | nullable |
| created_at | TIMESTAMPTZ | NOT NULL, INDEX (immutable — no updated_at) |

Composite index on `(entity_type, entity_id)`.

### 6.4 Migration Strategy

- Alembic manages all schema changes. Files in `backend/migrations/versions/`.
- `0001_initial_schema.py` — all tables, indexes, RLS, extensions.
- `0002` (planned) — add `occurred_at`, `duration_minutes`, `outcome` to activities; `audit_log` monthly partitioning.
- Every migration includes a working `downgrade()`.
- Migrations auto-run at API container startup: `alembic upgrade head`.

---

## 7. Frontend Specification

### 7.1 Dark Theme Design System

```
Backgrounds:
  Page:     #0F172A  (slate-900)
  Surface:  #1E293B  (slate-800)
  Elevated: #293548  (slate-750)
  Border:   #334155  (slate-700)

Text:
  Primary:  #F1F5F9  (slate-100)
  Secondary:#CBD5E1  (slate-300)
  Muted:    #94A3B8  (slate-400)
  Disabled: #475569  (slate-600)

Accent colours:
  Blue:     #3B82F6  (blue-500)    -- primary actions, links
  Green:    #22C55E  (green-500)   -- won, success, active
  Red:      #EF4444  (red-500)     -- lost, error, danger, archived
  Amber:    #F59E0B  (amber-500)   -- warning, high priority, VIP tags
  Purple:   #8B5CF6  (violet-500)  -- negotiation stage default
  Slate:    #6B7280  (gray-500)    -- lead-in stage default, inactive

Typography:
  Font: Inter (system fallback: ui-sans-serif)
  Base: 14px / 1.5 line-height
  Headings: 16px (h3), 20px (h2), 24px (h1)
  Labels: 12px / uppercase / tracking-wide

Spacing unit: 4px. Scale: 4/8/12/16/24/32/48px
Border radius: 4px inputs, 6px cards, 8px modals, full badges/avatars
```

### 7.2 Page Inventory

| Route | Page | Description |
|-------|------|-------------|
| `/login` | Login | Email + password + org_slug form. |
| `/` | Dashboard | KPI cards, weighted pipeline, stage funnel, by-owner table, overdue tasks. |
| `/contacts` | Contact List | Data table, filter sidebar, trigram search, cursor pagination. |
| `/contacts/import` | Import | Drag-drop CSV, column mapping, import job progress polling. |
| `/contacts/:id` | Contact Detail | Profile, tags, custom fields, timeline, linked deals. |
| `/companies` | Company List | Table with search, industry/size filters. |
| `/companies/:id` | Company Detail | Profile, contacts, deals, notes, activities. |
| `/deals` | Deal List | Filterable table (stage, owner, value, close date). |
| `/deals/:id` | Deal Detail | Deal card, stage badge, full stage history, tasks, notes, activities. |
| `/pipeline` | Kanban Board | Columns per stage; deals as draggable cards; per-column totals. |
| `/activities` | Activity Log | Filterable activity list across the org. |
| `/tasks` | Task List | Filterable tasks, priority badges, overdue highlighting. |
| `/search` | Search Results | Cross-entity instant search with similarity scores. |
| `/settings/pipeline` | Pipeline Settings | CRUD stages, drag-to-reorder, won/lost locked. |
| `/settings/tags` | Tag Management | Create, rename, recolor, delete. |
| `/settings/custom-fields` | Custom Fields | Define fields per entity type. |
| `/settings/users` | User Management | Admin: invite, role change, deactivate. |
| `/settings/webhooks` | Webhooks | Admin: register, test, delivery history. |
| `/settings/profile` | Profile | Change username, avatar, password. |

### 7.3 Component Hierarchy

```
App
+-- AuthProvider (Zustand: tokens + org context)
|
+-- PublicLayout
|   +-- LoginPage
|
+-- ProtectedLayout (redirect to /login if no token)
    +-- Sidebar
    |   +-- NavGroup (Contacts, Companies, Deals, Pipeline)
    |   +-- NavGroup (Activities, Tasks)
    |   +-- NavGroup (Settings)
    |   +-- OrgBadge
    +-- Topbar
    |   +-- GlobalSearchBar (debounced dropdown)
    |   +-- UserMenu
    |
    +-- <Outlet />
        +-- DashboardPage
        |   +-- KpiCard x4
        |   +-- WeightedPipelineFunnel (Recharts)
        |   +-- StageBreakdownTable
        |   +-- ByOwnerTable
        |   +-- OverdueTasksList
        |
        +-- ContactListPage
        |   +-- FilterSidebar
        |   +-- DataTable (cursor-paginated)
        |   +-- QuickCreateSlideOver
        |
        +-- ContactDetailPage
        |   +-- ContactCard (edit-in-place)
        |   +-- TagBadgeList + TagPicker
        |   +-- CustomFieldsPanel
        |   +-- Timeline (Activity + Note + Task merged)
        |   +-- LinkedDeals
        |
        +-- PipelineBoardPage
        |   +-- KanbanBoard (dnd-kit DndContext)
        |   |   +-- StageColumn (SortableContext) xN
        |   |   |   +-- StageHeader (name, count, total)
        |   |   |   +-- DealCard (useSortable) xM
        |   |   +-- StageSummaryRow (total, weighted)
        |   +-- DealDetailSlideOver
        |
        +-- DealDetailPage
        |   +-- DealCard
        |   +-- StageHistoryTimeline
        |   +-- LinkedContactCompany
        |   +-- TasksSection
        |   +-- NotesSection
        |   +-- ActivitiesSection
        |
        +-- Settings/*
            +-- PipelineEditor (drag-to-reorder, won/lost locked)
            +-- CustomFieldEditor
            +-- WebhookList + DeliveryHistoryModal
            +-- UserTable + InviteModal
```

### 7.4 State Management

| State type | Tool |
|------------|------|
| Server data | TanStack Query v5 — caching, background refetch, optimistic mutations |
| Auth tokens + org | Zustand + sessionStorage (access token in-memory; refresh in localStorage) |
| Kanban drag | dnd-kit local state |
| Filter/sort/cursor params | URL search params (bookmarkable) |
| Toast notifications | react-hot-toast |
| Modal/slide-over open | Zustand UI slice |

### 7.5 Routing

```
/                       -> redirect to /dashboard
/login                  -> LoginPage (public)
/dashboard              -> DashboardPage
/contacts               -> ContactListPage
/contacts/import        -> ContactImportPage
/contacts/:id           -> ContactDetailPage
/companies              -> CompanyListPage
/companies/:id          -> CompanyDetailPage
/deals                  -> DealListPage
/deals/:id              -> DealDetailPage
/pipeline               -> KanbanBoardPage
/activities             -> ActivityListPage
/tasks                  -> TaskListPage
/search                 -> SearchResultsPage
/settings               -> redirect to /settings/profile
/settings/profile       -> ProfilePage
/settings/pipeline      -> PipelineSettingsPage
/settings/tags          -> TagSettingsPage
/settings/custom-fields -> CustomFieldsPage
/settings/users         -> UserManagementPage (admin guard)
/settings/webhooks      -> WebhookSettingsPage (admin guard)
```

Unauthenticated users are redirected to `/login?next=<path>`. Admin-only routes redirect non-admins to `/dashboard` with a toast error.

---

## 8. Integration Points

### 8.1 Agent API Contract

GigForge and TechUni AI agents authenticate with a service account JWT (`is_agent: true`). Common agent workflows:

**Capture a lead from a platform scan:**
```
POST /api/contacts
{ "first_name": "Jane", "last_name": "Doe",
  "email": "jane@example.com",
  "contact_type": "lead", "source": "upwork",
  "custom_fields": { "<definition-id>": "https://upwork.com/..." } }
-> 201 + contact (capture contact.id)
```

**Create a deal in the first stage:**
```
POST /api/deals
{ "title": "React Dashboard — Jane Doe",
  "contact_id": "<id>", "stage_id": "<lead-in-stage-id>",
  "value": 2500.00, "currency": "USD", "probability": 20 }
-> 201 (also inserts DealStageHistory: from=null, to=lead-in)
```

**Log an outreach activity:**
```
POST /api/activities
{ "activity_type": "email", "subject": "Proposal sent",
  "contact_id": "<id>", "deal_id": "<id>",
  "occurred_at": "2026-03-15T18:00:00Z",
  "outcome": "Awaiting response" }
-> 201
```

**Advance deal to next stage:**
```
PUT /api/deals/{id}/stage
{ "stage_id": "<proposal-sent-stage-id>", "probability": 50,
  "note": "Client reviewed proposal" }
-> 200 (inserts DealStageHistory, fires deal.stage_changed webhook)
```

**Mark deal as won:**
```
PUT /api/deals/{id}/stage
{ "stage_id": "<won-stage-id>" }
-> 200 (status=won, actual_close_date=today, fires deal.won webhook)
```

### 8.2 Webhook Event Catalog

**Delivery envelope:**
```json
{
  "event":      "deal.stage_changed",
  "timestamp":  "2026-03-15T18:32:00.000Z",
  "org_id":     "<org-uuid>",
  "actor_id":   "<user-uuid>",
  "actor_type": "user",
  "data":       { "...entity snapshot..." }
}
```

**Signature:** `X-CRM-Signature: sha256=<hmac-sha256(body, secret)>`

**Retry policy:**

| Attempt | Delay |
|---------|-------|
| 1 | Immediate |
| 2 | +1 minute |
| 3 | +5 minutes |
| 4 | +30 minutes |
| Final | status = 'failed' |

HTTP `2xx` within 10 s = success. Timeouts and non-2xx = failure.

**Event reference:**

| Event | Trigger |
|-------|---------|
| `contact.created` | New contact saved |
| `contact.updated` | Contact fields changed |
| `contact.deleted` | Contact soft-deleted |
| `contact.bulk_imported` | CSV import completed |
| `deal.created` | New deal saved |
| `deal.updated` | Deal fields changed (non-stage) |
| `deal.stage_changed` | PUT /deals/{id}/stage (active -> active) |
| `deal.won` | Stage move to stage_type=won |
| `deal.lost` | Stage move to stage_type=lost |
| `activity.created` | Activity logged |
| `task.created` | Task created |
| `task.completed` | Task marked complete |

### 8.3 Email Integration Readiness (V2)

- `Activity.type = 'email'` provides log slot for outbound email tracking
- Webhooks can forward `deal.won`, `task.completed` to an email microservice
- `users.email` available for notification routing

### 8.4 Future Integration Points

| Integration | Mechanism |
|-------------|-----------|
| Calendar sync | OAuth2 tokens table + activities as event source |
| VoIP / phone | VoIP webhook -> `POST /api/activities` (type=call) |
| Email tracking | Email provider webhook -> `POST /api/activities` |
| Slack | Webhook subscriber on deal.won, task.completed |
| Data warehouse | pglogical CDC -> BigQuery / Snowflake |

---

## 9. Testing Strategy

### 9.1 Coverage Targets

| Layer | Tool | Target |
|-------|------|--------|
| Backend unit tests | pytest | 80% line coverage |
| Backend integration tests | pytest + httpx AsyncClient + test DB | 100% of endpoints |
| Tenant isolation tests | pytest (subset) | Run on every CI push — merge blocker |
| API contract tests | schemathesis on /openapi.json | All response schemas |
| Frontend component tests | Vitest + React Testing Library | All shared components |
| Frontend page tests | Vitest + MSW | All page flows |
| End-to-end | Playwright | 8 critical user journeys |

### 9.2 Integration Test Requirements per Endpoint

Every endpoint must be tested for:

1. **Happy path** — correct input, expected status code and body
2. **Authentication** — missing/expired/revoked JWT -> `401`
3. **Role enforcement** — insufficient role -> `403`
4. **Tenant isolation** — Org B JWT accessing Org A resource -> `404` (not `403`)
5. **Validation** — malformed body -> `422` with field-level errors
6. **Not found** — non-existent ID within the org -> `404`
7. **Ownership** — `agent` accessing another agent's owned record -> `404`

### 9.3 API Contract Tests

`schemathesis` generates property-based tests from `/openapi.json`, verifying:
- Response codes match declared possibilities
- Response bodies match declared Pydantic schemas
- Invalid random inputs return `422` not `500`

### 9.4 Frontend Component Tests

All `Shared/` components must have tests covering:
- Renders without crashing
- Displays props correctly
- User interactions trigger expected callbacks
- Keyboard navigation (Tab, Enter, Escape)
- ARIA roles on interactive elements

### 9.5 End-to-End Scenarios (Playwright)

| # | Scenario |
|---|----------|
| 1 | Login with org_slug -> verify dashboard KPIs load |
| 2 | Create contact -> create deal -> link -> verify deal detail |
| 3 | Kanban board -> drag deal to next stage -> verify stage_history entry |
| 4 | Create task -> mark complete -> verify completed_at, webhook fired |
| 5 | Upload contacts CSV -> poll import job -> verify new contacts |
| 6 | Admin creates custom field -> sales rep fills value -> verify in detail |
| 7 | Update deal value -> query audit log -> verify old/new JSONB |
| 8 | Log in as Org B -> GET Org A contact by ID -> verify 404 |

---

## 10. Deployment

### 10.1 Docker Compose Topology

```yaml
services:

  postgres:
    image: postgres:16-alpine
    environment: [POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER"]
      interval: 10s
      start_period: 30s
    networks: [crm_internal]

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
    networks: [crm_internal]

  api:
    build: ./backend
    environment: [DATABASE_URL, REDIS_URL, JWT_PRIVATE_KEY,
                  JWT_PUBLIC_KEY, JWT_ALGORITHM, CORS_ORIGINS]
    command: >
      sh -c "alembic upgrade head &&
             uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4"
    depends_on:
      postgres: {condition: service_healthy}
      redis:    {condition: service_healthy}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/healthz"]
    restart: unless-stopped
    networks: [crm_internal]

  frontend:
    build: ./frontend
    depends_on: [api]
    restart: unless-stopped
    networks: [crm_internal]

  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes: [./nginx.conf:/etc/nginx/nginx.conf:ro, certs:/etc/letsencrypt]
    depends_on: [api, frontend]
    restart: unless-stopped
    networks: [crm_internal, crm_external]

volumes: [pgdata, certs]
networks:
  crm_internal: {driver: bridge, internal: true}
  crm_external: {driver: bridge}
```

### 10.2 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL DSN (asyncpg for app; env.py builds psycopg2 URL for Alembic) |
| `REDIS_URL` | Yes | Redis connection URL |
| `JWT_PRIVATE_KEY` | Yes | RS256 private key (PEM, newlines as `\n`) |
| `JWT_PUBLIC_KEY` | Yes | RS256 public key (PEM) |
| `JWT_ALGORITHM` | No | Default: `RS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Default: `15` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | Default: `7` |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |
| `POSTGRES_HOST` | Alembic | Default: `postgres` |
| `POSTGRES_PORT` | Alembic | Default: `5432` |
| `POSTGRES_DB` | Alembic | Default: `crm_db` |
| `POSTGRES_USER` | Alembic | Default: `crm_user` |
| `POSTGRES_PASSWORD` | Alembic | **Override in production** |
| `AUDIT_EXCLUDE_FIELDS` | No | Comma-separated fields stripped from audit snapshots |

All secrets are injected via Docker secrets or `.env` file. `.env` is in `.gitignore`.

### 10.3 Database Migration Procedure

**Initial deployment:**
```bash
docker compose run --rm api alembic upgrade head
```

**Adding a migration:**
```bash
docker compose run --rm api alembic revision --autogenerate -m "add_activity_outcome"
# Review the generated file, then:
docker compose run --rm api alembic upgrade head
```

**Rolling back:**
```bash
docker compose run --rm api alembic downgrade -1
```

Migrations run automatically on API container start. If a migration fails the container exits — preventing the API from running against a mismatched schema.

### 10.4 Backup and Recovery

**Daily backup:**
```bash
DATE=$(date +%Y%m%d-%H%M)
docker compose exec -T postgres pg_dump \
  -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "/backups/crm-${DATE}.sql.gz"
aws s3 cp "/backups/crm-${DATE}.sql.gz" "s3://crm-backups/daily/"
find /backups -name "crm-*.sql.gz" -mtime +7 -delete
```

Retention: 30 days on S3.

**Restore:**
```bash
gunzip < crm-20260315-0300.sql.gz \
  | docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"
docker compose run --rm api alembic upgrade head
```

---

*End of Software Requirements Specification*
*Document version 2.0 — 2026-03-15 — gigforge-engineer*
*Supersedes SRS v1.0*
