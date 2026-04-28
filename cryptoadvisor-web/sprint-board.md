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

---

## Sprint 4 — CMS Integration & Production Deploy | 2026-04-27

> **Goal:** Wire the React frontend to the Payload CMS shipped in Sprint 2-CMS.
> Add Risk Calculator UI, signal search bar, asset detail modal. Ship a
> deployable docker-compose with both services.

### Done
- [x] STORY-API-01: CMS HTTP client + env-flag toggle (3 pts) ✅ 2026-04-27 — `src/api/cms/client.ts` (typed exports for search/risk/assets, `useCmsApi()` env switch on `VITE_CMS_URL`)
- [x] STORY-API-02: React Query hooks for CMS endpoints (2 pts) ✅ 2026-04-27 — `useSearchSignals`, `useRiskCalculator`, `useAsset`
- [x] STORY-UI-01: Risk Calculator page (5 pts) ✅ 2026-04-27 — `src/pages/RiskCalculator.tsx`, route `/risk`, sidebar link, dynamic allocation rows, sum validation, HHI + diversification + tier badge UI
- [x] STORY-UI-02: Signal search bar on /signals (3 pts) ✅ 2026-04-27 — `src/components/SignalSearchBar.tsx` mounted at top of Signals page; query + direction filter + minConfidence; ranked results with matched-fields annotation
- [x] STORY-UI-03: Asset detail modal (3 pts) ✅ 2026-04-27 — `src/components/asset/AssetDetailModal.tsx`, opens on signal-asset click; shows description/risk/chain/exchanges + signalsSummary; ESC to close
- [x] STORY-DEPLOY-01: docker-compose with both services (3 pts) ✅ 2026-04-27 — `cms` (Payload + SQLite volume + healthcheck) + `web` (depends_on cms healthy); CMS Dockerfile added
- [x] STORY-TEST-01: Vitest tests for new code (3 pts) ✅ 2026-04-27 — 23 new tests across `client.test.ts`, `RiskCalculator.test.tsx`, `AssetDetailModal.test.tsx`, `SignalSearchBar.test.tsx`

**Sprint 4 velocity:** 22 / 22 pts
**Cumulative (incl Sprint 2-CMS):** 80 / 94 pts (85%)

**Tests (frontend):** 153 passing across 25 files (up from 130)
**Tests (CMS):** 36 passing across 3 files (unchanged)
**Total tests:** 189 passing
**Frontend coverage:** 94.3% statements / 88.59% branch / 85.93% functions / 94.3% lines
**Typecheck:** `tsc --noEmit` clean (frontend + CMS)
**Docker:** `docker compose config` valid; web build args wire `VITE_CMS_URL` through to Vite at build time

**Blockers:** none

### How to run the full stack locally
```bash
cd cryptoadvisor-web
docker compose up --build
# Frontend: http://localhost:3000
# CMS admin: http://localhost:3001/admin
# CMS API:   http://localhost:3001/api/{search,calculator/risk,assets,assets/:symbol}
```

### Remaining backlog
- Sprint 0 (Design specs, 14 pts) — backlog
- Production deploy of full stack (CMS container) — pending operator approval

---

## Sprint 0 — Design Specs (retrofit) | 2026-04-27

> **Retrofit note:** The original Sprint 0 (UX wireframes + component specs)
> was never completed before implementation began. Sprints 1-4 shipped the code
> first. This entry retrofits the spec docs against the as-built state at
> commit b685b5a, so future contributors have written specs to anchor changes
> against. Specs reflect the implementation, not aspiration.

### Done
- [x] STORY-001: Dark theme design system (2 pts) ✅ already existed pre-Sprint-0 — `specs/design-system.md` (211 lines: tokens, contrast ratios, typography, spacing scale)
- [x] STORY-002: Dashboard layout wireframe (2 pts) ✅ 2026-04-27 — `specs/dashboard-layout.md`
- [x] STORY-003: Portfolio overview component spec (2 pts) ✅ 2026-04-27 — `specs/portfolio-overview.md`
- [x] STORY-004: Price chart (candlestick) component spec (3 pts) ✅ 2026-04-27 — `specs/candlestick-chart.md`
- [x] STORY-005: AI signals + alerts panel spec (2 pts) ✅ 2026-04-27 — `specs/signals-alerts-panels.md`
- [x] STORY-006: Transaction history table spec (2 pts) ✅ 2026-04-27 — `specs/transactions-table.md`
- [x] STORY-007: Watchlist panel spec (1 pt) ✅ 2026-04-27 — `specs/watchlist-panel.md`

