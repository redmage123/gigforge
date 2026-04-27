# Sprint Plan — CryptoAdvisor Web Dashboard

**Client:** braun.brelin@ai-elevate.ai
**Project:** CryptoAdvisor Web Frontend
**Practice:** Programming & Development
**Tier:** L (8–16h estimated)
**Type:** Internal portfolio demo — no billing
**PM:** gigforge-pm
**Created:** 2026-03-22
**Updated:** 2026-03-23

---

## Milestone → PostgreSQL Mapping

The following milestones are pre-seeded in the `milestones` table. All story assignments in this plan align to these milestone IDs.

| Milestone | Name | Postgres milestone_id |
|-----------|------|-----------------------|
| M1 | Design | 1 |
| M2 | Backend | 2 |
| M3 | Frontend | 3 |
| M4 | Testing | 4 |
| M5 | Deployment | 5 |

> Stories are tagged with their milestone label in the sprint tables below.

---

## Task Breakdown by Role

### Engineer (gigforge-engineer / gigforge-dev-frontend)

| ID | Task | Milestone | Sprint | Est |
|----|------|-----------|--------|-----|
| STORY-008 | Project scaffold (Vite + React 19 + TS + Tailwind 4) | Backend | Sprint 1 | 3 pts |
| STORY-010 | Mock data layer — portfolio + prices | Backend | Sprint 1 | 3 pts |
| STORY-011 | Mock data layer — signals, alerts, transactions, watchlist | Backend | Sprint 1 | 3 pts |
| STORY-012 | React Router + app shell (sidebar, header, content area) | Frontend | Sprint 1 | 3 pts |
| STORY-013 | Sidebar navigation with active state | Frontend | Sprint 1 | 2 pts |
| STORY-014 | Portfolio overview stat cards + sparklines | Frontend | Sprint 2 | 3 pts |
| STORY-015 | Portfolio allocation pie chart (Recharts PieChart) | Frontend | Sprint 2 | 3 pts |
| STORY-016 | Candlestick price chart + timeframe selector | Frontend | Sprint 2 | 5 pts |
| STORY-017 | Watchlist panel | Frontend | Sprint 2 | 3 pts |
| STORY-018 | Asset selector — switch chart by ticker | Frontend | Sprint 2 | 2 pts |
| STORY-019 | AI trading signals panel | Frontend | Sprint 3 | 3 pts |
| STORY-020 | Alerts panel | Frontend | Sprint 3 | 3 pts |
| STORY-021 | Transaction history table (sortable) | Frontend | Sprint 3 | 5 pts |
| STORY-022 | Loading skeleton states for all panels | Frontend | Sprint 3 | 2 pts |
| STORY-023 | Empty and error states for all panels | Frontend | Sprint 3 | 2 pts |
| STORY-025 | Vitest + Testing Library test suite | Testing | Sprint 3 | 5 pts |
| STORY-026 | Docker multi-stage build + docker-compose | Deployment | Sprint 3 | 2 pts |
| STORY-027 | README — setup, run, test, Docker instructions | Deployment | Sprint 3 | 1 pt |

**Engineer total: ~49 pts across Sprints 1–3**

### UX Designer (gigforge-ux)

| ID | Task | Milestone | Sprint | Est |
|----|------|-----------|--------|-----|
| STORY-001 | Dark theme design system (tokens, palette, typography) | Design | Sprint 0 | 2 pts |
| STORY-002 | Dashboard layout wireframe (all panel positions) | Design | Sprint 0 | 2 pts |
| STORY-003 | Portfolio overview component spec | Design | Sprint 0 | 2 pts |
| STORY-004 | Candlestick chart component spec | Design | Sprint 0 | 3 pts |
| STORY-005 | AI signals + alerts panel spec | Design | Sprint 0 | 2 pts |
| STORY-006 | Transaction history table spec | Design | Sprint 0 | 2 pts |
| STORY-007 | Watchlist panel spec | Design | Sprint 0 | 1 pt |
| STORY-009 | Dark theme Tailwind config + CSS design tokens | Design | Sprint 1 | 2 pts |
| STORY-024 | Responsive layout review (375px / 768px / 1280px) | Frontend | Sprint 3 | 3 pts |

