# ContactBase — Recruitment CRM

Contact management web application for a 5-person internal recruitment agency. Manages candidates, clients, and leads with full-text search, colour-coded tags, CSV import/export, dark mode, and mobile-responsive design. Scales comfortably to 10,000 contacts.

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [Environment Variables](#environment-variables)
6. [Setup — Docker (Recommended)](#setup--docker-recommended)
7. [Setup — Local Development](#setup--local-development)
8. [API Reference](#api-reference)
9. [CSV Format](#csv-format)
10. [Running Tests](#running-tests)
11. [Production Checklist](#production-checklist)

---

## Features

| Feature | Detail |
|---------|--------|
| Full-text search | PostgreSQL GIN index on name, email, company — sub-200ms for 10K rows |
| Tagging | 5 system tags (candidate, client, warm lead, placed, interviewed) + unlimited custom tags |
| CSV import | Streaming parser, row-level error reporting, auto-creates unknown tags |
| CSV export | Streaming download — name, email, phone, company, tags |
| Dark mode | Persisted to `localStorage`, FOUC-free preload script |
| Responsive | Table on ≥768px, card list on <768px; tested at 375px and 1440px |
| Authentication | JWT (24h), bcryptjs password hashing, token blacklist on logout |
| Pagination | 25 per page default, configurable up to 100 |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Docker Compose                      │
│                                                      │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐  │
│  │  PostgreSQL │    │ Node.js    │    │   Nginx    │  │
│  │  16-alpine  │◄───│ Express API│◄───│  + React   │  │
│  │  port 5432  │    │ port 4000  │    │  port 4098 │  │
│  │  (internal) │    │ (internal) │    │ (external) │  │
│  └────────────┘    └────────────┘    └────────────┘  │
│         │                │                           │
│      db_data          /api/v1/              SPA       │
│      volume          (proxied)            fallback    │
└──────────────────────────────────────────────────────┘
```

**Request flow:** Browser → Nginx (`:4098`) → `/api/*` proxied to Express (`:4000`) → PostgreSQL.
Static React assets are served directly by Nginx; API calls are reverse-proxied.

**Key architectural decisions** (see `docs/adr/` for full rationale):

| ADR | Decision |
|-----|----------|
| [ADR-001](docs/adr/0001-choice-of-backend-language.md) | Node.js 22 LTS + TypeScript + Express 4 |
| [ADR-002](docs/adr/0002-choice-of-database.md) | PostgreSQL 16 · raw SQL via `pg` · GIN full-text index · no ORM |
| [ADR-003](docs/adr/0003-choice-of-frontend-framework.md) | React 19 · Vite 6 · Tailwind CSS 4 · Headless UI |
| [ADR-004](docs/adr/0004-deployment-strategy.md) | Docker Compose v2 · three services · TLS delegated to hosting provider |
| [ADR-005](docs/adr/0005-authentication-strategy.md) | JWT in `localStorage` · 24h expiry · in-memory blacklist (no refresh tokens) |
| [ADR-006](docs/adr/0006-api-design.md) | REST `/api/v1/` · uniform `{data, error, pagination}` envelope · Zod validation |
| [ADR-007](docs/adr/0007-frontend-state-management.md) | TanStack Query v5 for server state · React Context + `useReducer` for auth |

---

## Tech Stack

### Backend (`api/`)

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 22 LTS | Runtime |
| TypeScript | 5.3 | Type safety |
| Express | 4.18 | HTTP framework |
| PostgreSQL | 16 | Primary database |
| `pg` | 8.11 | PostgreSQL driver (raw SQL, no ORM) |
| `bcryptjs` | 2.4 | Password hashing |
| `jsonwebtoken` | 9.0 | JWT signing/verification |
| `zod` | 3.22 | Request schema validation |
| `multer` | 1.4 | Multipart file upload handling |
| `fast-csv` | 4.3 | Streaming CSV parse and format |
| `helmet` | 7.1 | HTTP security headers |
| `cors` | 2.8 | Cross-origin resource sharing |

### Frontend (`web/`)

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19 | UI library |
| Vite | 6 | Build tool and dev server |
| Tailwind CSS | 4 | Utility-first styling |
| `@headlessui/react` | latest | Accessible Modal/Drawer/Dropdown primitives |
| `@tanstack/react-query` | 5 | Server state management and caching |
| `axios` | latest | HTTP client |
| `react-router-dom` | latest | Client-side routing |
| `lucide-react` | latest | Icon set |
| `react-hot-toast` | latest | Toast notifications |

### Infrastructure

| Technology | Purpose |
|------------|---------|
| Docker Compose v2 | Multi-service orchestration |
| Nginx (alpine) | Static asset serving + API reverse proxy |
| PostgreSQL 16 alpine | Database with GIN full-text index |

---

## Project Structure

```
contact-management-app-for-rec/
├── docker-compose.yml          # Orchestrates db, api, web services
├── .env.example                # Environment variable template
├── SOFTWARE_SPEC.md            # Functional requirements (FR-001–FR-018)
├── TECH_STACK.md               # Technology choices and rationale
├── SPRINT_PLAN.md              # Two-sprint delivery breakdown
├── DESIGN.md                   # Design system, component specs, wireframes
├── RUNBOOK.md                  # Deployment, operations, and troubleshooting
├── CHANGELOG.md                # Version history
│
├── docs/
│   └── adr/                    # Architecture Decision Records
│       ├── 0001-choice-of-backend-language.md
│       ├── 0002-choice-of-database.md
│       ├── 0003-choice-of-frontend-framework.md
│       ├── 0004-deployment-strategy.md
│       ├── 0005-authentication-strategy.md
│       ├── 0006-api-design.md
│       └── 0007-frontend-state-management.md
│
├── api/                        # Node.js / Express backend
│   ├── src/
│   │   ├── index.ts            # Entry point — starts HTTP server
│   │   ├── app.ts              # createApp() — middleware, routes, error handler
│   │   ├── config.ts           # Environment variable loading
│   │   ├── types/
│   │   │   └── index.ts        # TypeScript interfaces (Contact, Tag, User, …)
│   │   ├── db/
│   │   │   ├── index.ts        # pg Pool singleton
│   │   │   └── migrate.ts      # Migration runner + demo seed
│   │   ├── middleware/
│   │   │   ├── auth.ts         # JWT Bearer token verification
│   │   │   ├── errorHandler.ts # Global Express error handler
│   │   │   └── validate.ts     # Zod schema validation factory
│   │   ├── services/
│   │   │   ├── auth.service.ts     # login(), logout(), token blacklist
│   │   │   ├── contacts.service.ts # Full CRUD + search + pagination
│   │   │   ├── tags.service.ts     # Tag CRUD + assignment
│   │   │   └── csv.service.ts      # Import/export streaming
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   ├── contacts.controller.ts
│   │   │   └── tags.controller.ts
│   │   └── routes/
│   │       ├── auth.ts
│   │       ├── contacts.ts
│   │       └── tags.ts
│   ├── tests/                  # Jest + Supertest integration tests
│   │   ├── setup.ts
│   │   ├── auth.test.ts
│   │   ├── contacts.test.ts
│   │   ├── tags.test.ts
│   │   ├── search.test.ts
│   │   └── csv.test.ts
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── jest.config.ts
│
├── backend/                    # Python/pytest black-box API test suite
│   ├── requirements.txt
│   └── tests/
│       ├── __init__.py
│       ├── conftest.py         # httpx client fixtures, test helpers
│       ├── test_api.py         # Full API endpoint coverage
│       └── test_models.py      # Pydantic response model validation
│
├── db/
│   └── migrations/             # SQL migration files (run in order)
│       ├── 001_create_users.sql
│       ├── 002_create_contacts.sql
│       ├── 003_create_tags.sql
│       ├── 004_create_contact_tags.sql
│       └── 005_seed_system_tags.sql
│
└── web/                        # React / Vite frontend
    ├── src/
    │   ├── main.tsx            # React entry point
    │   ├── App.tsx             # Router, providers, routes
    │   ├── api/                # Axios API client modules
    │   ├── context/            # AuthContext (JWT + user state)
    │   ├── hooks/              # useContacts, useTags, useAuth
    │   ├── components/
    │   │   ├── layout/         # AppShell, Sidebar, MobileNav
    │   │   ├── contacts/       # Table, Card, Form, Detail, Search, TagFilter
    │   │   ├── tags/           # TagBadge, TagMultiSelect
    │   │   ├── csv/            # CsvImport, CsvExport
    │   │   └── ui/             # Button, Input, Modal, Drawer, Pagination, …
    │   ├── pages/
    │   │   ├── LoginPage.tsx
    │   │   └── ContactsPage.tsx
    │   ├── types/index.ts
    │   └── utils/              # debounce, formatters
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── vite.config.ts
    └── vitest.config.ts
```

---

## Environment Variables

Copy `.env.example` to `.env` before starting.

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `POSTGRES_USER` | `postgres` | Yes | PostgreSQL superuser name |
| `POSTGRES_PASSWORD` | `changeme` | Yes | PostgreSQL password — **change in production** |
| `POSTGRES_DB` | `contacts` | Yes | Primary database name |
| `JWT_SECRET` | `change-me-in-production-minimum-32-chars` | Yes | HMAC secret for JWT signing — minimum 32 chars |
| `JWT_EXPIRY` | `24h` | No | JWT lifetime (e.g. `8h`, `24h`, `7d`) |
| `NODE_ENV` | `production` | No | `development` enables verbose logging |

> **Security:** Generate a strong JWT secret before any internet-facing deployment:
> ```bash
> openssl rand -hex 32
> ```

---

## Setup — Docker (Recommended)

### Prerequisites

- Docker 24+
- Docker Compose v2 (`docker compose` not `docker-compose`)

### Start

```bash
# 1. Clone / navigate to project directory
cd contact-management-app-for-rec

# 2. Copy and review environment config
cp .env.example .env
# Edit .env — change POSTGRES_PASSWORD and JWT_SECRET at minimum

# 3. Build images and start all three services
docker compose up --build

# Or run in background
docker compose up --build -d
```

The first start automatically runs all database migrations and seeds the demo admin account.

### Verify

```bash
# Check all services are running and healthy
docker compose ps

# Expected output:
# NAME                  STATUS          PORTS
# ...db-1               running (healthy)
# ...api-1              running
# ...web-1              running         0.0.0.0:4098->80/tcp
```

```bash
# Hit the health endpoint
curl http://localhost:4098/api/v1/health
# {"data":{"status":"ok","timestamp":"..."},"error":null}
```

Open **http://localhost:4098** in your browser and log in:

| Field | Value |
|-------|-------|
| Email | `admin@gigforge.ai` |
| Password | `demo1234` |

### Stop

```bash
docker compose down         # Stop containers, keep db_data volume
docker compose down -v      # Stop containers AND delete all data
```

### Rebuild after code changes

```bash
docker compose up --build
```

---

## Setup — Local Development

### Prerequisites

- Node.js 22+
- PostgreSQL 16 running locally
- npm 10+

### Database

```bash
# Create databases
createdb contacts
createdb contacts_test

# Optionally set a password
psql -c "ALTER USER postgres PASSWORD 'yourpassword';"
```

### Backend

```bash
cd api
npm install

# Create local .env
cp .env.example .env
# Edit .env:
#   DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/contacts
#   DATABASE_TEST_URL=postgres://postgres:yourpassword@localhost:5432/contacts_test
#   JWT_SECRET=any-32-char-local-dev-secret-here

# Run migrations and seed demo user
npm run migrate

# Start dev server (hot reload via tsx watch)
npm run dev
# API available at http://localhost:4000
```

### Frontend

```bash
cd web
npm install
npm run dev
# App available at http://localhost:5173
# /api requests are proxied to http://localhost:4000
```

---

## API Reference

**Base URL:** `http://localhost:4098/api/v1`

All responses use a uniform JSON envelope:

```json
{
  "data": <payload or null>,
  "error": <error message or null>,
  "pagination": { "page": 1, "limit": 25, "total": 150, "pages": 6 }
}
```

`pagination` is only present on list endpoints. On error, `data` is `null` and `error` contains a human-readable message.

---

### Health

#### `GET /health`

Returns server status. No authentication required.

**Response 200**
```json
{
  "data": { "status": "ok", "timestamp": "2026-03-21T12:00:00.000Z" },
  "error": null
}
```

---

### Authentication

#### `POST /auth/login`

Authenticate and receive a JWT token.

**Request body**
```json
{
  "email": "admin@gigforge.ai",
  "password": "demo1234"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `email` | string | Yes | Must be valid email format |
| `password` | string | Yes | Minimum 1 character |

**Response 200**
```json
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "admin@gigforge.ai",
      "name": "Admin"
    }
  },
  "error": null
}
```

**Response 401** — Invalid credentials
```json
{ "data": null, "error": "Invalid email or password" }
```

**Response 422** — Validation failure
```json
{ "data": null, "error": "email: Invalid email" }
```

---

#### `POST /auth/logout`

Invalidate the current JWT token. Requires authentication.

**Headers**
```
Authorization: Bearer <token>
```

**Response 200**
```json
{ "data": { "message": "Logged out" }, "error": null }
```

---

### Contacts

All contacts endpoints require `Authorization: Bearer <token>`.

---

#### `GET /contacts`

List contacts with optional search, tag filter, sort, and pagination.

**Query parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | — | Full-text search (name, email, company) |
| `tag` | string (UUID) | — | Filter by tag ID |
| `page` | integer | `1` | Page number (1-based) |
| `limit` | integer | `25` | Results per page (max 100) |
| `sortBy` | `name` \| `company` \| `created_at` | `created_at` | Sort field |
| `sortOrder` | `asc` \| `desc` | `desc` | Sort direction |

**Response 200**
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "Jane Smith",
      "email": "jane@acme.com",
      "phone": "+44 7911 123456",
      "company": "Acme Corp",
      "notes": "Met at London Tech Week",
      "created_at": "2026-03-01T10:00:00.000Z",
      "updated_at": "2026-03-15T14:30:00.000Z",
      "tags": [
        { "id": "...", "name": "candidate", "colour": "#3B82F6", "is_system": true }
      ]
    }
  ],
  "error": null,
  "pagination": { "page": 1, "limit": 25, "total": 142, "pages": 6 }
}
```

---

#### `POST /contacts`

Create a new contact.

**Request body**
```json
{
  "name": "Jane Smith",
  "email": "jane@acme.com",
  "phone": "+44 7911 123456",
  "company": "Acme Corp",
  "notes": "Met at London Tech Week",
  "tagIds": ["tag-uuid-1", "tag-uuid-2"]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | Non-empty |
| `email` | string | No | Valid email format |
| `phone` | string | No | Free-form string |
| `company` | string | No | — |
| `notes` | string | No | Free-form text |
| `tagIds` | string[] | No | Array of existing tag UUIDs |

**Response 201**
```json
{
  "data": { "id": "...", "name": "Jane Smith", ... "tags": [] },
  "error": null
}
```

**Response 422** — Validation failure
**Response 409** — Duplicate email

---

#### `GET /contacts/:id`

Retrieve a single contact by UUID.

**Response 200** — Contact object (same shape as list item)
**Response 404** — Contact not found

---

#### `PUT /contacts/:id`

Update an existing contact. All fields are optional; omitted fields are unchanged.

**Request body** — same shape as `POST /contacts` with all fields optional

**Response 200** — Updated contact object
**Response 404** — Contact not found
**Response 422** — Validation failure

---

#### `DELETE /contacts/:id`

Delete a contact and all its tag assignments.

**Response 204** — No content
**Response 404** — Contact not found

---

#### `POST /contacts/:id/tags`

Assign a tag to a contact.

**Request body**
```json
{ "tagId": "tag-uuid" }
```

**Response 201**
```json
{ "data": { "message": "Tag assigned" }, "error": null }
```

**Response 404** — Contact or tag not found
**Response 409** — Tag already assigned

---

#### `DELETE /contacts/:id/tags/:tagId`

Remove a tag assignment from a contact.

**Response 204** — No content
**Response 404** — Assignment not found

---

#### `POST /contacts/import`

Import contacts from a CSV file. Accepts `multipart/form-data`.

**Form field:** `file` — `.csv` file (max 10 MB)

**CSV format:** see [CSV Format](#csv-format) below.

**Response 200**
```json
{
  "data": {
    "imported": 2847,
    "skipped": 12,
    "errors": [
      { "row": 3, "reason": "name is required" },
      { "row": 97, "reason": "invalid email format" }
    ]
  },
  "error": null
}
```

---

#### `GET /contacts/export`

Download all contacts as a CSV file.

**Response 200** — `Content-Type: text/csv`, `Content-Disposition: attachment; filename="contacts.csv"`

CSV columns: `name, email, phone, company, tags` (tags are semicolon-separated).

---

### Tags

All tags endpoints require `Authorization: Bearer <token>`.

---

#### `GET /tags`

List all tags (system + custom).

**Response 200**
```json
{
  "data": [
    { "id": "...", "name": "candidate", "colour": "#3B82F6", "is_system": true },
    { "id": "...", "name": "client",    "colour": "#10B981", "is_system": true },
    { "id": "...", "name": "warm lead", "colour": "#F59E0B", "is_system": true },
    { "id": "...", "name": "placed",    "colour": "#8B5CF6", "is_system": true },
    { "id": "...", "name": "interviewed","colour": "#6B7280","is_system": true },
    { "id": "...", "name": "acme-pool", "colour": "#EF4444", "is_system": false }
  ],
  "error": null
}
```

---

#### `POST /tags`

Create a custom tag.

**Request body**
```json
{ "name": "acme-pool", "colour": "#EF4444" }
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | Unique across all tags |
| `colour` | string | No | Hex colour (defaults to `#6B7280`) |

**Response 201** — Created tag object
**Response 409** — Tag name already exists
**Response 422** — Validation failure

---

#### `DELETE /tags/:id`

Delete a custom tag. Removes tag assignments from all contacts.

**Response 204** — No content
**Response 403** — Cannot delete system tags
**Response 404** — Tag not found

---

## CSV Format

Import CSV must include a `name` header column. All other columns are optional.

```
name,email,phone,company,tags
Jane Smith,jane@acme.com,+44 7911 123456,Acme Corp,"candidate,interviewed"
John Doe,john@startup.io,,Startup IO,client
Alice Brown,,,,"warm lead"
```

**Rules:**
- `name` is the only required column; rows without a name are skipped with an error
- `tags` is a comma-separated list of tag names (quoted if containing commas)
- Unknown tag names are created automatically as custom tags (colour `#6B7280`)
- Duplicate emails are skipped (counted in `skipped`, not `errors`)
- Maximum file size: 10 MB; tested with 3,000 rows (streaming parser, no timeout)

---

## Running Tests

### Backend — Jest + Supertest (TypeScript)

```bash
cd api
npm test                    # Run all tests
npm run test:coverage       # Run with coverage report (≥80% threshold)
```

Tests use a separate `contacts_test` database that is wiped between test runs. Ensure `DATABASE_TEST_URL` points to an empty or test-only database.

### Frontend — Vitest + Testing Library

```bash
cd web
npm test                    # Run all tests
npm run test:coverage       # Run with coverage report
npm run test:ui             # Open Vitest UI in browser
```

Frontend tests use MSW (Mock Service Worker) to intercept API calls; no running backend is required.

### Python API Tests — pytest + httpx

```bash
cd backend
pip install -r requirements.txt

# Set the base URL of a running app (Docker or local dev)
export API_BASE_URL=http://localhost:4098/api/v1
export TEST_EMAIL=admin@gigforge.ai
export TEST_PASSWORD=demo1234

pytest tests/ -v
pytest tests/ -v --tb=short   # Brief tracebacks
pytest tests/test_api.py -k "test_login"  # Run one test by name
```

The Python test suite performs black-box HTTP testing against the live API using `httpx`. It requires the app to be running (`docker compose up` or local dev).

---

## Production Checklist

Before deploying to any internet-accessible environment:

- [ ] Generate a strong `JWT_SECRET`: `openssl rand -hex 32`
- [ ] Set a strong `POSTGRES_PASSWORD` (min 20 characters, random)
- [ ] Set `NODE_ENV=production`
- [ ] Remove or disable the demo seed user (`admin@gigforge.ai`) — or change the password
- [ ] Set up TLS termination upstream (Cloudflare, Nginx upstream, or hosting provider)
- [ ] Consider migrating the JWT blacklist from in-memory to PostgreSQL or Redis (current in-memory blacklist is lost on API restart)
- [ ] Set up automated PostgreSQL backups (`pg_dump` via cron or managed DB snapshots)
- [ ] Review CORS origin in `api/src/app.ts` — restrict to your actual frontend domain
- [ ] Pin Docker image tags (replace `postgres:16-alpine` with `postgres:16.3-alpine`, etc.)

---

## Default Login

| Field | Value |
|-------|-------|
| Email | `admin@gigforge.ai` |
| Password | `demo1234` |

> This account is created automatically by the migration runner on first start.
> **Remove or change this before production deployment.**
