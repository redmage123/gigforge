# CRM Platform — Project Plan

**Project:** GigForge + TechUni CRM
**PM:** gigforge-pm
**Engineer:** gigforge-engineer
**Start:** 2026-03-16
**End:** 2026-06-08 (12 weeks, 6 sprints)
**Methodology:** Agile/Scrum + TDD (tests before code)

---

## Definition of Done (applies to every story)
- Tests written BEFORE implementation (TDD RED -> GREEN -> REFACTOR)
- All acceptance criteria verified by automated tests
- Code reviewed by gigforge-engineer
- Coverage >= 80% (backend), >= 70% (frontend)
- No open HIGH/CRITICAL bugs
- Docs updated (docstrings, OpenAPI)

---

## Epic 1: Infrastructure & Project Setup
**Goal:** Full Docker stack running, CI skeleton, code structure
**Sprint:** 1
**Lead:** gigforge-devops + gigforge-dev-backend

Stories:
- **US-001** (3pts) As a developer, I want `docker compose up` to start postgres + backend + frontend so that I can develop locally
  - AC: `docker compose up` succeeds without errors
  - AC: postgres health check passes within 30s
  - AC: backend `/health` returns 200
  - AC: frontend serves on port 3000
  - Test: `test_health_endpoint_returns_200`, `test_docker_compose_services_healthy`

- **US-002** (2pts) As a developer, I want Alembic configured so that I can run DB migrations
  - AC: `make migrate` applies initial migration to empty DB
  - AC: `make migrate-auto` detects model changes
  - Test: `test_migrations_run_cleanly`, `test_rollback_succeeds`

- **US-003** (2pts) As a developer, I want pytest + coverage configured so that I can measure test quality
  - AC: `make test-backend` runs and reports coverage
  - AC: Coverage threshold enforced (fails below 80%)
  - Test: CI test run passes with initial 100% coverage on skeleton

- **US-004** (2pts) As a developer, I want GitHub Actions CI configured so that tests run on every push
  - AC: `.github/workflows/ci.yml` runs tests on push/PR
  - AC: Build fails if tests fail or coverage drops below threshold

---

## Epic 2: Auth & Multi-Tenancy
**Goal:** JWT auth, RBAC, org isolation -- both humans and AI agents can authenticate
**Sprint:** 1
**Lead:** gigforge-dev-backend

Stories:
- **US-010** (5pts) As an admin, I want to register a new user in my organization so that team members and agents can access the CRM
  - AC: POST /api/auth/register creates user with hashed password
  - AC: Returns 400 if email already exists in org
  - AC: Role validated (admin/manager/agent/viewer only)
  - AC: org_id always scoped from JWT (cannot register into another org)
  - Test: `test_register_success`, `test_register_duplicate_email`, `test_register_invalid_role`

- **US-011** (3pts) As a user, I want to log in and receive JWT tokens so that I can access protected endpoints
  - AC: POST /api/auth/login returns access_token (15min) + refresh_token (7 days)
  - AC: JWT payload contains: sub, org_id, role, is_agent, exp
  - AC: Returns 401 for wrong password
  - AC: Returns 404 for unknown email
  - Test: `test_login_success`, `test_login_wrong_password`, `test_jwt_payload_structure`

- **US-012** (2pts) As a user, I want to refresh my access token so that I don't have to re-login every 15 minutes
  - AC: POST /api/auth/refresh with valid refresh token returns new access token
  - AC: Returns 401 for expired/invalid refresh token
  - Test: `test_refresh_token_success`, `test_refresh_token_expired`

- **US-013** (2pts) As a user, I want to log out so that my token is invalidated
  - AC: POST /api/auth/logout blacklists the token in Redis
  - AC: Blacklisted token returns 401 on subsequent requests
  - Test: `test_logout_blacklists_token`, `test_blacklisted_token_rejected`

