# Sprint Plan — Contact Management App for Recruitment Agency

**Gig ID:** GF-CMA-001
**Client:** Sarah Chen <sarah.chen.test@gmail.com>
**Project Manager:** Jamie Okafor (gigforge-pm)
**Start:** 2026-03-21
**Demo Deadline:** 2026-04-04 (14 calendar days)
**Budget:** ~2,000 EUR
**Tier:** L/XL

---

## Project Overview

Full-stack contact management web application for a 5-person recruitment agency.
Contacts (~3,000 now, ~10,000 within a year) with tags, search, CSV I/O, JWT auth, dark mode, and Docker Compose deployment.

**Stack:**
- Backend: Node.js / Express 4 + PostgreSQL 16
- Frontend: React 19 + Tailwind CSS 4 + Vite
- Auth: JWT (email/password, 5 internal users — no public registration)
- Infrastructure: Docker Compose (API + DB + frontend)

---

## Milestones

| # | Milestone | Sprint | Target |
|---|-----------|--------|--------|
| 1 | Design | Sprint 1 | 2026-03-24 |
| 2 | Backend | Sprint 1 | 2026-03-28 |
| 3 | Frontend | Sprint 2 | 2026-04-02 |
| 4 | Testing | Sprint 2 | 2026-04-03 |
| 5 | Deployment | Sprint 2 | 2026-04-04 |

---

## Sprint Structure

| Sprint | Dates | Focus | Points |
|--------|-------|-------|--------|
| Sprint 1 | 2026-03-21 → 2026-03-28 | Design + Backend | 34 pts |
| Sprint 2 | 2026-03-28 → 2026-04-04 | Frontend + Testing + Deployment | 37 pts |

**Total estimated:** 71 points

---

## Sprint 1 — Design + Backend (2026-03-21 → 2026-03-28)

### Milestone: Design

#### STORY-001 — Design System & Component Specs (UX Designer)
**As a** developer, **I want** a complete design spec **so that** I can build the UI to exact standards without guessing.

**Priority:** Must
**Points:** 3
**Assignee:** UX Designer

**Tasks:**
- [ ] Define design tokens: colour palette (light + dark mode), typography scale, spacing system
- [ ] Specify Tailwind config overrides (colours, font, breakpoints: 375px mobile / 768px tablet / 1440px desktop)
- [ ] Write component specs for: Layout shell (sidebar + topbar), Contact card, Contact table row, Search/filter bar, Tag badge, Contact detail drawer/modal, Empty state, Loading skeleton, Error state
- [ ] Define dark mode strategy (Tailwind `dark:` class with `prefers-color-scheme` + manual toggle)
- [ ] Accessibility checklist: WCAG 2.1 AA — contrast ratios, keyboard nav map, ARIA roles, focus order
- [ ] Document responsive behaviour: sidebar collapses on mobile (<768px), table → card list on mobile

**Acceptance Criteria:**
- [ ] All components have default / hover / active / loading / empty / error states described
- [ ] Colour contrast ratios documented (≥4.5:1 normal text, ≥3:1 large text)
- [ ] Mobile breakpoint behaviour specified for every view
- [ ] Design tokens file ready for engineer to implement

**Deliverable:** `design/design-system.md` + `design/component-specs.md`

---

### Milestone: Backend

#### STORY-002 — Database Schema & Migrations (Backend Developer)
**As a** developer, **I want** a well-structured PostgreSQL schema **so that** contacts, tags, and users are stored efficiently and can scale to 10,000 contacts.

**Priority:** Must
**Points:** 3
**Assignee:** Backend Developer

**Tasks:**
- [ ] Write failing schema tests first (TDD RED)
- [ ] Create migration files:
  - `users` table: id, email (unique), password_hash, name, created_at
  - `contacts` table: id, name, email, phone, company, notes, created_at, updated_at
  - `tags` table: id, name (unique), colour, is_system, created_at
  - `contact_tags` join table: contact_id, tag_id (composite PK, FK constraints)
  - GIN full-text search index on contacts (name, email, company)
  - Seed: 5 predefined system tags (candidate, client, warm lead, placed, interviewed)
  - Seed: 1 admin user for demo
