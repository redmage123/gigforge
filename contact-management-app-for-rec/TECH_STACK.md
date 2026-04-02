# Tech Stack Decision
## Project: Contact Management App for Recruitment Agency
## Date: 2026-03-21
## Decision By: Chris Novak (CTO)

---

### Backend

- **Language:** TypeScript (Node.js 22 LTS)
  - Type safety eliminates an entire class of runtime bugs for a team who will maintain this long-term. Node 22 LTS is stable, well-supported, and matches our existing demo projects — shared institutional knowledge across the team.

- **Framework:** Express 4
  - Minimal, battle-tested, first-class TypeScript support. We've already shipped several production APIs with Express (todo-rest-api, saas-billing-api, job-board) so the team has zero ramp-up cost.

- **Database:** PostgreSQL 16
  - 10,000 contacts is nowhere near Postgres limits, but we get genuine benefits: GIN full-text search index on name/email/company (plainto_tsquery), FK constraints for contact_tags join table, ACID transactions for CSV batch import, and pgvector if we ever add AI search later. SQLite would work at this scale but lacks the GIN index and concurrent write safety.

- **Key libraries:**
  - `express` 4.x — HTTP framework
  - `pg` 8.x — PostgreSQL client (node-postgres)
  - `jsonwebtoken` 9.x — JWT sign/verify
  - `bcryptjs` 2.x — password hashing
  - `zod` 3.x — request validation with field-level error messages
  - `multer` 1.x — multipart/form-data for CSV upload
  - `fast-csv` 4.x — streaming CSV parse/format (handles 3,000 rows without buffering)
  - `cors` 2.x — CORS headers
  - `helmet` 7.x — security headers
  - `dotenv` 16.x — environment variable loading
  - `ts-node` / `tsx` — TypeScript execution in dev
  - `typescript` 5.x — type compiler
  - `jest` 29.x + `supertest` 6.x — test runner + HTTP integration tests
  - `@types/*` — TypeScript declarations

---

### Frontend

- **Framework:** React 19 + Vite
  - React 19 brings the new compiler and improved concurrent features. Vite gives us sub-second HMR and a lean build output. The sprint plan specifies this stack; it's consistent with our job-board and gigforge-website projects.

- **Styling:** Tailwind CSS 4
  - Utility-first CSS removes naming friction, built-in dark mode with `dark:` variants, JIT compilation keeps bundle small. Tailwind 4's CSS-native config makes customisation straightforward.

- **Build tool:** Vite 6.x
  - Fastest dev experience available. Native ESM, tree-shaking, minimal config. Output is a static bundle served via Nginx in production.

- **Key libraries:**
  - `react` 19.x + `react-dom` 19.x
  - `react-router-dom` 7.x — client-side routing (/, /contacts/:id, /login)
  - `@tanstack/react-query` 5.x — server state management, caching, background refetch
  - `axios` 1.x — HTTP client with interceptors for JWT attachment
  - `react-hot-toast` 2.x — non-blocking success/error toasts
  - `@headlessui/react` 2.x — accessible modal, dropdown, dialog primitives (unstyled, Tailwind-friendly)
  - `lucide-react` 0.x — icon library (consistent with gigforge-website)
  - `vitest` 2.x + `@testing-library/react` 16.x + `@testing-library/user-event` 14.x — component tests
  - `msw` 2.x — API mocking in tests (Mock Service Worker)

---

### Infrastructure

- **Containerization:** Docker + Docker Compose v2
  - Three services: `db`, `api`, `web`. Docker Compose gives Sarah's team a single `docker compose up` to run the full stack on any machine. No external dependencies.

- **Deployment strategy:** Multi-service Docker Compose
  - `db`: postgres:16-alpine (lightweight, production-grade)
  - `api`: Node.js multi-stage build (deps → builder → runner), non-root user, internal port 4000
  - `web`: Nginx alpine serving Vite static build, proxies `/api` to `api:4000`

- **Port mapping:**
  - `db`: internal 5432, not exposed externally (only `api` can reach it via Docker network)
  - `api`: internal 4000, not exposed externally
  - `web`: internal 80, exposed as `localhost:3000` (single entry point for everything)