- **US-014** (5pts) As a backend developer, I want all API endpoints to enforce org isolation so that TechUni data is never visible to GigForge users
  - AC: Middleware extracts org_id from JWT and injects into all DB queries
  - AC: Integration test confirms cross-org data isolation
  - AC: No endpoint allows querying another org's data even with a valid JWT
  - Test: `test_org_isolation_contacts`, `test_org_isolation_deals`, `test_cross_org_access_denied`

- **US-015** (3pts) As an AI agent, I want to authenticate with a long-lived token so that I can make API calls without re-logging in frequently
  - AC: is_agent=true users can be issued 90-day tokens
  - AC: Agent tokens work on all authenticated endpoints
  - AC: Agent activity logged in audit_log with actor_type='agent'
  - Test: `test_agent_token_auth`, `test_agent_activity_audit_logged`

---

## Epic 3: Contact & Company Management
**Goal:** Full CRUD for contacts and companies, search, tags
**Sprint:** 2
**Lead:** gigforge-dev-backend + gigforge-dev-frontend

Stories:
- **US-020** (5pts) As a sales agent, I want to create and manage contacts so that I can track leads and customers
  - AC: POST /api/contacts creates contact scoped to org
  - AC: GET /api/contacts returns paginated list (cursor-based)
  - AC: PUT/PATCH /api/contacts/{id} updates contact
  - AC: DELETE /api/contacts/{id} soft-deletes
  - AC: All CRUD logged to audit_log
  - Test: CRUD test suite, ownership validation, audit log verification

- **US-021** (3pts) As a user, I want to search contacts by name/email so that I can find records quickly
  - AC: GET /api/contacts/search?q= returns results in <200ms for 10k contacts
  - AC: Searches first_name, last_name, email using pg_trgm
  - AC: Minimum 2 characters required
  - Test: `test_search_by_name`, `test_search_by_email`, `test_search_performance`

- **US-022** (3pts) As a user, I want to tag contacts so that I can segment my audience
  - AC: POST /api/contacts/{id}/tags adds tag (created if not exists)
  - AC: DELETE /api/contacts/{id}/tags/{tag_id} removes tag
  - AC: GET /api/contacts?tag= filters by tag
  - Test: `test_add_tag`, `test_remove_tag`, `test_filter_by_tag`

- **US-023** (3pts) As a user, I want to import contacts from CSV so that I can migrate existing data
  - AC: POST /api/contacts/import accepts CSV with header row
  - AC: Returns import summary (created, skipped, errors)
  - AC: Duplicate emails skipped (not errored)
  - Test: `test_csv_import_valid`, `test_csv_import_duplicates`, `test_csv_import_malformed`

- **US-024** (5pts) As a user, I want a Contacts page in the UI so that I can view and manage contacts
  - AC: Table shows name, email, company, type, owner, created date
  - AC: Search bar filters in real-time
  - AC: Click row opens contact detail side panel
  - AC: "New Contact" button opens creation form
  - Test: Component tests for ContactsTable, ContactDetail, ContactForm

- **US-025** (3pts) As a user, I want to create and manage companies so that I can group contacts by employer
  - AC: Full CRUD for companies
  - AC: GET /api/companies/{id}/contacts returns associated contacts
  - AC: Contacts link to company_id
  - Test: CRUD tests, relationship tests

---

## Epic 4: Deal Pipeline
**Goal:** Deals, pipeline stages (Kanban), stage movement tracking
**Sprint:** 3
**Lead:** gigforge-dev-backend + gigforge-dev-frontend

Stories:
- **US-030** (3pts) As an admin, I want to configure pipeline stages for my org so that our sales process is modeled correctly
  - AC: GET/POST/PUT/DELETE /api/pipeline-stages -- org-specific stages
  - AC: Stages have position (sort order), probability, color, type (active/won/lost)
  - AC: PATCH /api/pipeline-stages/reorder atomically updates positions
  - AC: Default stages seeded on org creation: Lead, Qualified, Proposal, Negotiation, Won, Lost
  - Test: `test_stage_crud`, `test_stage_reorder`, `test_default_stages_seeded`