**UX Designer total: ~19 pts across Sprints 0–3**

---

## Project Overview

A React 19 financial dashboard for the CryptoAdvisor portfolio demo. Dark-themed, data-rich UI with mock API data — no real crypto API calls. Showcases portfolio management, price charts (candlestick), AI trading signals, alerts, portfolio allocation, transaction history, and a watchlist.

**Stack:** React 19 · TypeScript · Vite · Tailwind CSS 4 · Recharts · React Router · Vitest + Testing Library · Docker

---

## Milestones

| # | Milestone   | Sprint(s)   | Notes                                      |
|---|-------------|-------------|--------------------------------------------|
| 1 | Design      | Sprint 0    | UX specs, design tokens, component layouts |
| 2 | Backend     | Sprint 1    | Mock data layer, types, API hooks          |
| 3 | Frontend    | Sprint 2–3  | All UI components wired to mock data       |
| 4 | Testing     | Sprint 3    | Vitest suite, coverage ≥80%                |
| 5 | Deployment  | Sprint 3    | Docker, README, production build           |

---

## User Stories

### SPRINT 0 — Design (UX Designer)

| Story | Title | Points | Priority | Assigned |
|-------|-------|--------|----------|----------|
| STORY-001 | Dark theme design system | 2 | Must | UX Designer |
| STORY-002 | Dashboard layout wireframe | 2 | Must | UX Designer |
| STORY-003 | Portfolio overview component spec | 2 | Must | UX Designer |
| STORY-004 | Price chart (candlestick) component spec | 3 | Must | UX Designer |
| STORY-005 | AI signals + alerts panel spec | 2 | Must | UX Designer |
| STORY-006 | Transaction history table spec | 2 | Must | UX Designer |
| STORY-007 | Watchlist panel spec | 1 | Must | UX Designer |

**Sprint 0 total:** 14 pts

---

### SPRINT 1 — Foundation & Mock Data Layer

| Story | Title | Points | Priority | Milestone | Assigned |
|-------|-------|--------|----------|-----------|----------|
| STORY-008 | Project scaffold (Vite + React 19 + TS + Tailwind 4) | 3 | Must | Backend | Lead Dev |
| STORY-009 | Dark theme Tailwind config + CSS design tokens | 2 | Must | Design | UI Engineer |
| STORY-010 | Mock API data layer — portfolio + prices | 3 | Must | Backend | Lead Dev |
| STORY-011 | Mock API data layer — signals, alerts, transactions, watchlist | 3 | Must | Backend | Lead Dev |
| STORY-012 | React Router + app shell (sidebar, header, content area) | 3 | Must | Frontend | UI Engineer |
| STORY-013 | Sidebar navigation with active state | 2 | Must | Frontend | UI Engineer |

**Sprint 1 total:** 16 pts | **Capacity:** 20 pts | **Buffer:** 4 pts

---

### SPRINT 2 — Core Dashboard Components

| Story | Title | Points | Priority | Milestone | Assigned |
|-------|-------|--------|----------|-----------|----------|
| STORY-014 | Portfolio overview card (total value, P&L, % change, sparkline) | 3 | Must | Frontend | UI Engineer |
| STORY-015 | Portfolio allocation pie chart (Recharts PieChart) | 3 | Must | Frontend | UI Engineer |
| STORY-016 | Candlestick price chart with timeframe selector (1D/1W/1M) | 5 | Must | Frontend | UI Engineer |
| STORY-017 | Watchlist panel (ticker, price, 24h change, mini sparkline) | 3 | Must | Frontend | UI Engineer |
| STORY-018 | Asset selector — switch chart by ticker | 2 | Should | Frontend | UI Engineer |