- **Reverse proxy:** Nginx (`web` service)
  - Serves the Vite-built React app at `/`
  - Proxies `/api/*` → `http://api:4000/` (strips `/api` prefix)
  - Handles gzip compression, cache headers for static assets
  - No TLS in dev (handled by hosting provider / Cloudflare in production)

---

### File Structure

```
contact-management-app-for-rec/
├── docker-compose.yml
├── .env.example
├── README.md
├── SPRINT_PLAN.md
├── TECH_STACK.md
├── design/
│   ├── design-system.md
│   └── component-specs.md
├── docs/
│   └── adr/
│       ├── 0001-choice-of-backend-language.md
│       ├── 0002-choice-of-database.md
│       ├── 0003-choice-of-frontend-framework.md
│       ├── 0004-deployment-strategy.md
│       ├── 0005-authentication-strategy.md
│       ├── 0006-api-design.md
│       └── 0007-frontend-state-management.md
├── api/
│   ├── package.json
│   ├── tsconfig.json
│   ├── jest.config.ts
│   ├── Dockerfile
│   ├── .env.example
│   ├── src/
│   │   ├── index.ts                    # Express app entry point
│   │   ├── app.ts                      # Express app factory (testable)
│   │   ├── config.ts                   # Env vars + config object
│   │   ├── db/
│   │   │   ├── index.ts                # pg Pool singleton
│   │   │   ├── migrations/
│   │   │   │   ├── 001_create_users.sql
│   │   │   │   ├── 002_create_contacts.sql
│   │   │   │   ├── 003_create_tags.sql
│   │   │   │   ├── 004_create_contact_tags.sql
│   │   │   │   └── 005_seed_system_tags.sql
│   │   │   └── migrate.ts              # Migration runner
│   │   ├── middleware/
│   │   │   ├── auth.ts                 # JWT verification middleware
│   │   │   ├── errorHandler.ts         # Global error handler
│   │   │   └── validate.ts             # Zod validation middleware
│   │   ├── routes/
│   │   │   ├── auth.ts                 # POST /auth/login, POST /auth/logout
│   │   │   ├── contacts.ts             # CRUD + search + CSV import/export
│   │   │   └── tags.ts                 # GET /tags, POST /tags
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   ├── contacts.controller.ts
│   │   │   └── tags.controller.ts
│   │   ├── services/
│   │   │   ├── auth.service.ts         # login, logout, token blacklist
│   │   │   ├── contacts.service.ts     # CRUD, search, pagination
│   │   │   ├── tags.service.ts         # tag management
│   │   │   └── csv.service.ts          # import/export logic
│   │   └── types/
│   │       └── index.ts                # Shared TypeScript types/interfaces
│   └── tests/
│       ├── setup.ts                    # Jest global setup (test DB)
│       ├── auth.test.ts
│       ├── contacts.test.ts
│       ├── tags.test.ts
│       ├── search.test.ts
│       └── csv.test.ts
├── web/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── index.html
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── src/
│   │   ├── main.tsx                    # React entry point
│   │   ├── App.tsx                     # Router + providers
│   │   ├── api/
│   │   │   ├── client.ts               # Axios instance with JWT interceptor
│   │   │   ├── auth.ts                 # Auth API calls
│   │   │   ├── contacts.ts             # Contacts API calls
│   │   │   └── tags.ts                 # Tags API calls
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.tsx        # Sidebar + topbar wrapper
│   │   │   │   ├── Sidebar.tsx         # Desktop nav
│   │   │   │   └── MobileNav.tsx       # Mobile bottom nav / hamburger
│   │   │   ├── contacts/
│   │   │   │   ├── ContactsTable.tsx   # Desktop table view
│   │   │   │   ├── ContactCard.tsx     # Mobile card view
│   │   │   │   ├── ContactForm.tsx     # Create/edit drawer form
│   │   │   │   ├── ContactDetail.tsx   # Single contact detail panel
│   │   │   │   ├── DeleteConfirm.tsx   # Delete confirmation dialog
│   │   │   │   ├── SearchBar.tsx       # Debounced search input
│   │   │   │   └── TagFilter.tsx       # Tag multi-select filter
│   │   │   ├── tags/
│   │   │   │   ├── TagBadge.tsx        # Coloured tag chip
│   │   │   │   └── TagMultiSelect.tsx  # Searchable multi-select + inline create
│   │   │   ├── csv/
│   │   │   │   ├── CsvImport.tsx       # File picker + upload + summary modal
│   │   │   │   └── CsvExport.tsx       # Export button
│   │   │   └── ui/
│   │   │       ├── Button.tsx
│   │   │       ├── Input.tsx
│   │   │       ├── Modal.tsx
│   │   │       ├── Drawer.tsx
│   │   │       ├── Skeleton.tsx
│   │   │       ├── EmptyState.tsx
│   │   │       ├── ErrorBoundary.tsx
│   │   │       ├── Pagination.tsx
│   │   │       └── DarkModeToggle.tsx
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   └── ContactsPage.tsx
│   │   ├── hooks/
│   │   │   ├── useContacts.ts          # React Query hooks for contacts
│   │   │   ├── useTags.ts              # React Query hooks for tags
│   │   │   └── useAuth.ts              # Auth state + logout
│   │   ├── context/
│   │   │   └── AuthContext.tsx         # JWT storage + auth state
│   │   ├── types/
│   │   │   └── index.ts                # Shared TS types (Contact, Tag, User, etc.)
│   │   └── utils/
│   │       ├── debounce.ts
│   │       └── formatters.ts
│   └── src/__tests__/
│       ├── setup.ts                    # Vitest setup (MSW, Testing Library)
│       ├── AppShell.test.tsx
│       ├── LoginPage.test.tsx
│       ├── ContactsPage.test.tsx
│       ├── ContactForm.test.tsx
│       ├── SearchBar.test.tsx
│       ├── TagFilter.test.tsx
│       ├── CsvImport.test.tsx
│       └── CsvExport.test.tsx
└── db/
    └── init.sh                         # Entrypoint: runs migrations + seeds
```