**Sprint 0 velocity:** 14 / 14 pts
**Cumulative (all sprints):** 94 / 94 pts (100%)

**Specs directory:** 7 markdown documents under `specs/` (~1300 lines total).
Each spec includes: goal, layout (ASCII wireframe), props/columns table, color &
formatting rules, loading/error/empty state behavior, and acceptance criteria.

### Closing note
With Sprint 0 retrofitted, every Sprint defined at project kickoff is complete
or accounted for. Remaining work for the project lives outside the original
56-pt scope (now 94 pts incl Sprint 2-CMS + Sprint 4 additions):
- Production deploy of full stack (CMS container) — pending operator approval
- Future enhancements (real exchange API, multi-user auth, ADR-0008+)

---

# Future Sprints — Backlog (planned 2026-04-27)

The original 94-pt project scope is complete. The following 4 sprints are
queued in the GF-CRYPTO Plane project (all stories set to **Backlog**, ready
for triage). Total: **75 pts across 4 sprints**, derived from a post-Sprint-4
review of demo credibility, production readiness, UX gaps, and architectural
debt.

---

## Sprint 5 — Demo Credibility (Live Data) | 21 pts | epic GF-CRYPTO-036

> **Goal:** Replace mock data with real exchange APIs. Persist user-state to
> CMS. The dashboard should feel like a product, not a demo.

### Backlog
- [ ] STORY-501: CoinGecko adapter + MOCK/LIVE badge (5 pts) — GF-CRYPTO-037
- [ ] STORY-502: WebSocket price ticker via Binance (5 pts) — GF-CRYPTO-038
- [ ] STORY-503: Persist watchlist to CMS (5 pts) — GF-CRYPTO-039
- [ ] STORY-504: Persist alerts to CMS (3 pts) — GF-CRYPTO-040
- [ ] STORY-505: Tests for live-data path (3 pts) — GF-CRYPTO-041

---

## Sprint 6 — Production Hardening | 21 pts | epic GF-CRYPTO-042

> **Goal:** Move from "works on my machine" to "I would let a customer use this".
> CI, E2E, production-grade CMS container, generated types.

### Backlog
- [ ] STORY-601: CMS Dockerfile production build (5 pts) — GF-CRYPTO-043
- [ ] STORY-602: GitHub Actions CI (5 pts) — GF-CRYPTO-044
- [ ] STORY-603: Playwright E2E spec (8 pts) — GF-CRYPTO-045
- [ ] STORY-604: Auto-generate `payload-types.ts` (2 pts) — GF-CRYPTO-046
- [ ] STORY-605: ADR-0008 (Payload choice) + ADR-0009 (mock/CMS toggle) (1 pt) — GF-CRYPTO-047

---

## Sprint 7 — Auth & Multi-User | 16 pts | epic GF-CRYPTO-048

> **Goal:** Add per-user portfolios + JWT auth via Payload. Currently the
> admin panel has no auth gating beyond Payload defaults; portfolios are global.

### Backlog
- [ ] STORY-701: Login UI — frontend pages + auth context (5 pts) — GF-CRYPTO-049
- [ ] STORY-702: Per-user portfolio scoping in collections (3 pts) — GF-CRYPTO-050
- [ ] STORY-703: Auth-gated routes + ProtectedRoute wrapper (3 pts) — GF-CRYPTO-051
- [ ] STORY-704: Logout + session expiry handling (2 pts) — GF-CRYPTO-052
- [ ] STORY-705: Tests for auth flows (3 pts) — GF-CRYPTO-053

---

## Sprint 8 — UX Polish & Cleanup | 17 pts | epic GF-CRYPTO-054

> **Goal:** Last-mile UX (keyboard nav, presets, sharing, exports) plus type
> unification between mock and CMS layers.

### Backlog
- [ ] STORY-801: Keyboard nav for SignalCard → AssetDetailModal (2 pts) — GF-CRYPTO-055
- [ ] STORY-802: Risk Calc preset portfolios + save (3 pts) — GF-CRYPTO-056
- [ ] STORY-803: Risk Calc share-by-URL (2 pts) — GF-CRYPTO-057
- [ ] STORY-804: Charts page asset switcher (3 pts) — GF-CRYPTO-058
- [ ] STORY-805: CSV export for Transactions (2 pts) — GF-CRYPTO-059
- [ ] STORY-806: CSV export for Holdings (2 pts) — GF-CRYPTO-060
- [ ] STORY-807: Unify mock + CMS Signal types (3 pts) — GF-CRYPTO-061