- [ ] Make schema tests pass (TDD GREEN)
- [ ] Refactor + document column constraints (TDD REFACTOR)

**Acceptance Criteria:**
- [ ] All tables created with correct FK constraints
- [ ] GIN index exists on contacts for full-text search
- [ ] System tags seeded on fresh DB init
- [ ] Schema migration runs cleanly from zero

---

#### STORY-003 — JWT Authentication (Backend Developer)
**As a** recruiter, **I want** to log in with my email and password **so that** only our team can access contact data.

**Priority:** Must
**Points:** 5
**Assignee:** Backend Developer

**Tasks:**
- [ ] Write failing auth tests first (TDD RED): POST /auth/login success, invalid password, unknown email, missing fields
- [ ] Implement `POST /auth/login` → returns JWT access token (24h expiry)
- [ ] Implement `POST /auth/logout` → token blacklist (in-memory or DB table)
- [ ] Auth middleware: validates JWT on all protected routes, returns 401 on failure
- [ ] Zod validation schemas for auth endpoints
- [ ] Make all auth tests pass (TDD GREEN)
- [ ] Refactor: extract middleware, clean error messages (TDD REFACTOR)

**Acceptance Criteria:**
- [ ] Valid credentials → 200 + JWT token
- [ ] Invalid credentials → 401 with safe error message (no user enumeration)
- [ ] Expired/invalid token → 401 on protected routes
- [ ] Logout invalidates the token immediately
- [ ] All 4 test cases (happy path + 3 error cases) pass

---

#### STORY-004 — Contacts CRUD API (Backend Developer)
**As a** recruiter, **I want** to create, read, update, and delete contacts **so that** I can manage our candidate and client database.

**Priority:** Must
**Points:** 5
**Assignee:** Backend Developer

**Tasks:**
- [ ] Write failing CRUD tests first (TDD RED): GET list, GET single, POST create, PUT update, DELETE, 404 cases, auth guard
- [ ] `GET /contacts` — paginated list (page, limit), returns contacts with their tags
- [ ] `GET /contacts/:id` — single contact with full tag list
- [ ] `POST /contacts` — create with Zod validation (name required, email format)
- [ ] `PUT /contacts/:id` — update, returns updated contact
- [ ] `DELETE /contacts/:id` — soft delete or hard delete (confirm with PM — hard delete for MVP)
- [ ] All endpoints require valid JWT
- [ ] Make all tests pass (TDD GREEN)
- [ ] Refactor: clean error responses, consistent response shape `{ data, error, pagination }` (TDD REFACTOR)

**Acceptance Criteria:**
- [ ] All 5 CRUD operations work correctly
- [ ] Responses include associated tags array
- [ ] Pagination works (default 25 per page)
- [ ] 401 on missing/invalid JWT
- [ ] 404 on unknown contact ID
- [ ] Zod validation errors return 422 with field-level messages

---

#### STORY-005 — Tags API (Backend Developer)
**As a** recruiter, **I want** to assign multiple tags to contacts and create custom tags **so that** I can categorise candidates and clients flexibly.

**Priority:** Must
**Points:** 5
**Assignee:** Backend Developer

**Tasks:**
- [ ] Write failing tag tests first (TDD RED): list tags, create custom tag, assign tag to contact, remove tag from contact, duplicate tag name
- [ ] `GET /tags` — list all tags (system + custom), sorted by name
- [ ] `POST /tags` — create custom tag (name required, unique; colour optional)
- [ ] `POST /contacts/:id/tags` — assign tag to contact (idempotent)
- [ ] `DELETE /contacts/:id/tags/:tagId` — remove tag from contact
- [ ] Prevent deletion of system tags via API
- [ ] Make all tests pass (TDD GREEN)
- [ ] Refactor (TDD REFACTOR)

**Acceptance Criteria:**
- [ ] All 5 system tags always present in GET /tags response
- [ ] Custom tags can be created with unique name validation
- [ ] Tags can be assigned/removed from contacts
- [ ] Duplicate tag name returns 409 Conflict
- [ ] System tags cannot be deleted (403)

---

#### STORY-006 — Full-Text Search & Filtering API (Backend Developer)
**As a** recruiter, **I want** to search contacts by name, email, or company and filter by tag **so that** I can find the right person instantly.