**Sprint 2 total:** 16 pts | **Capacity:** 20 pts | **Buffer:** 4 pts

---

### SPRINT 3 — Signals, Alerts, Transactions + Polish + Deployment

| Story | Title | Points | Priority | Milestone | Assigned |
|-------|-------|--------|----------|-----------|----------|
| STORY-019 | AI trading signals panel (BUY/SELL/HOLD badges, confidence %) | 3 | Must | Frontend | UI Engineer |
| STORY-020 | Alerts panel (price alert cards with threshold + status) | 3 | Must | Frontend | UI Engineer |
| STORY-021 | Transaction history table (sortable columns, type badge, date) | 5 | Must | Frontend | UI Engineer |
| STORY-022 | Loading skeleton states for all panels | 2 | Should | Frontend | UI Engineer |
| STORY-023 | Empty and error states for all panels | 2 | Should | Frontend | UI Engineer |
| STORY-024 | Responsive layout (mobile 375px, tablet 768px, desktop 1280px) | 3 | Must | Frontend | UI Engineer |
| STORY-025 | Vitest + Testing Library test suite (all components) | 5 | Must | Testing | Lead Dev |
| STORY-026 | Docker multi-stage build + docker-compose | 2 | Must | Deployment | Lead Dev |
| STORY-027 | README — setup, run, test, Docker instructions | 1 | Must | Deployment | Lead Dev |

**Sprint 3 total:** 26 pts | **Capacity:** 30 pts | **Buffer:** 4 pts

---

## Full Story Detail

### STORY-001: Dark theme design system
*As a UI Engineer, I want a defined design token set so that all components share a consistent dark financial aesthetic.*

**Acceptance criteria:**
- [ ] Color palette defined (background, surface, border, text, accent, positive/negative)
- [ ] Typography scale defined (font family, sizes, weights)
- [ ] Spacing scale defined
- [ ] All values documented in `specs/design-system.md`

**Test cases:**
- Render a sample card with all tokens — no hardcoded hex values in components

---

### STORY-008: Project scaffold
*As a developer, I want a working Vite + React 19 + TypeScript + Tailwind 4 project so that the team can start building immediately.*

**Acceptance criteria:**
- [ ] `pnpm create vite` with React + TypeScript template
- [ ] Tailwind CSS 4 configured
- [ ] Vitest + Testing Library configured
- [ ] `pnpm dev` starts on port 5173
- [ ] `pnpm test` runs the test suite
- [ ] `pnpm build` produces a production bundle

---

### STORY-010: Mock API data layer — portfolio + prices
*As a developer, I want a typed mock data service so that components have realistic crypto data without a real API.*

**Acceptance criteria:**
- [ ] `src/api/mock/portfolio.ts` — holdings, total value, P&L, 24h change
- [ ] `src/api/mock/prices.ts` — OHLCV candlestick data for BTC, ETH, SOL, ADA (30 candles each)
- [ ] TypeScript types exported from `src/types/`
- [ ] All mock functions return `Promise<T>` (simulates async fetch)
- [ ] 150ms artificial delay to test loading states

**Test cases:**
- Happy path: `getPortfolio()` resolves with correct shape
- Type guard test: holdings array contains required fields

---

### STORY-011: Mock API data layer — signals, alerts, transactions, watchlist
*As a developer, I want mock data for all remaining dashboard panels.*

**Acceptance criteria:**
- [ ] `src/api/mock/signals.ts` — AI signals with asset, direction (BUY/SELL/HOLD), confidence, timestamp
- [ ] `src/api/mock/alerts.ts` — price alerts with asset, threshold, condition, triggered status
- [ ] `src/api/mock/transactions.ts` — 20 historical transactions (buy/sell, asset, amount, price, date)
- [ ] `src/api/mock/watchlist.ts` — 6 watched assets with current price, 24h change, sparkline data

---

### STORY-016: Candlestick price chart
*As a user, I want to see OHLCV candlestick charts so that I can analyse price action for any asset.*