- **US-031** (5pts) As a sales agent, I want to create and manage deals so that I can track opportunities
  - AC: Full CRUD for deals
  - AC: Deal linked to contact, company, pipeline stage
  - AC: Value, probability, expected close date tracked
  - Test: Deal CRUD suite

- **US-032** (5pts) As a sales agent, I want to move a deal through pipeline stages so that I can track progress
  - AC: PUT /api/deals/{id}/stage changes stage
  - AC: Stage change recorded in deal_stage_history
  - AC: Webhook event `deal.stage_changed` fired
  - AC: When moved to Won stage: status -> 'won', actual_close_date set
  - AC: When moved to Lost stage: status -> 'lost'
  - Test: `test_stage_move`, `test_stage_history_recorded`, `test_won_deal_status`, `test_webhook_fired_on_stage_change`

- **US-033** (5pts) As a user, I want a Kanban pipeline board in the UI so that I can see all deals by stage
  - AC: GET /api/deals/pipeline returns deals grouped by stage
  - AC: Frontend renders columns per stage with deal cards
  - AC: Drag-and-drop moves deal to new stage (calls PUT /api/deals/{id}/stage)
  - AC: Deal cards show title, value, contact name, close date
  - Test: `test_pipeline_view_api`, component tests for PipelineBoard, DealCard

---

## Epic 5: Activities & Tasks
**Goal:** Log all interactions; task management with agent assignment
**Sprint:** 4
**Lead:** gigforge-dev-backend + gigforge-dev-frontend

Stories:
- **US-040** (5pts) As an agent, I want to log activities against contacts and deals so that all interactions are tracked
  - AC: POST /api/activities with type (call/email/meeting/note/demo/trial)
  - AC: Activity linked to contact_id and/or deal_id
  - AC: GET /api/activities?contact_id= filters by contact
  - AC: Activities appear in contact detail timeline (most recent first)
  - Test: Activity CRUD, timeline ordering

- **US-041** (3pts) As a user, I want to create tasks assigned to agents so that work gets delegated and tracked
  - AC: POST /api/tasks creates task with assignee (user or agent)
  - AC: PATCH /api/tasks/{id}/complete marks complete + sets completed_at
  - AC: GET /api/tasks?assigned_to=me filters to caller's tasks
  - AC: Overdue tasks visible (due_date < now AND NOT is_completed)
  - Test: Task CRUD, completion, filtering

- **US-042** (5pts) As a user, I want an Activity timeline in the UI so that I can see all contact/deal interactions
  - AC: Timeline renders activities newest-first
  - AC: Icons differentiate activity types (call, email, meeting, note)
  - AC: Filter by type and date range
  - AC: "Log Activity" button opens modal form
  - Test: Component tests for ActivityTimeline, LogActivityModal

---

## Epic 6: Dashboard & Search
**Goal:** KPI dashboard, global search, reporting
**Sprint:** 5
**Lead:** gigforge-dev-backend + gigforge-dev-frontend

Stories:
- **US-050** (5pts) As a manager, I want a KPI dashboard so that I can see the health of my pipeline
  - AC: GET /api/dashboard/kpis returns: pipeline_value, deals_won_count, deals_won_value, conversion_rate, open_tasks_count, new_contacts_this_month, avg_deal_size, deals_by_stage[]
  - AC: All metrics are org-scoped
  - AC: Metrics accurate within 5% of raw counts
  - Test: `test_dashboard_kpis_accuracy`, `test_dashboard_org_isolation`

- **US-051** (3pts) As a user, I want a pipeline value chart so that I can see stage distribution visually
  - AC: Frontend renders bar/funnel chart with deal count and value per stage
  - AC: Uses Recharts
  - Test: Component tests for PipelineFunnelChart

- **US-052** (3pts) As a user, I want global search across contacts, companies, and deals so that I can find any record fast
  - AC: GET /api/search?q= searches all entity types
  - AC: Returns top 5 results per type
  - AC: Results appear in typeahead within 300ms
  - Test: `test_global_search_results`, `test_search_performance`