**Priority:** Must
**Points:** 5
**Assignee:** Backend Developer

**Tasks:**
- [ ] Write failing search tests first (TDD RED): search by name, search by email, search by company, filter by tag, combined search+filter, empty results
- [ ] Add `q` query param to `GET /contacts` → PostgreSQL full-text search using GIN index (plainto_tsquery)
- [ ] Add `tag` query param → filter contacts by tag name or ID
- [ ] Add `sortBy` + `sortOrder` query params (created_at, name, company)
- [ ] Ensure pagination still works with search active
- [ ] Make all tests pass (TDD GREEN)
- [ ] Refactor: extract search query builder (TDD REFACTOR)

**Acceptance Criteria:**
- [ ] `GET /contacts?q=sarah` returns contacts matching name/email/company
- [ ] `GET /contacts?tag=candidate` returns only tagged contacts
- [ ] Combined `?q=jones&tag=placed` filters correctly
- [ ] Empty search term returns full paginated list
- [ ] Response time <200ms for 10,000 contacts (GIN index ensures this)

---

#### STORY-007 — CSV Import & Export API (Backend Developer)
**As a** recruiter, **I want** to import contacts from a CSV and export my full database **so that** I can migrate data and create backups.

**Priority:** Must
**Points:** 5
**Assignee:** Backend Developer

**Tasks:**
- [ ] Write failing CSV tests first (TDD RED): valid import, missing required column, malformed CSV, export with contacts, export empty DB
- [ ] `POST /contacts/import` — multipart/form-data CSV upload; parse with fast-csv or papaparse; validate each row (name required); return summary (imported, skipped, errors)
- [ ] `GET /contacts/export` — streams CSV download with all contacts + tags; Content-Disposition: attachment
- [ ] CSV format spec: `name,email,phone,company,tags` (tags comma-separated in quotes)
- [ ] Make all tests pass (TDD GREEN)
- [ ] Refactor (TDD REFACTOR)

**Acceptance Criteria:**
- [ ] Valid 3,000-row CSV imports without timeout
- [ ] Import returns `{ imported: N, skipped: M, errors: [...] }` summary
- [ ] Rows missing `name` are skipped with row number in error list
- [ ] Export downloads a valid CSV with all contacts
- [ ] Export includes tags as quoted comma-separated value in tags column

---

### Sprint 1 Summary

| Story | Assignee | Points | Priority |
|-------|----------|--------|----------|
| STORY-001: Design System | UX Designer | 3 | Must |
| STORY-002: DB Schema | Backend Dev | 3 | Must |
| STORY-003: JWT Auth | Backend Dev | 5 | Must |
| STORY-004: Contacts CRUD | Backend Dev | 5 | Must |
| STORY-005: Tags API | Backend Dev | 5 | Must |
| STORY-006: Search & Filter | Backend Dev | 5 | Must |
| STORY-007: CSV Import/Export | Backend Dev | 5 | Must |

**Sprint 1 Total:** 31 points

**Sprint 1 Definition of Done:**
- [ ] All backend API tests passing (target: ≥80% coverage)
- [ ] Design system document complete and reviewed by PM
- [ ] Docker Compose starts API + DB cleanly
- [ ] All endpoints return consistent JSON shape
- [ ] No open blockers

---

## Sprint 2 — Frontend + Testing + Deployment (2026-03-28 → 2026-04-04)

### Milestone: Frontend

#### STORY-008 — App Shell & Navigation (Frontend Developer + UX Designer review)
**As a** recruiter, **I want** a clear layout with navigation **so that** I can move between sections efficiently.

**Priority:** Must
**Points:** 3
**Assignee:** Frontend Developer
**UX review:** Required after implementation

**Tasks:**
- [ ] Write failing component tests first (TDD RED): renders nav items, dark mode toggle, responsive collapse
- [ ] React app scaffold: Vite + React 19 + Tailwind CSS 4 + React Router
- [ ] App shell: sidebar nav (desktop), bottom nav / hamburger menu (mobile <768px)
- [ ] Dark mode: Tailwind `dark:` classes + toggle button (persists to localStorage)
- [ ] Route structure: `/` → contacts list, `/contacts/:id` → contact detail, `/login` → auth
- [ ] Loading states and error boundary
- [ ] Make tests pass (TDD GREEN)
- [ ] UX Designer reviews against STORY-001 shell spec
- [ ] Refactor (TDD REFACTOR)