---

### API Design

All endpoints are prefixed `/api/v1`. The Nginx `web` service proxies `/api` → `api:4000/`.

#### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/login` | None | Email + password → JWT token |
| POST | `/api/v1/auth/logout` | Required | Blacklist current token |

**POST /api/v1/auth/login**
Request: `{ "email": "string", "password": "string" }`
Response 200: `{ "data": { "token": "string", "user": { "id", "email", "name" } } }`
Response 401: `{ "error": "Invalid credentials" }`

**POST /api/v1/auth/logout**
Response 200: `{ "data": { "message": "Logged out" } }`

---

#### Contacts

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/contacts` | Required | List contacts (paginated, searchable, filterable) |
| GET | `/api/v1/contacts/:id` | Required | Single contact with tags |
| POST | `/api/v1/contacts` | Required | Create contact |
| PUT | `/api/v1/contacts/:id` | Required | Update contact |
| DELETE | `/api/v1/contacts/:id` | Required | Delete contact (hard delete) |
| POST | `/api/v1/contacts/import` | Required | Bulk import from CSV (multipart/form-data) |
| GET | `/api/v1/contacts/export` | Required | Download all contacts as CSV |

**GET /api/v1/contacts**
Query params:
- `q` — full-text search string (name, email, company)
- `tag` — filter by tag name or ID
- `page` — page number (default: 1)
- `limit` — results per page (default: 25, max: 100)
- `sortBy` — field: `name` | `company` | `created_at` (default: `created_at`)
- `sortOrder` — `asc` | `desc` (default: `desc`)

Response 200:
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Sarah Chen",
      "email": "sarah@example.com",
      "phone": "+44 7911 123456",
      "company": "TechRecruit Ltd",
      "notes": "Placed at Acme 2024",
      "created_at": "2026-03-21T10:00:00Z",
      "updated_at": "2026-03-21T10:00:00Z",
      "tags": [
        { "id": "uuid", "name": "candidate", "colour": "#3B82F6", "is_system": true }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 3000,
    "pages": 120
  }
}
```

**POST /api/v1/contacts**
Request: `{ "name": "string (required)", "email": "string (email format)", "phone": "string", "company": "string", "notes": "string", "tagIds": ["uuid"] }`
Response 201: `{ "data": { ...contact } }`
Response 422: `{ "error": "Validation failed", "fields": { "name": "Required" } }`

**POST /api/v1/contacts/import**
Request: `multipart/form-data` with `file` field (CSV)
CSV columns: `name,email,phone,company,tags` (tags = quoted comma-separated tag names)
Response 200: `{ "data": { "imported": 2987, "skipped": 13, "errors": [{ "row": 45, "reason": "Missing name" }] } }`