---

## Epic 7: Webhooks & Agent API
**Goal:** Agents can register webhook endpoints and receive real-time CRM events
**Sprint:** 6
**Lead:** gigforge-dev-backend

Stories:
- **US-060** (5pts) As an AI agent, I want to register a webhook so that I get notified when CRM events happen
  - AC: POST /api/webhooks registers URL + event types + HMAC secret
  - AC: DELETE /api/webhooks/{id} deregisters
  - AC: On contact.created/updated/deleted events, webhook fires within 2 seconds
  - AC: Payload signed with HMAC-SHA256 (X-CRM-Signature header)
  - AC: Failed deliveries retried: 1min, 5min, 30min
  - AC: Delivery status tracked in webhook_events table
  - Test: `test_webhook_registration`, `test_webhook_fires_on_create`, `test_hmac_signature_valid`, `test_retry_on_failure`

- **US-061** (3pts) As an agent, I want webhook delivery history so that I can debug missed events
  - AC: GET /api/webhooks/{id}/events returns delivery log (status, attempts, response_code)
  - AC: POST /api/webhooks/{id}/test sends a test payload
  - Test: `test_delivery_history`, `test_webhook_test_endpoint`

---

## Epic 8: Import/Export
**Goal:** CSV import/export for all major entities
**Sprint:** 6
**Lead:** gigforge-dev-backend

Stories:
- **US-070** (3pts) As a user, I want to export contacts to CSV so that I can use them in other tools
  - AC: GET /api/contacts/export returns CSV with all contact fields
  - AC: Filterable (same query params as list endpoint)
  - AC: Large exports streamed (not buffered in memory)
  - Test: `test_csv_export_format`, `test_csv_export_filtered`

---

## Epic 9: Frontend Polish
**Goal:** Complete all 7 pages, dark theme consistency, mobile responsive
**Sprint:** 5-6
**Lead:** gigforge-dev-frontend

Stories:
- **US-080** (3pts) As a user, I want a consistent dark theme UI so that the CRM matches our tooling aesthetic
  - AC: Matches CryptoAdvisor dark color palette
  - AC: All pages pass visual review screenshot check
  - Test: Storybook stories / screenshot tests

- **US-081** (3pts) As a mobile user, I want the CRM to work on tablet so that field teams can use it
  - AC: All pages responsive down to 768px
  - AC: Kanban board scrollable horizontally on tablet
  - Test: Responsive component tests at 768px viewport

---

## Epic 10: QA & Deployment
**Goal:** Full QA pass, acceptance testing, production deployment
**Sprint:** 6
**Lead:** gigforge-qa + gigforge-devops

Stories:
- **US-090** (5pts) As gigforge-qa, I want to run acceptance tests against all user stories so that every requirement is verified
  - AC: Test plan written per acceptance criterion
  - AC: All CRUD operations tested end-to-end
  - AC: Multi-tenant isolation verified
  - AC: Webhook delivery verified
  - AC: No HIGH/CRITICAL bugs open

- **US-091** (3pts) As gigforge-advocate, I want to review the CRM as a paying client so that it meets real-world quality standards
  - AC: Usability score >= 4/5 on all 5 advocate dimensions
  - AC: No broken flows in happy path walkthrough

---

## Story Points Summary

| Epic | Points | Sprint |
|------|--------|--------|
| 1: Infrastructure | 9 | 1 |
| 2: Auth & Multi-Tenancy | 20 | 1 |
| 3: Contacts & Companies | 19 | 2 |
| 4: Deal Pipeline | 18 | 3 |
| 5: Activities & Tasks | 13 | 4 |
| 6: Dashboard & Search | 11 | 5 |
| 7: Webhooks & Agent API | 8 | 6 |
| 8: Import/Export | 3 | 6 |
| 9: Frontend Polish | 6 | 5-6 |
| 10: QA & Deployment | 8 | 6 |
| **TOTAL** | **115** | 6 sprints |

---

## Sprint Velocity Target: ~20 points/sprint