**Acceptance Criteria:**
- [ ] Sidebar renders on desktop (≥768px), collapses on mobile
- [ ] Dark mode toggle switches theme; preference persists on refresh
- [ ] All nav links render and route correctly
- [ ] Keyboard navigation works (Tab order, Enter/Space for interactive elements)

---

#### STORY-009 — Authentication UI (Frontend Developer + UX Designer review)
**As a** recruiter, **I want** a login screen **so that** I can securely access the app.

**Priority:** Must
**Points:** 3
**Assignee:** Frontend Developer
**UX review:** Required after implementation

**Tasks:**
- [ ] Write failing auth UI tests first (TDD RED): renders form, submit with valid creds, error on bad creds, loading state
- [ ] Login form: email + password fields, submit button, error message area
- [ ] Call `POST /auth/login`, store JWT in localStorage (or httpOnly cookie — discuss with backend dev)
- [ ] Redirect to `/` on success; show error message on 401
- [ ] Protected route HOC: redirect to `/login` if no valid JWT
- [ ] Make tests pass (TDD GREEN)
- [ ] UX Designer reviews against login component spec
- [ ] Refactor (TDD REFACTOR)

**Acceptance Criteria:**
- [ ] Login form validates email format client-side
- [ ] Loading spinner shown while request in flight
- [ ] Error message shown on failed login (generic, no user enumeration)
- [ ] Unauthenticated users redirected to `/login`
- [ ] JWT stored securely; logout clears it

---

#### STORY-010 — Contact List View (Frontend Developer + UX Designer review)
**As a** recruiter, **I want** to see all contacts in a searchable, filterable list **so that** I can quickly find anyone in the database.

**Priority:** Must
**Points:** 5
**Assignee:** Frontend Developer
**UX review:** Required after implementation

**Tasks:**
- [ ] Write failing list view tests first (TDD RED): renders contacts, empty state, loading skeleton, search input triggers API call
- [ ] Table component (desktop) + card list (mobile ≤768px) displaying: name, email, company, tag badges
- [ ] Search bar: debounced input (300ms) → `GET /contacts?q=...` — updates results without page reload
- [ ] Tag filter: dropdown/multi-select → `GET /contacts?tag=...`
- [ ] Pagination controls (prev/next, page indicator)
- [ ] Loading skeleton while fetching
- [ ] Empty state: illustration/message when no contacts found
- [ ] Make tests pass (TDD GREEN)
- [ ] UX Designer reviews against contact list component spec
- [ ] Refactor (TDD REFACTOR)

**Acceptance Criteria:**
- [ ] Typing in search updates results within 300ms debounce (no full reload)
- [ ] Tag filter works independently and combined with search
- [ ] Pagination controls navigate correctly
- [ ] Table layout on desktop (≥768px), card layout on mobile (<768px)
- [ ] Loading skeleton shows during API request
- [ ] Empty state renders when no results

---

#### STORY-011 — Contact Create / Edit / Delete (Frontend Developer + UX Designer review)
**As a** recruiter, **I want** to add, edit, and delete contacts **so that** I can keep the database up to date.

**Priority:** Must
**Points:** 5
**Assignee:** Frontend Developer
**UX review:** Required after implementation

**Tasks:**
- [ ] Write failing form tests first (TDD RED): create form renders, validation errors, submit creates contact, edit pre-fills form, delete confirmation
- [ ] Contact form (drawer/modal): name*, email, phone, company, tag multi-select
- [ ] Create mode: `POST /contacts` → success toast → add to list
- [ ] Edit mode (click contact row): `PUT /contacts/:id` → success toast → update in list
- [ ] Delete: confirmation dialog → `DELETE /contacts/:id` → remove from list
- [ ] Tag input: searchable multi-select + "create new tag" inline option
- [ ] Client-side validation: name required, email format
- [ ] Server-side error display (422 field errors, 409 duplicate)
- [ ] Make tests pass (TDD GREEN)
- [ ] UX Designer reviews against form + drawer component spec
- [ ] Refactor (TDD REFACTOR)

