# Changelog

All notable changes to ContactBase are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Version numbers follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-04-04

Initial release of ContactBase — recruitment CRM for a 5-person internal team.

### Added

#### Authentication (FR-001, FR-002)
- JWT-based login with bcryptjs password hashing (cost factor 10)
- `POST /api/v1/auth/login` — returns signed JWT (24h expiry)
- `POST /api/v1/auth/logout` — invalidates token via in-memory blacklist
- Demo admin account seeded automatically on first boot (`admin@gigforge.ai` / `demo1234`)
- No public registration endpoint (internal team only)

#### Contact Management (FR-003–FR-010)
- `GET /api/v1/contacts` — paginated contact list (25/page, max 100)
- `POST /api/v1/contacts` — create contact with name, email, phone, company, notes, tags
- `GET /api/v1/contacts/:id` — retrieve single contact with all tag assignments
- `PUT /api/v1/contacts/:id` — update contact fields (partial update supported)
- `DELETE /api/v1/contacts/:id` — delete contact and all tag assignments
- `updated_at` timestamp maintained automatically via PostgreSQL trigger
- Contact detail panel with edit and delete actions in the UI
- Confirmation dialog before destructive delete

#### Search and Filtering (FR-003–FR-006)
- Full-text search across name, email, and company fields
- PostgreSQL GIN index (`to_tsvector` + `plainto_tsquery`) — sub-200ms for 10,000 contacts
- Tag-based filter (single tag, by UUID)
- Combined search + tag filter support
- Sort by `name`, `company`, or `created_at` (ascending or descending)
- 300ms debounced search input to avoid excessive API calls

#### Tagging System (FR-011–FR-013)
- 5 system tags seeded on first boot: `candidate` (blue), `client` (green), `warm lead` (amber), `placed` (purple), `interviewed` (grey)
- `GET /api/v1/tags` — list all tags
- `POST /api/v1/tags` — create custom tag with name and hex colour
- `DELETE /api/v1/tags/:id` — delete custom tag (system tags are protected, returns 403)
- `POST /api/v1/contacts/:id/tags` — assign tag to contact
- `DELETE /api/v1/contacts/:id/tags/:tagId` — remove tag assignment
- Tag multi-select dropdown with inline "Create new tag" option in contact form
- Colour-coded tag badges throughout the UI

#### CSV Import/Export (FR-014–FR-015)
- `POST /api/v1/contacts/import` — multipart file upload (max 10 MB)
- Streaming CSV parser via `fast-csv` — handles 3,000+ rows without timeout
- Row-level error reporting (row number + reason) for failed imports
- Unknown tag names auto-created as custom tags during import
- Import summary modal: imported N / skipped M / errors list
- `GET /api/v1/contacts/export` — streaming CSV download (`Content-Disposition: attachment`)
- Export includes: name, email, phone, company, tags (semicolon-separated)
- CSV format: `name,email,phone,company,tags`

#### UI & UX (FR-016–FR-018)
- Dark mode toggle with `localStorage` persistence; FOUC-free preload script
- Responsive layout: data table on desktop (≥768px), card list on mobile (<768px)
- Tested at 375px (iPhone SE) and 1440px (desktop)
- Accessible semantic HTML with ARIA labels (WCAG AA target)
- Loading skeleton placeholders during data fetch
- Empty state illustrations for no contacts / no search results
- Toast notifications for success and error feedback
- React error boundary to catch and display component errors gracefully
- `@headlessui/react` modal and drawer primitives for accessible overlays

#### API Design
- REST API versioned under `/api/v1/`
- Uniform JSON response envelope: `{ data, error, pagination }`
- Zod schema validation on all mutating endpoints (returns 422 with field-level errors)
- Global Express error handler with structured JSON error responses
- HTTP security headers via `helmet`

#### Infrastructure & Deployment
- Docker Compose v2 stack with three services: `db` (PostgreSQL 16), `api` (Node.js), `web` (Nginx)
- Multi-stage Docker builds for both `api` and `web` — minimised image sizes
- Non-root container execution (`appuser`) in API container
- PostgreSQL `pg_isready` health check with 10 retries before API starts
- Migrations run automatically on `api` container start (idempotent)
- Nginx SPA fallback (`try_files $uri /index.html`) for React Router
- Nginx API reverse proxy to `api:4000/api`
- Gzip compression and static asset cache headers in Nginx
- Named Docker volume `db_data` for persistent PostgreSQL storage
- Single command deployment: `docker compose up --build`

#### Testing
- Backend: 5 Jest + Supertest integration test suites against a real `contacts_test` database
  - `auth.test.ts` — login, logout, token blacklist, 422 validation
  - `contacts.test.ts` — full CRUD lifecycle, ownership, 404 handling
  - `tags.test.ts` — tag CRUD, system tag protection, assignment/removal
  - `search.test.ts` — full-text search, tag filter, combined filter, pagination, sort
  - `csv.test.ts` — import success, row errors, skipped rows, export format
- Frontend: Vitest + Testing Library component tests with MSW API mocking
  - `LoginPage`, `ContactsPage`, `ContactForm`, `SearchBar`, `TagFilter`, `CsvImport`, `CsvExport`, `AppShell`
- Python black-box API test suite (pytest + httpx) in `backend/tests/`
  - HTTP-level integration tests covering all endpoints
  - Pydantic response model validation
- Coverage target: ≥80% on critical backend paths

#### Documentation
- `README.md` — setup, API reference, CSV format, environment variables, project structure
- `RUNBOOK.md` — deployment, health checks, monitoring, troubleshooting, backup/restore, scaling, rollback
- `CHANGELOG.md` — this file
- `SOFTWARE_SPEC.md` — 18 functional requirements, acceptance criteria, personas
- `TECH_STACK.md` — technology choices with rationale
- `SPRINT_PLAN.md` — two-sprint delivery breakdown with TDD cycles
- `DESIGN.md` — design system, component specs, wireframes, accessibility checklist
- `docs/adr/0001` through `docs/adr/0007` — Architecture Decision Records

### Database Schema

- `users` — id (UUID), email (unique), password_hash, name, created_at
- `contacts` — id (UUID), name, email, phone, company, notes, created_at, updated_at; GIN full-text index
- `tags` — id (UUID), name (unique), colour (hex), is_system, created_at
- `contact_tags` — join table with ON DELETE CASCADE for both FK relationships
- `_migrations` — internal migration tracking table

---

[1.0.0]: https://github.com/ai-elevate/gigforge/releases/tag/contact-management-app-v1.0.0