**Acceptance criteria:**
- [ ] Recharts `ComposedChart` with custom candlestick shape
- [ ] 1D / 1W / 1M timeframe selector buttons
- [ ] Volume bars below price chart
- [ ] Asset selector dropdown (BTC, ETH, SOL, ADA)
- [ ] Responsive container fills available width
- [ ] Tooltip shows O/H/L/C values on hover
- [ ] Dark theme colours (green up candles, red down candles)

**Test cases:**
- Renders without crashing with mock OHLCV data
- Timeframe buttons change displayed data set
- Volume bars render alongside price chart

---

### STORY-019: AI trading signals panel
*As a user, I want to see AI-generated trading signals so that I can make informed decisions.*

**Acceptance criteria:**
- [ ] Signal cards with asset name, direction badge (BUY=green/SELL=red/HOLD=yellow), confidence % bar
- [ ] Timestamp ("2h ago" relative format)
- [ ] Panel scrolls if > 5 signals
- [ ] Signals sorted by timestamp desc

---

### STORY-021: Transaction history table
*As a user, I want a sortable transaction history so that I can review past trades.*

**Acceptance criteria:**
- [ ] Columns: Date, Asset, Type (BUY/SELL), Amount, Price, Total, Status
- [ ] Type column has colour-coded badge
- [ ] Clicking column header sorts ascending/descending
- [ ] Alternating row shading for readability
- [ ] Shows last 20 transactions from mock data

---

### STORY-025: Vitest + Testing Library test suite
*As a developer, I want a comprehensive test suite so that regressions are caught automatically.*

**Acceptance criteria:**
- [ ] Every component has a `*.test.tsx` file
- [ ] Minimum test coverage: renders without crashing, primary interaction, accessibility (role queries)
- [ ] `pnpm test` passes with 0 failures
- [ ] Coverage ≥ 80% on `src/components/`
- [ ] CI-ready: `pnpm test --run` exits with code 0

---

### STORY-026: Docker multi-stage build
*As a DevOps engineer, I want a Docker image so that the dashboard can be deployed anywhere.*

**Acceptance criteria:**
- [ ] Multi-stage Dockerfile: `deps` → `builder` → `runner` (nginx)
- [ ] `docker build` succeeds and image is < 100MB
- [ ] `docker run -p 5000:80` serves the app
- [ ] `docker-compose.yml` with single service
- [ ] Health check via nginx default config

---

## Sprint Timeline

| Sprint | Duration | Focus |
|--------|----------|-------|
| Sprint 0 | 0.5 days | UX design specs + design tokens |
| Sprint 1 | 1 day | Scaffold + mock data + app shell |
| Sprint 2 | 1.5 days | Portfolio overview, charts, watchlist |
| Sprint 3 | 2 days | Signals, alerts, transactions, tests, Docker |
| **Total** | **5 days** | |

---

## Definition of Done

A story is **Done** when:
1. All acceptance criteria are checked off
2. Tests are written (TDD: RED → GREEN → REFACTOR)
3. Test suite passes (`pnpm test`)
4. UX Designer has reviewed UI stories against spec
5. Code committed with story ID (`git commit -m "STORY-NNN: ..."`)

---

## Approval Gate (before delivery)

- [ ] **QA Engineer** — runs full test suite, verifies every AC, screenshots all panels
- [ ] **Client Advocate** — reviews as the paying client, scores quality

Both must approve. No exceptions.

---

## Technical Notes

- **No real API keys** — all data is mock, runs 100% offline
- **Charts:** Recharts for pie + candlestick; fallback to Chart.js if needed
- **Dark theme:** CSS custom properties on `:root`, Tailwind `darkMode: 'class'` with `dark` class on `<html>`
- **Financial colours:** green `#22c55e` for gains, red `#ef4444` for losses
- **Fonts:** Inter (or system-ui fallback)
- **State management:** React Query for mock async calls; no Redux/Zustand needed