**Acceptance Criteria:**
- [ ] Form prevents submission when name is empty
- [ ] Email field validates format
- [ ] Success toast appears on create/edit/delete
- [ ] Deleted contact disappears from list immediately (optimistic update or refetch)
- [ ] Tag multi-select shows all existing tags; inline create works
- [ ] Form works correctly on mobile

---

#### STORY-012 — CSV Import & Export UI (Frontend Developer + UX Designer review)
**As a** recruiter, **I want** to import a CSV file and export all contacts **so that** I can migrate data and share it with colleagues.

**Priority:** Must
**Points:** 3
**Assignee:** Frontend Developer
**UX review:** Required after implementation

**Tasks:**
- [ ] Write failing import/export tests first (TDD RED): file input accepts CSV, success summary shown, error rows displayed, export triggers download
- [ ] Import: file picker (accepts .csv only), upload to `POST /contacts/import`, show summary modal (imported N, skipped M, errors list)
- [ ] Export: "Export CSV" button → triggers `GET /contacts/export` download
- [ ] Progress indicator during import
- [ ] Make tests pass (TDD GREEN)
- [ ] UX Designer reviews component
- [ ] Refactor (TDD REFACTOR)

**Acceptance Criteria:**
- [ ] File picker only accepts .csv files
- [ ] Import shows summary with count of imported/skipped/errors
- [ ] Error rows show row number and reason
- [ ] Export button downloads a CSV file (not a blank page)
- [ ] Both work on mobile

---

### Milestone: Testing

#### STORY-013 — End-to-End Test Suite (Backend Developer + Frontend Developer)
**As a** QA engineer, **I want** a full end-to-end test suite **so that** every acceptance criterion is automatically verifiable.

**Priority:** Must
**Points:** 5
**Assignee:** Backend Developer + Frontend Developer (coordinated by PM)

**Tasks:**
- [ ] Backend: run full Jest/supertest suite; verify ≥80% coverage on critical paths (auth, contacts, tags, CSV)
- [ ] Frontend: run Vitest + Testing Library suite; verify all component tests pass
- [ ] Integration smoke test: Docker Compose up → login → create contact → search → export CSV → logout
- [ ] Accessibility check: run axe-core on contact list view and login page
- [ ] Fix any failing tests or coverage gaps

**Acceptance Criteria:**
- [ ] All backend tests pass (0 failures)
- [ ] All frontend component tests pass (0 failures)
- [ ] Backend coverage ≥80% on auth + contacts + tags + CSV routes
- [ ] No critical axe-core accessibility violations
- [ ] Docker Compose smoke test passes end-to-end

---

### Milestone: Deployment

#### STORY-014 — Docker Compose & README (Backend Developer + DevOps)
**As a** developer / client, **I want** a single `docker-compose up` to start the full stack **so that** the demo can be run without setup friction.

**Priority:** Must
**Points:** 5
**Assignee:** Backend Developer (DevOps support as needed)

**Tasks:**
- [ ] `docker-compose.yml` with 3 services: `db` (postgres:16), `api` (Node.js multi-stage build), `web` (Nginx serving Vite build)
- [ ] Environment variables via `.env.example` (DB credentials, JWT_SECRET, PORT)
- [ ] DB init: entrypoint script runs migrations + seeds on first `up`
- [ ] Health checks: `api` waits for `db` to be ready (pg_isready)
- [ ] `web` proxies `/api` to the `api` service via Nginx config
- [ ] `README.md`: prerequisites, `docker compose up` instructions, default login credentials, API base URL
- [ ] Test: cold-start `docker compose up` → app accessible at http://localhost:3000

**Acceptance Criteria:**
- [ ] `docker compose up` starts all 3 services with no manual steps
- [ ] App accessible at http://localhost:3000
- [ ] Login with seeded credentials works on first boot
- [ ] README covers all setup steps in under 5 minutes
- [ ] `.env.example` documented for all required variables

---

### Sprint 2 Summary

