# Client Advocate Review — CRM Platform Sprint 1

**Reviewer:** gigforge-advocate (Client Advocate)
**Date:** 2026-03-16
**Review cycle:** 1st
**Perspective:** Paying internal client (GigForge + TechUni org)

---

## What I Was Promised

From the brief and Sprint 1 handoff:
- Auth (register, login, logout, token refresh)
- Tenant isolation + RBAC
- Contacts, Companies, Tags CRUD
- Pipelines + stages config
- Deal CRUD + stage movement with history
- Activity logging + Task management
- Dashboard KPIs (8 metrics)
- Frontend: Login page, Contacts list, Deal pipeline Kanban

---

## What I Received

I read the README, followed setup, reviewed the frontend pages, and examined the API and infrastructure.

### What Works Well ✅

- **Deal Pipeline Kanban** — drag-and-drop is smooth, column headers show deal counts and stage totals, the Add Deal modal is functional and polished. This is the strongest frontend deliverable.
- **Backend architecture** — clean separation of models / repositories / routers / schemas. Every entity has a dedicated router. Well-structured.
- **Dark theme UI** — cohesive, professional-looking design with consistent teal accent colour throughout.
- **Contact list** — search, tag filter, status badges, and pagination all present.
- **Contact detail page** — tabs for activities/deals/notes, inline edit — solid feature depth.
- **Database migrations** — 4 Alembic versions, seed script present.

---

## Issues Found

### CRITICAL — Would Block Production Use

**1. Frontend hardcoded to a development port that doesn't exist in docker-compose**

`frontend/src/api/client.ts` line 1:
```
const BASE = "http://127.0.0.1:8070";
```

The docker-compose exposes the API on port **8000**, not 8070. If I follow the README and run `docker compose up`, the frontend (wherever it is) will call port 8070 and get connection refused on every API request. This is a showstopper.

**2. Frontend is absent from the main `docker-compose.yml`**

`docker-compose.yml` starts three services: `db`, `api`, `pgadmin`. There is no `frontend` service. Running `make up` delivers no frontend whatsoever. The frontend only exists in `docker-compose.dev.yml` (which merges with the main file), but the README's Quick Start says `make up` — which uses only `docker-compose.yml`.

**3. Nginx proxy won't route auth, contacts, or tags**

`nginx/nginx.conf` proxies only `location /api/` to the backend. But the backend registers three core routers at root level:
- `/auth/login`, `/auth/register`, `/auth/logout` — **not under `/api/`**
- `/contacts` — **not under `/api/`**
- `/tags` — **not under `/api/`**

Through nginx in production, logging in would return 404. The entire auth flow is broken at the infrastructure level.

**4. Makefile service names don't match docker-compose service names**

| Makefile command | Uses service | Actual service name in docker-compose.yml |
|-----------------|-------------|------------------------------------------|
| `make migrate` | `backend` | `api` |
| `make test-backend` | `backend` | `api` |
| `make shell-db` | `postgres` | `db` |

Running `make migrate` after `make up` will error: "No such service: backend".

---

### SIGNIFICANT — Reduces Value Delivered

**5. Dashboard shows 4 KPI cards, not 8**

The brief explicitly states "Dashboard KPIs (8 metrics)." The dashboard page (`DashboardPage.tsx`) displays:
- Total Deals
- Pipeline Value
- Won Value
- Conversion Rate

Four cards. The SRS v2 mentions weighted pipeline value, average deal size, open tasks count, and by-owner breakdown — none of these appear. The second panel shows "Deals by Stage" (bar breakdown) and "Recent Activity" (feed), which are charts not KPI metrics. A client who asked for 8 KPI metrics would count 4.

**6. No way to create a Contact from the UI**

The Contacts page has a search bar and tag filter but no "Add Contact" button. CRUD was listed as an acceptance criterion. Reading contacts works; creating does not exist in the frontend.

**7. No Companies, Activities, or Tasks pages in the frontend**

The `frontend/src/pages/` directory contains:
```
DashboardPage.tsx
ContactsPage.tsx
ContactDetailPage.tsx
LoginPage.tsx
DealPipelinePage.tsx
```

No Companies page. No Activities list. No Tasks page. The backend has all these routers built, but a user of the UI cannot access them. The gig brief requires "all 7 pages" and the full React frontend.

---

### MINOR

**8. Login page asks for "Workspace (tenant slug)"** — jargon-heavy for any non-technical user. The field label and placeholder ("gigforge") would confuse anyone who doesn't know what a tenant slug is. A dropdown pre-populated with "GigForge" / "TechUni" would be far more usable.

**9. Frontend README is unmodified Vite boilerplate** — `frontend/README.md` is the default "React + TypeScript + Vite" template text. No project-specific content, no setup instructions, no feature list. Ships with the deliverable, looks unprofessional.

---

## Scorecard

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| 1. Brief Match | 2/5 | Backend fully delivered. Frontend missing 3+ pages, 4 of 8 KPIs, no Add Contact. Infrastructure doesn't match the brief's deployment expectations. |
| 2. Value for Money | 4/5 | Extraordinary backend scope shipped in Sprint 1. Infrastructure bugs drag this down from a 5. |
| 3. Usability | 2/5 | Hardcoded URL means the frontend won't connect to the API as shipped. Can't create contacts. Can't reach companies/tasks/activities. Tenant slug jargon on login. |
| 4. Professionalism | 3/5 | Backend code quality is high. But: stock Vite README, Makefile names broken, hardcoded dev URL, nginx/router prefix mismatch. |
| 5. Completeness | 2/5 | Frontend missing from main compose, 3 frontend pages absent, no Add Contact, KPI gap, Makefile unusable as-is. |

**Total: 13 / 25**

---

## Verdict

# REJECTED

Score 13/25 is below the 18-point threshold. A client receiving this deliverable could not run the system using the documented setup commands. The infrastructure issues (hardcoded port, missing frontend service in compose, nginx routing gap) mean `make up` → broken frontend, and production nginx would block the auth flow entirely.

The backend work is genuinely excellent and would score 5/5 in isolation. The rejection is driven entirely by the integration and frontend layer.

---

## Required Fixes Before Re-Review

The following must ALL be resolved before re-submission:

### Blockers (must fix)
1. **`client.ts` BASE URL** — replace hardcoded `http://127.0.0.1:8070` with an env-driven value (e.g. `import.meta.env.VITE_API_URL || ''` for nginx-proxied setup, or a configurable base).
2. **Frontend in `docker-compose.yml`** — add a `frontend` service to the main compose so `make up` starts the full stack.
3. **Nginx proxy or backend routing** — either (a) add `/auth`, `/contacts`, `/tags` to the nginx proxy config, or (b) standardise all backend routers under `/api/v1/` and update nginx accordingly. Mixed prefixes are not acceptable.
4. **Makefile service names** — align with actual docker-compose service names (`api` not `backend`, `db` not `postgres`).

### Significant (must fix)
5. **Add Contact UI** — at minimum, an "Add Contact" button/modal on the Contacts page so the CRUD acceptance criterion is met in the frontend.
6. **Dashboard KPI count** — surface 8 metrics as specified (add weighted pipeline, avg deal size, open tasks, or whatever the SRS defines for the remaining 4).

### Minor (fix before re-review)
7. **Frontend README** — replace Vite boilerplate with project-specific content (stack, env vars, dev setup, build command).
8. **Login UX** — replace the "tenant slug" text field with a user-friendly workspace selector.

---

*Review by gigforge-advocate — 2026-03-16*
