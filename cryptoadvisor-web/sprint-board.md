# Sprint Board — CryptoAdvisor Web Dashboard

**Client:** internal@gigforge.ai | **Platform:** Internal | **Tier:** L
**Total stories:** 27 | **Total points:** 56 | **Sprints planned:** 4 (0–3)

---

## Sprint 0 — Design | 2026-03-22 → 2026-03-22

**Goal:** UX specs, design tokens, component layouts complete before any code is written

### Backlog
- [ ] STORY-001: Dark theme design system (2 pts) [Must] — assigned: UX Designer
- [ ] STORY-002: Dashboard layout wireframe (2 pts) [Must] — assigned: UX Designer
- [ ] STORY-003: Portfolio overview component spec (2 pts) [Must] — assigned: UX Designer
- [ ] STORY-004: Price chart (candlestick) component spec (3 pts) [Must] — assigned: UX Designer
- [ ] STORY-005: AI signals + alerts panel spec (2 pts) [Must] — assigned: UX Designer
- [ ] STORY-006: Transaction history table spec (2 pts) [Must] — assigned: UX Designer
- [ ] STORY-007: Watchlist panel spec (1 pt) [Must] — assigned: UX Designer

### In Progress
_(none)_

### Done
_(none)_

---

**Sprint 0 velocity:** 0 / 14 pts
**Blockers:** none

---

## Sprint 1 — Foundation & Mock Data Layer | 2026-03-23 → 2026-03-23

**Goal:** Buildable project with typed mock API and navigable app shell

### Backlog
_(none)_

### In Progress
_(none)_

### Done
- [x] STORY-008: Project scaffold (Vite + React 19 + TS + Tailwind 4) (3 pts) [Must] — assigned: Lead Dev ✅ 2026-03-23
- [x] STORY-009: Dark theme Tailwind config + CSS design tokens (2 pts) [Must] — assigned: UI Engineer ✅ 2026-03-23
- [x] STORY-010: Mock API data layer — portfolio + prices (3 pts) [Must] — assigned: Lead Dev ✅ 2026-03-23
- [x] STORY-011: Mock API data layer — signals, alerts, transactions, watchlist (3 pts) [Must] — assigned: Lead Dev ✅ 2026-03-23
- [x] STORY-012: React Router + app shell (sidebar, header, content area) (3 pts) [Must] — assigned: UI Engineer ✅ 2026-03-23
- [x] STORY-013: Sidebar navigation with active state (2 pts) [Must] — assigned: UI Engineer ✅ 2026-03-23

---

**Sprint 1 velocity:** 16 / 16 pts
**Cumulative:** 5 / 56 pts (9%)
**Blockers:** none

---

## Sprint 2 — Core Dashboard Components | 2026-03-24 → 2026-03-25

**Goal:** Portfolio overview, charts, and watchlist fully wired to mock data

### Backlog
- [ ] STORY-014: Portfolio overview card (total value, P&L, % change, sparkline) (3 pts) [Must] — assigned: UI Engineer
- [ ] STORY-015: Portfolio allocation pie chart (Recharts PieChart) (3 pts) [Must] — assigned: UI Engineer
- [ ] STORY-016: Candlestick price chart with timeframe selector (5 pts) [Must] — assigned: UI Engineer
- [ ] STORY-017: Watchlist panel (ticker, price, 24h change, mini sparkline) (3 pts) [Must] — assigned: UI Engineer
- [ ] STORY-018: Asset selector — switch chart by ticker (2 pts) [Should] — assigned: UI Engineer

### In Progress
_(none)_

### Done
_(none)_

---

**Sprint 2 velocity:** 0 / 16 pts
**Cumulative:** 0 / 56 pts (0%)
**Blockers:** none

---

## Sprint 3 — Signals, Alerts, Transactions + Polish + Deployment | 2026-03-26 → 2026-03-27

**Goal:** All panels complete, test suite green, Docker image builds

### Backlog
- [ ] STORY-019: AI trading signals panel (3 pts) [Must] — assigned: UI Engineer
- [ ] STORY-020: Alerts panel (3 pts) [Must] — assigned: UI Engineer
- [ ] STORY-021: Transaction history table (5 pts) [Must] — assigned: UI Engineer
- [ ] STORY-022: Loading skeleton states for all panels (2 pts) [Should] — assigned: UI Engineer
- [ ] STORY-023: Empty and error states for all panels (2 pts) [Should] — assigned: UI Engineer
- [ ] STORY-024: Responsive layout (mobile/tablet/desktop) (3 pts) [Must] — assigned: UI Engineer
- [ ] STORY-025: Vitest + Testing Library test suite (5 pts) [Must] — assigned: Lead Dev
- [ ] STORY-026: Docker multi-stage build + docker-compose (2 pts) [Must] — assigned: Lead Dev
- [ ] STORY-027: README — setup, run, test, Docker (1 pt) [Must] — assigned: Lead Dev

### In Progress
_(none)_

### Done
_(none)_

---

**Sprint 3 velocity:** 0 / 26 pts
**Cumulative:** 0 / 56 pts (0%)
**Test count:** — tests, — passing, — failing
**Coverage:** —%
**Blockers:** none

---

## Summary