**GET /api/v1/contacts/export**
Response: `Content-Type: text/csv`, `Content-Disposition: attachment; filename="contacts.csv"`

---

#### Tags

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/tags` | Required | List all tags (system + custom) |
| POST | `/api/v1/tags` | Required | Create custom tag |
| DELETE | `/api/v1/tags/:id` | Required | Delete custom tag (system tags: 403) |
| POST | `/api/v1/contacts/:id/tags` | Required | Assign tag to contact |
| DELETE | `/api/v1/contacts/:id/tags/:tagId` | Required | Remove tag from contact |

**POST /api/v1/tags**
Request: `{ "name": "string (required, unique)", "colour": "#RRGGBB (optional)" }`
Response 201: `{ "data": { "id", "name", "colour", "is_system": false } }`
Response 409: `{ "error": "Tag name already exists" }`

---

#### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/health` | None | Liveness check |

Response 200: `{ "status": "ok", "uptime": 123.4 }`

---

### Response Shape Convention

Every response follows this envelope:
```json
{ "data": <payload or null>, "error": <string or null>, "pagination": <object or undefined> }
```

HTTP status codes:
- 200 OK, 201 Created, 204 No Content
- 400 Bad Request (malformed request)
- 401 Unauthorized (missing/invalid JWT)
- 403 Forbidden (insufficient permissions)
- 404 Not Found
- 409 Conflict (duplicate)
- 422 Unprocessable Entity (Zod validation failure — includes `fields` object)
- 500 Internal Server Error

---

### Quality Requirements

#### Backend Tests
- **Framework:** Jest 29 + Supertest 6
- **Test DB:** Separate PostgreSQL database (`contacts_test`); wiped and re-seeded between test runs
- **Coverage target:** ≥80% on auth, contacts, tags, and CSV routes
- **Coverage tool:** `jest --coverage` with `c8`
- **Config file:** `api/jest.config.ts`

#### Frontend Tests
- **Framework:** Vitest 2 + Testing Library React 16 + user-event 14
- **API mocking:** MSW 2 (Mock Service Worker — intercepts at network level)
- **Coverage target:** All components have at minimum: renders correctly, loading state, error state, happy-path interaction
- **Config file:** `web/vitest.config.ts`

#### Linting & Formatting
- **ESLint** 9.x with TypeScript plugin — both `api/` and `web/`
- **Prettier** 3.x — consistent formatting, enforced in CI
- Config files: `.eslintrc.json`, `.prettierrc` in each package

#### Accessibility
- **axe-core** 4.x — run via `@axe-core/react` in development and Vitest tests
- Target: zero critical violations on login page and contacts list

#### CI/CD
- GitHub Actions workflow (optional, for future repo handoff):
  - `ci.yml`: install → lint → test → build
  - Runs on push to `main` and on PRs
  - Matrix: Node 22 LTS

---

### Environment Variables

```
# api/.env.example
DATABASE_URL=postgres://postgres:password@db:5432/contacts
DATABASE_TEST_URL=postgres://postgres:password@db:5432/contacts_test
JWT_SECRET=change-me-in-production-minimum-32-chars
JWT_EXPIRY=24h
PORT=4000
NODE_ENV=development
```

```
# root .env.example
POSTGRES_USER=postgres
POSTGRES_PASSWORD=changeme
POSTGRES_DB=contacts
```

---

### Nginx Configuration (web/nginx.conf)

```nginx
server {
  listen 80;

  # Serve Vite build
  root /usr/share/nginx/html;
  index index.html;

  # SPA fallback
  location / {
    try_files $uri $uri/ /index.html;
  }

  # Proxy API calls
  location /api/ {
    proxy_pass http://api:4000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }

  # Static asset caching
  location ~* \.(js|css|png|jpg|svg|ico|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
}
```

---

### Seed Data

On first boot, the DB init script seeds:

**System tags** (cannot be deleted via API):
- `candidate` — `#3B82F6` (blue)
- `client` — `#10B981` (green)
- `warm lead` — `#F59E0B` (amber)
- `placed` — `#8B5CF6` (purple)
- `interviewed` — `#6B7280` (grey)