---

## Sprint plan summary

| Sprint | Epic | Pts | Theme |
|--------|------|-----|-------|
| 5 | GF-CRYPTO-036 | 21 | Demo credibility — live data + CMS persistence |
| 6 | GF-CRYPTO-042 | 21 | Production hardening — CI, E2E, prod CMS build |
| 7 | GF-CRYPTO-048 | 16 | Auth — per-user portfolios via Payload JWT |
| 8 | GF-CRYPTO-054 | 17 | UX polish — keyboard nav, presets, exports, type unification |
| **Total** | — | **75** | — |

**Cumulative when all 4 sprints land:** 94 (delivered) + 75 (planned) = **169 pts**.

### Recommended sprint ordering
Run **5 → 6** before 7/8 — live data is the biggest perceived-quality win, and
production hardening protects everything that follows. **7 (Auth) is a hard
prerequisite** for any kind of public deploy beyond the demo IP. **8 (UX)** can
slot in anywhere or be sprinkled across other sprints as polish.

---

## Sprint 5 — Demo Credibility (Live Data) | 2026-04-28

> **Goal:** Replace mock data with real exchange APIs + persist user-state to
> CMS. The dashboard should feel like a product, not a demo.

### Done
- [x] STORY-501: CoinGecko adapter + MOCK/LIVE badge (5 pts) ✅ 2026-04-28 — `src/api/live/coingecko.ts` with 60s in-memory cache, `src/api/live/index.ts` smart router that falls back to mock on rate-limit / network failure, `src/components/DataSourceBadge.tsx` mounted in sidebar showing current source
- [x] STORY-502: WebSocket price ticker via Binance (5 pts) ✅ 2026-04-28 — `src/api/live/binanceWs.ts` (multi-stream subscribe, exponential backoff reconnect capped at 30s), `src/hooks/useLiveTicker.ts` (no-op when live mode disabled)
- [x] STORY-503: Persist watchlist to CMS (5 pts) ✅ 2026-04-28 — `cms/src/collections/Watchlist.ts` (userId+symbol unique index), `src/api/cms/userState.ts` CRUD, `src/hooks/usePersistedWatchlist.ts` (React Query mutations with cache invalidation), `PersistedWatchlistPanel` mounted on /watchlist
- [x] STORY-504: Persist alerts to CMS (3 pts) ✅ 2026-04-28 — `cms/src/collections/AlertConfigs.ts` (asset, condition, threshold, status), `usePersistedAlerts` hooks, `PersistedAlertsPanel` mounted on /alerts with create form + delete buttons
- [x] STORY-505: Tests for live-data path (3 pts) ✅ 2026-04-28 — 15 new tests: `coingecko.test.ts` (4: mapping, error, cache, cache scope), `userState.test.ts` (6: list/add/remove for both collections), `DataSourceBadge.test.tsx` (2), `PersistedWatchlistPanel.test.tsx` (3)

**Sprint 5 velocity:** 21 / 21 pts
**Cumulative (incl Sprint 5):** 115 / 169 pts (68% of total planned)

**Tests (frontend):** 168 passing across 29 files (up from 153)
**Tests (CMS):** 36 passing across 3 files (unchanged)
**Total tests:** 204 passing
**Frontend coverage:** 86.26% statements / 83.42% branch / 80.72% functions / 86.26% lines (still above 80% target; slight dip explained by `binanceWs.ts` being WS-only and untestable without a mock WS server)
**Typecheck:** `tsc --noEmit` clean (frontend + CMS)
**Blockers:** none

### How to enable live mode

```bash
# Build with live data
VITE_LIVE_PRICES=1 VITE_CMS_URL=http://localhost:3001 docker compose up --build

# Or in .env
VITE_LIVE_PRICES=1
VITE_CMS_URL=http://localhost:3001
```

When `VITE_LIVE_PRICES=1`:
- Charts page calls CoinGecko `coins/{id}/market_chart`
- Header badge shows `LIVE` (green pulsing dot) instead of `MOCK`
- WebSocket subscriptions fire for BTC/ETH/SOL/ADA last-trade
- Falls back to mock automatically on rate-limit (429) or network failure