| Sprint | Planned | Completed | Velocity |
|--------|---------|-----------|----------|
| Sprint 0 | 14 pts | 0 | — |
| Sprint 1 | 16 pts | 16 | 16 pts |
| Sprint 2 | 16 pts | 0 | — |
| Sprint 3 | 26 pts | 0 | — |
| **Total** | **56 pts** | **0** | **—** |

---

## Sprint 2-CMS — CMS Layer & Custom Routes (per TASK_BRIEF.md) | 2026-04-27

> **Scope note:** TASK_BRIEF.md re-scoped Sprint 2 from Core Dashboard

---

## Sprint 2-CMS — CMS Layer & Custom Routes (per TASK_BRIEF.md) | 2026-04-27

> **Scope note:** `TASK_BRIEF.md` re-scoped Sprint 2 from "Core Dashboard
> Components" (the original 16-pt frontend plan above remains in backlog) to
> "CMS Layer + Custom Routes". This section reflects what was delivered against
> the brief.

**Goal:** Bootstrap Payload CMS with Assets + Signals collections; add three
custom Payload endpoints that go beyond auto-generated CRUD.

### Done
- [x] STORY-CMS-01: Payload SQLite adapter + Users/Assets/Signals collections (3 pts) ✅ 2026-04-27
- [x] STORY-CMS-02: Idempotent seed (6 assets, 5 signals) via `onInit` hook (1 pt) ✅ 2026-04-27
- [x] STORY-CMS-03: `GET /api/search` — signal full-text search with field-weighted scoring (3 pts) ✅ 2026-04-27
- [x] STORY-CMS-04: `GET /api/calculator/risk` — HHI, diversification score, risk tier (3 pts) ✅ 2026-04-27
- [x] STORY-CMS-05: `GET /api/assets/:symbol` + `GET /api/assets` catalogue with signalsSummary (3 pts) ✅ 2026-04-27
- [x] STORY-CMS-06: Vitest test suite — 36 tests, all green (3 pts) ✅ 2026-04-27

**Sprint 2-CMS velocity:** 16 / 16 pts
**Cumulative incl. CMS:** 32 / 72 pts (44%)
**Tests:** 36 passing
**Typecheck:** `tsc --noEmit` clean
**Blockers:** none

---

## Sprint 3 — Polish, Tests & Deployment | 2026-04-27 (verification)

> **Audit note:** Most Sprint 3 source code (Signals, Alerts, Transactions
> pages, loading skeletons, empty/error states, responsive layout, Docker
> multi-stage build) was already implemented and shipped to production but
> never explicitly verified or marked done. This entry verifies acceptance
> criteria against the cryptoadvisor branch state at `a8498c8`.

### Done
- [x] STORY-019: AI trading signals panel (3 pts) ✅ 2026-04-27 — `src/pages/Signals.tsx` (115 lines, uses `useSignals` hook + `Panel` component)
- [x] STORY-020: Alerts panel (3 pts) ✅ 2026-04-27 — `src/pages/Alerts.tsx` (116 lines)
- [x] STORY-021: Transaction history table (5 pts) ✅ 2026-04-27 — `src/pages/Transactions.tsx` (159 lines, sortable) + `Transactions.test.tsx`
- [x] STORY-022: Loading skeleton states (2 pts) ✅ 2026-04-27 — `src/components/ui/LoadingSkeleton.tsx` (used across panels)
- [x] STORY-023: Empty and error states (2 pts) ✅ 2026-04-27 — `src/components/ui/EmptyState.tsx` + `ErrorBanner.tsx`
- [x] STORY-024: Responsive layout (3 pts) ✅ 2026-04-27 — `AppLayout.tsx` uses `hidden lg:flex` desktop sidebar + `lg:hidden` mobile overlay + `MobileNav.tsx` + responsive padding (`p-4 lg:p-6`)
- [x] STORY-025: Vitest + Testing Library suite (5 pts) ✅ 2026-04-27 — **130 tests passing across 21 files**, coverage **93.56% statements / 88% branch / 86% functions / 93.56% lines** (target: ≥80%)
- [x] STORY-026: Docker multi-stage build + docker-compose (2 pts) ✅ 2026-04-27 — `Dockerfile` (deps → builder → nginx:alpine runner) + `docker-compose.yml`. Build smoke-tested clean.
- [x] STORY-027: README — setup, run, test, Docker (1 pt) ✅ 2026-04-27 — `README.md` (135 lines, covers prereqs, install, dev, test, coverage, Docker)

**Sprint 3 velocity:** 26 / 26 pts
**Cumulative (incl. Sprint 2-CMS):** 58 / 72 pts (81%)
**Tests (frontend):** 130 passing across 21 files; coverage 93.56% statements
**Tests (CMS, from Sprint 2):** 36 passing across 3 files
**Typecheck:** `tsc --noEmit` clean
**Docker build:** ✅ smoke green
**Production:** container `cryptoadvisor-web` on port 4102 still serving HTTP 200
**Blockers:** none

### Remaining backlog
- Sprint 0 (Design specs, 14 pts) — backlog. Specs were never formally written; UX work done in-line during Sprint 1.
- CMS Docker integration — bundle Payload CMS into `docker-compose.yml` so `docker compose up` runs both frontend + CMS together. Out of Sprint 3 scope; queue for next sprint.