| Story | Assignee | Points | Priority |
|-------|----------|--------|----------|
| STORY-008: App Shell | Frontend Dev | 3 | Must |
| STORY-009: Auth UI | Frontend Dev | 3 | Must |
| STORY-010: Contact List | Frontend Dev | 5 | Must |
| STORY-011: Contact CRUD UI | Frontend Dev | 5 | Must |
| STORY-012: CSV UI | Frontend Dev | 3 | Must |
| STORY-013: E2E Testing | Backend + Frontend | 5 | Must |
| STORY-014: Docker + README | Backend Dev | 5 | Must |

**Sprint 2 Total:** 29 points (+ 3 UX review points embedded across UI stories)

**Sprint 2 Definition of Done:**
- [ ] All frontend component tests pass
- [ ] All backend tests still passing
- [ ] Docker Compose cold-start works end-to-end
- [ ] UX Designer has reviewed and approved all UI stories
- [ ] Accessibility: no critical axe-core violations
- [ ] Demo login credentials documented in README

---

## Milestone → Postgres Mapping

The following milestones are pre-created in the project database. All stories must be linked to the correct milestone ID when created as tasks.

| Milestone Name | Stories |
|---------------|---------|
| Design | STORY-001 |
| Backend | STORY-002, STORY-003, STORY-004, STORY-005, STORY-006, STORY-007 |
| Frontend | STORY-008, STORY-009, STORY-010, STORY-011, STORY-012 |
| Testing | STORY-013 |
| Deployment | STORY-014 |

---

## Engineer Task Breakdown (gigforge-dev-backend + gigforge-dev-frontend)

### Backend Engineer (`gigforge-dev-backend`) — Sprint 1

| Task | Story | TDD Cycle | Est. |
|------|-------|-----------|------|
| Write schema migration files (users, contacts, tags, contact_tags) + GIN index | STORY-002 | RED → GREEN → REFACTOR | 3h |
| Seed system tags + demo admin user | STORY-002 | — | 1h |
| Implement `POST /auth/login` + `POST /auth/logout` + JWT middleware | STORY-003 | RED → GREEN → REFACTOR | 4h |
| Implement `GET/POST/PUT/DELETE /contacts` (paginated, with tags) | STORY-004 | RED → GREEN → REFACTOR | 5h |
| Implement `GET /tags`, `POST /tags`, tag assign/remove endpoints | STORY-005 | RED → GREEN → REFACTOR | 4h |
| Add full-text search (`?q=`), tag filter (`?tag=`), sort params to contacts list | STORY-006 | RED → GREEN → REFACTOR | 4h |
| Implement `POST /contacts/import` (CSV multipart), `GET /contacts/export` | STORY-007 | RED → GREEN → REFACTOR | 5h |

**Sprint 1 Backend Total: ~26h**

### Frontend Engineer (`gigforge-dev-frontend`) — Sprint 2

| Task | Story | TDD Cycle | Est. |
|------|-------|-----------|------|
| Scaffold Vite + React 19 + Tailwind 4 + React Router; implement AppShell (sidebar/mobile nav) + dark mode toggle | STORY-008 | RED → GREEN → REFACTOR | 4h |
| Login page + auth API integration + protected route HOC | STORY-009 | RED → GREEN → REFACTOR | 3h |
| ContactsPage: table (desktop) + card list (mobile), SearchBar (debounced 300ms), TagFilter, Pagination | STORY-010 | RED → GREEN → REFACTOR | 6h |
| ContactForm (create/edit drawer), DeleteConfirm dialog, TagMultiSelect with inline create | STORY-011 | RED → GREEN → REFACTOR | 6h |
| CsvImport (file picker + summary modal) + CsvExport button | STORY-012 | RED → GREEN → REFACTOR | 3h |
| E2E integration: full Vitest suite + axe-core accessibility pass + Docker smoke test | STORY-013 | — | 4h |

**Sprint 2 Frontend Total: ~26h**

### Backend Engineer (`gigforge-dev-backend`) — Sprint 2