---

## Sprint 6 — Production Hardening | 2026-04-28

> **Goal:** Move from "works on my machine" to "I would let a customer use this".
> CI, E2E, production-grade CMS container, generated types, ADRs.

### Done
- [x] STORY-601: Production CMS Dockerfile (5 pts) ✅ 2026-04-28 — `cms/Dockerfile.production`: multi-stage (deps → builder → runtime), non-root `payload` user, `NODE_ENV=production`, healthcheck, libc6-compat, persistent SQLite volume at `/data`. Trade-off documented in ADR-0008: still uses `npx payload dev` because Payload v3 requires a Next.js scaffold for `next start` (queued).
- [x] STORY-602: GitHub Actions CI (5 pts) ✅ 2026-04-28 — `.github/workflows/cryptoadvisor.yml`: 3 jobs (frontend tsc+vitest+coverage, CMS tsc+vitest, multi-stage Docker build with GHA cache). Triggers on PRs touching `cryptoadvisor-web/**` and pushes to the `cryptoadvisor` branch. Coverage uploaded as artifact (14-day retention).
- [x] STORY-603: Playwright E2E (8 pts) ✅ 2026-04-28 — `playwright.config.ts` (chromium, retain-on-failure traces/screenshots/video, single worker, GHA reporter in CI), `e2e/walkthrough.spec.ts` covers dashboard load, /signals navigation, /risk calculation (when full-stack), /watchlist persisted-panel detection. Mock-only mode skips CMS-dependent assertions; full-stack mode (set `E2E_FULL_STACK=1`) drives the calculator.
- [x] STORY-604: payload-types autogen (2 pts) ✅ 2026-04-28 — `prebuild` script added to `cms/package.json` runs `payload generate:types` automatically before `npm run build`. Frontend `package.json` also gains `e2e` + `e2e:ui` scripts and `@playwright/test` devDep.
- [x] STORY-605: ADR-0008 + ADR-0009 (1 pt) ✅ 2026-04-28 — `docs/adr/0008-headless-cms-payload.md` (Payload chosen over Strapi/Directus, with the `payload dev` production trade-off documented), `docs/adr/0009-mock-cms-env-toggle.md` (build-time `VITE_CMS_URL` + `VITE_LIVE_PRICES` env-flag pattern; smart fallback to mock on live failure).

**Sprint 6 velocity:** 21 / 21 pts
**Cumulative (incl Sprint 6):** 136 / 169 pts (80% of total planned)

**Tests (frontend, vitest):** 132 passing across 26 files (CMS tests now correctly excluded via vitest.config — they're 36 tests across 3 files, run separately in their own job)
**Tests (CMS, vitest):** 36 passing across 3 files
**Total tests:** 168 passing
**Frontend coverage:** 86.26% statements / 83.42% branch / 80.72% functions / 86.26% lines (still above the 80% threshold)
**Typecheck:** `tsc --noEmit` clean (frontend + CMS)
**Docker:** both `Dockerfile` and `cms/Dockerfile.production` smoke-tested clean
**Blockers:** none

### Verification gates added by this sprint

| Gate | Local | CI |
|------|-------|----|
| Frontend tsc | `npx tsc --noEmit` | ✅ frontend job |
| Frontend vitest | `npx vitest run` | ✅ frontend job |
| Frontend coverage | `npx vitest run --coverage` | ✅ frontend job (uploads artifact) |
| CMS tsc | `cd cms && npx tsc --noEmit` | ✅ cms job |
| CMS vitest | `cd cms && npx vitest run` | ✅ cms job |
| Multi-stage Docker (web) | `docker build cryptoadvisor-web` | ✅ docker-build job |
| Multi-stage Docker (CMS prod) | `docker build -f cms/Dockerfile.production cms/` | ✅ docker-build job |
| E2E walkthrough | `npm run e2e` | not yet (planned for Sprint 7+ once auth lands) |

### Notes for next sprints

- Sprint 7 (Auth) — once login is in place, add E2E for login → protected route → logout cycle and bring `npm run e2e` into the CI workflow as a fourth job.
- The `cms/Dockerfile.production` has a known compromise (runs `payload dev`); ADR-0008 documents the Next.js scaffold path for true production.