**Demo admin user:**
- Email: `admin@gigforge.ai`
- Password: `demo1234` (bcrypt hashed)
- Name: `Demo Admin`

---

## DevOps Review

**Reviewer:** DevOps Engineer (`gigforge-devops`)
**Date:** 2026-03-21
**Verdict:** ✅ FEASIBLE — with one mandatory port change and three advisory items

---

### 1. Containerization — ✅ Clear

Three-service Docker Compose (`db`, `api`, `web`) is a proven pattern on this infrastructure. Multi-stage Node.js build (deps → builder → runner) and non-root container execution are already used in `todo-rest-api`, `saas-billing-api`, and `job-board`. No containerization blockers.

---

### 2. Port Conflicts — ⚠️ ACTION REQUIRED

**Port 3000 is already in use** by `course-creator-frontend-1` (0.0.0.0:3000→3000/tcp). The proposed `localhost:3000` host mapping for the `web` service will fail to bind on startup.

**Required change:** Update `docker-compose.yml` to map the web container's internal port 80 to **host port 4098**:

```yaml
services:
  web:
    ports:
      - "4098:80"
```

This puts the app at `http://localhost:4098`, consistent with the 409x range used by other GigForge services (gigforge-website is at 4091).

All other ports are internal-only (`api:4000`, `db:5432`) and routed via the Docker Compose network — no host-level exposure, no conflicts.

---

### 3. Resource Concerns — ✅ Clear

Current host state: **13.7 GB RAM free**, **366 GB disk free**.

Estimated resource footprint at steady state:
- `postgres:16-alpine`: ~50–80 MB RAM
- Node.js API (non-root, runner stage): ~80–150 MB RAM
- Nginx (alpine): ~5–10 MB RAM
- **Total: ~150–250 MB RAM, <1 GB disk** (image layers + 10K contacts DB)

No resource concerns. The host has significant headroom.

---

### 4. Database — ✅ Clear

`postgres:16-alpine` is already deployed on this host across multiple stacks (rag-postgres on 5434, crm-postgres on 5435, cms-postgres on 5436, video-creator-db on 5437, bam-spark-postgres on 5438). It is well-proven here.

The `db` service is internal-only (port 5432 not exposed to host), which is correct. Each Docker Compose stack gets its own isolated bridge network, so there is no inter-stack database interference.

---

### 5. Security — ⚠️ ADVISORY

Three items to address before any non-local deployment:

**a) Weak defaults in `.env.example`**
- `JWT_SECRET=change-me-in-production-minimum-32-chars` — must be replaced with a cryptographically random 32+ char secret before production use.
- `POSTGRES_PASSWORD=changeme` — rotate before any internet-accessible deployment.
- These are acceptable for local dev but the README should include a mandatory "production checklist" section.

**b) Demo admin seed credentials**
- `admin@gigforge.ai` / `demo1234` — the seed script creates this user unconditionally. Add a guard so the demo user is only seeded when `NODE_ENV=development`, or remove it from the production seed entirely.

**c) JWT token blacklist (in-memory)**
- The auth spec shows a logout token blacklist. If this is stored in Node.js process memory (as in `todo-rest-api`), it will be cleared on every container restart, silently un-blacklisting tokens that were explicitly invalidated.
- For this app (internal recruitment tool, 24h JWT expiry) this is an acceptable risk in dev. For production, persist the blacklist to PostgreSQL or Redis.

---

### 6. Routing Note (Engineering Heads-Up)

Express route ordering: `POST /api/v1/contacts/import` must be registered **before** `GET /api/v1/contacts/:id` in the router, otherwise Express will match `import` as an `:id` parameter. Standard Express gotcha — flag for the backend dev.

---

### Summary

| Check | Status | Notes |
|-------|--------|-------|
| Containerization | ✅ Clear | Proven pattern, multi-stage build |
| Port conflicts | ⚠️ Fix required | Change host port to **4098** |
| Resources | ✅ Clear | ~250 MB footprint; 13.7 GB free |
| Database | ✅ Clear | postgres:16-alpine, internal-only |
| Security (dev) | ✅ Acceptable | Rotate secrets before production |
| Security (production) | ⚠️ Advisory | Seed guard + blacklist persistence needed |

**Approved for development build on port 4098.**