| Task | Story | Est. |
|------|-------|------|
| `docker-compose.yml` (db + api + web services), multi-stage Dockerfile for api, Nginx config for web | STORY-014 | 4h |
| DB init entrypoint script (migrations + seeds on first boot), health checks (pg_isready) | STORY-014 | 2h |
| `.env.example`, `README.md` (setup, demo credentials, API URL) | STORY-014 | 1h |
| Cold-start smoke test + fix any Docker networking issues | STORY-014 | 1h |
| Backend: run full Jest suite, verify ≥80% coverage, fix any gaps | STORY-013 | 2h |

**Sprint 2 Backend Total: ~10h**

---

## UX Designer Task Breakdown (embedded in `gigforge-pm`)

### Sprint 1 — Design Deliverables (STORY-001)

| Task | Deliverable | Est. |
|------|-------------|------|
| Define design tokens: colour palette (light + dark), typography scale, spacing system, Tailwind config overrides | `design/design-system.md` | 2h |
| Write component specs: Layout shell (sidebar + topbar), Contact card, Contact table row, Search/filter bar, Tag badge | `design/component-specs.md` | 2h |
| Write component specs: Contact detail drawer/modal, Empty state, Loading skeleton, Error state, Login form | `design/component-specs.md` | 1h |
| Define dark mode strategy + FOUC prevention approach | `design/design-system.md` | 0.5h |
| Accessibility checklist: WCAG 2.1 AA contrast ratios, keyboard nav map, ARIA roles, focus order | `design/component-specs.md` | 1h |
| Responsive behaviour doc: sidebar collapse (<768px), table → card list on mobile | `design/component-specs.md` | 0.5h |

**Sprint 1 UX Total: ~7h**

### Sprint 2 — UX Review Gates

| Task | Story | Timing | Est. |
|------|-------|--------|------|
| Review AppShell + dark mode toggle against shell spec | STORY-008 | After implementation | 1h |
| Review Login page against login component spec | STORY-009 | After implementation | 0.5h |
| Review Contact List (table + card + search + filter + pagination) against spec | STORY-010 | After implementation | 1h |
| Review ContactForm drawer, DeleteConfirm dialog, TagMultiSelect against spec | STORY-011 | After implementation | 1h |
| Review CsvImport + CsvExport components against spec | STORY-012 | After implementation | 0.5h |
| Final full-app visual QA: dark mode, mobile (375px), desktop (1440px) | All UI | End of Sprint 2 | 1h |

**Sprint 2 UX Total: ~5h**

---

## Approval Gate (Non-Negotiable)

After Sprint 2, before delivery to Sarah:

### QA Engineer (gigforge-qa)
- Run full automated test suite
- Manual test every acceptance criterion
- Verify Docker Compose cold-start
- Test on mobile (375px) and desktop (1440px)
- Write test report: APPROVED / CONDITIONAL / REJECTED

### Client Advocate (gigforge-advocate)
- Read only the client brief and final deliverable
- Experience the app as Sarah would
- Score on: brief match, value for money, usability, professionalism, completeness
- Write review: APPROVED / CONDITIONAL / REJECTED

**Both must APPROVE before delivery email is sent.**

---

## Team Assignments

| Role | Agent | Stories |
|------|-------|---------|
| Project Manager | gigforge-pm (Jamie Okafor) | All — sprint oversight, TDD enforcement |
| UX Designer | gigforge (embedded) | STORY-001, review STORY-008 to STORY-012 |
| Backend Developer | gigforge-dev-backend | STORY-002 to STORY-007, STORY-013, STORY-014 |
| Frontend Developer | gigforge-dev-frontend | STORY-008 to STORY-013 |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| CSV import performance at 3,000 rows | Low | Medium | Stream parse with fast-csv; batch insert with pg transactions |
| JWT storage (localStorage vs httpOnly cookie) | Low | Medium | Decide with backend dev in STORY-003; document choice |
| Dark mode FOUC (flash of unstyled content) | Medium | Low | Apply dark class on `<html>` before React hydrates |
| Docker networking between api + db | Low | Medium | Use service names as hostnames; health checks with pg_isready |

---

## Communication

- **Progress updates to Sarah:** PM sends midpoint update at end of Sprint 1 (2026-03-28)
- **Client contact:** gigforge-pm only (NOT Sales)
- **Demo delivery target:** 2026-04-04
- **Email:** sarah.chen.test@gmail.com
