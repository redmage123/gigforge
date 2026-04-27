# Tech Stack Decision
## Project: CryptoAdvisor Web Dashboard
## Date: 2026-03-22
## Decision By: Chris Novak (CTO)

---

> **Architecture note:** This is a **frontend-only project**. There is no application server, no database, and no external API calls. All data is served from a typed in-memory mock layer inside the React app. The "backend" section below describes that mock data layer — not a server process.

---

### Backend

- **Language: TypeScript 5 (strict mode) — runs entirely in the browser**
  There is no server process. The "backend" is a mock data service module (`src/api/mock/`) that returns typed `Promise<T>` values with a simulated 150ms delay. This is intentional: the project demonstrates financial dashboard UI without requiring API keys, network access, or infrastructure. All data is deterministic, reproducible, and offline-capable.

- **Framework: None (mock service layer only)**
  No Express, no FastAPI, no server. The mock layer uses plain async TypeScript functions. Each module (`portfolio.ts`, `prices.ts`, `signals.ts`, `alerts.ts`, `transactions.ts`, `watchlist.ts`) exports a typed service interface that components consume via React Query hooks. The interface is designed so a real HTTP backend can be swapped in later by changing only the `src/api/` layer.

- **Database: None**
  No persistence. No SQLite, no PostgreSQL, no localStorage. All mock data is generated at import time and returned from async functions. If persistence is added in a future phase, the service interface remains unchanged — only the implementation inside each mock module changes.

- **Key mock data modules:**
  - `src/api/mock/portfolio.ts` — holdings array, total value, P&L, 24h change
  - `src/api/mock/prices.ts` — OHLCV candlestick arrays for BTC, ETH, SOL, ADA (30 candles × 3 timeframes)
  - `src/api/mock/signals.ts` — AI signals with asset, direction (BUY/SELL/HOLD), confidence 0–100, timestamp
  - `src/api/mock/alerts.ts` — price alerts with asset, threshold, condition (above/below), triggered status
  - `src/api/mock/transactions.ts` — 20 historical transactions (buy/sell, asset, amount, price, USD total, status)
  - `src/api/mock/watchlist.ts` — 6 assets with price, 24h change %, sparkline data points
  - `src/api/index.ts` — re-exports all mock services as the public API surface

---

### Frontend

- **Framework: React 19 with TypeScript 5 (strict mode)**
  Client specified React 19. React 19's concurrent features — `Suspense`, `useTransition`, `use()` hook — are directly applicable here: loading skeletons via Suspense boundaries, non-blocking chart data loads. The concurrent model improves perceived performance on a data-dense dashboard where multiple panels load independently.

- **Package manager: pnpm**
  pnpm is specified in the sprint plan. Faster installs, strict dependency isolation, smaller node_modules footprint vs npm. All commands use `pnpm` — `pnpm dev`, `pnpm build`, `pnpm test`.

- **Styling: Tailwind CSS 4 with CSS custom properties**
  Tailwind 4 reached stable release in January 2025 and is production-ready as of March 2026. The v4 engine (Oxide) is faster and supports a new CSS-first config approach. The design system spec defines all tokens as CSS custom properties on `:root` — Tailwind config extends these. Dark mode is class-based (`darkMode: ['class']`), with `dark` applied to `<html>` at startup and never toggled (dark-only project).

- **Build tool: Vite 5**
  `pnpm create vite` with the React + TypeScript template. Fast HMR during development (port 5173). Production output is a static `dist/` directory served by nginx. `VITE_API_URL` is not needed — there is no API to call.

- **State/data management: TanStack Query v5 (React Query)**
  React Query manages all async mock data: caching, loading states, error states, and refetch. Components never call mock functions directly — they use hooks (`usePortfolio`, `usePrices`, `useSignals`, etc.) that wrap React Query's `useQuery`. This is the correct abstraction: when mock functions are later replaced with real `fetch()` calls, only the query function changes, not the component.

- **Routing: React Router v7**
  Seven named routes, each mapped to a full-page view. The sidebar nav highlights the active route. No nested routes needed — each section is a top-level page.

- **Charts: Recharts**
  Recharts is the primary chart library. It is React-native (SVG-based, fully controlled), TypeScript-friendly, and composable. Used for:
  - `PieChart` — portfolio allocation
  - `ComposedChart` with custom `CandlestickBar` shape — OHLCV price chart
  - `AreaChart` — sparklines in watchlist and portfolio stat cards
  - `BarChart` — volume bars below the candlestick chart

- **Key dependencies:**
  ```json
  {
    "dependencies": {
      "react": "^19.0.0",
      "react-dom": "^19.0.0",
      "react-router": "^7.0.0",
      "@tanstack/react-query": "^5.0.0",
      "recharts": "^2.12.0"
    },
    "devDependencies": {
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      "@vitejs/plugin-react": "^4.0.0",
      "@vitest/coverage-v8": "^2.0.0",
      "@testing-library/react": "^16.0.0",
      "@testing-library/jest-dom": "^6.0.0",
      "@testing-library/user-event": "^14.0.0",
      "jsdom": "^24.0.0",
      "tailwindcss": "^4.0.0",
      "typescript": "^5.3.3",
      "vite": "^5.0.0",
      "vitest": "^2.0.0"
    }
  }
  ```

---

### Infrastructure

- **Containerization: Docker (single service)**
  This is a static SPA — one container running nginx:alpine to serve the pre-built Vite output. No Docker Compose multi-service setup is needed: there is no database, no API server, no separate process.

  Multi-stage `Dockerfile`:
  - Stage 1 `deps`: `node:22-alpine`, install pnpm, install node_modules
  - Stage 2 `builder`: run `pnpm build`, output goes to `/app/dist`
  - Stage 3 `runner`: `nginx:alpine`, copy `dist/` to `/usr/share/nginx/html`, copy custom nginx config

  A `docker-compose.yml` is provided for convenience (`docker compose up --build`), but it wraps a single service.

- **Deployment strategy: single static container**
  The entire application is compiled to ~200–400KB of HTML/CSS/JS at build time. nginx serves these files. There is no runtime process, no env vars to inject, no health check endpoint beyond nginx's default behaviour.

  ```
  docker build -t cryptoadvisor-web .
  docker run -p 5000:80 cryptoadvisor-web
  ```

- **Port mapping:**

  | Stage | Internal | Host |
  |-------|----------|------|
  | Dev (Vite HMR) | 5173 | 5173 |
  | Production (nginx) | 80 | 5000 |

  Port 5000 is the registered port for `cryptoadvisor-web` in the workspace registry (AGENTS.md).
  Host port 3000 is occupied by `ai-chat-widget`, `job-board`, and `todo-rest-api`.

- **Reverse proxy: nginx with SPA routing**
  The nginx config must include `try_files $uri /index.html` — React Router handles all client-side routes, so any deep URL must return `index.html`. Additionally:
  - `gzip on` for text/html, application/javascript, text/css, application/json
  - 1-year `Cache-Control: max-age=31536000, immutable` on `/assets/` (Vite content-hashes all asset filenames)
  - `Cache-Control: no-cache` on `index.html` itself (must always be fresh)

---

### File Structure

Every file that must exist at project completion:

```
cryptoadvisor-web/
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── .gitignore
├── README.md
├── index.html
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
├── tailwind.config.ts
├── postcss.config.js               ← Required for Tailwind 4
│
├── .github/
│   └── workflows/
│       └── ci.yml
│
├── specs/
│   └── design-system.md            ← Already exists (STORY-001)
│
└── src/
    ├── main.tsx                    ← createRoot, QueryClientProvider, Router, dark class on <html>
    ├── App.tsx                     ← Route definitions, Layout wrapper
    ├── index.css                   ← CSS custom properties (:root tokens), @import 'tailwindcss'
    │
    ├── types/
    │   └── index.ts                ← All shared TypeScript interfaces:
    │                                   Asset, Holding, Portfolio, OHLCVCandle, PriceData,
    │                                   Signal, Alert, Transaction, WatchlistItem
    │
    ├── api/
    │   ├── index.ts                ← Re-exports all mock services
    │   └── mock/
    │       ├── portfolio.ts        ← getPortfolio(): Promise<Portfolio>
    │       ├── prices.ts           ← getPrices(asset, timeframe): Promise<PriceData>
    │       ├── signals.ts          ← getSignals(): Promise<Signal[]>
    │       ├── alerts.ts           ← getAlerts(): Promise<Alert[]>
    │       ├── transactions.ts     ← getTransactions(): Promise<Transaction[]>
    │       └── watchlist.ts        ← getWatchlist(): Promise<WatchlistItem[]>
    │
    ├── hooks/
    │   ├── usePortfolio.ts         ← useQuery wrapper for getPortfolio
    │   ├── usePrices.ts            ← useQuery wrapper for getPrices (asset + timeframe params)
    │   ├── useSignals.ts           ← useQuery wrapper for getSignals
    │   ├── useAlerts.ts            ← useQuery wrapper for getAlerts
    │   ├── useTransactions.ts      ← useQuery wrapper for getTransactions
    │   └── useWatchlist.ts         ← useQuery wrapper for getWatchlist
    │
    ├── components/
    │   ├── layout/
    │   │   ├── AppLayout.tsx       ← Sidebar + header + <Outlet>
    │   │   ├── Sidebar.tsx         ← Nav links, logo, active state, mobile collapse
    │   │   └── Header.tsx          ← Page title, global search placeholder
    │   │
    │   ├── ui/
    │   │   ├── StatCard.tsx        ← Portfolio value / P&L stat cards
    │   │   ├── Panel.tsx           ← Generic panel wrapper (header + body)
    │   │   ├── Badge.tsx           ← BUY/SELL/HOLD/status badges
    │   │   ├── LoadingSkeleton.tsx ← Animated skeleton placeholder
    │   │   ├── EmptyState.tsx      ← Empty panel with icon + message
    │   │   └── ErrorBanner.tsx     ← Red error state banner
    │   │
    │   └── charts/
    │       ├── CandlestickChart.tsx  ← Recharts ComposedChart + custom candle shape + volume
    │       ├── AllocationPieChart.tsx ← Recharts PieChart for portfolio allocation
    │       └── Sparkline.tsx         ← Recharts AreaChart mini sparkline
    │
    └── pages/
        ├── Dashboard.tsx           ← Main grid: stat cards + pie + candlestick + signals + watchlist + alerts + transactions
        ├── Portfolio.tsx           ← Holdings table, allocation breakdown, P&L history sparklines
        ├── Charts.tsx              ← Full-page candlestick chart with extended asset/timeframe controls
        ├── Signals.tsx             ← Full signals list with filters
        ├── Alerts.tsx              ← Full alerts list with triggered/active filters
        ├── Transactions.tsx        ← Full sortable transaction history table
        └── Watchlist.tsx           ← Full watchlist with spark charts
```

**Test files** (`*.test.tsx`) sit alongside each component:
```
src/components/ui/StatCard.test.tsx
src/components/ui/Panel.test.tsx
src/components/ui/Badge.test.tsx
src/components/charts/CandlestickChart.test.tsx
src/components/charts/AllocationPieChart.test.tsx
src/components/charts/Sparkline.test.tsx
src/pages/Dashboard.test.tsx
src/pages/Transactions.test.tsx
src/api/mock/portfolio.test.ts
src/api/mock/prices.test.ts
src/hooks/usePortfolio.test.ts
```

---

### API Design

There is no HTTP API. The mock service interface is the contract. Components may only import from `src/api/index.ts` — never directly from `src/api/mock/`.

#### Mock service contracts

```typescript
// Portfolio
getPortfolio(): Promise<Portfolio>
// Returns: { totalValue: number, change24h: number, changePct24h: number,
//            holdings: Holding[] }
// Holding: { asset: string, symbol: string, amount: number, value: number,
//            allocationPct: number, avgBuyPrice: number, currentPrice: number,
//            pnl: number, pnlPct: number }

// Prices
getPrices(asset: string, timeframe: '1D' | '1W' | '1M'): Promise<PriceData>
// Returns: { asset, timeframe, candles: OHLCVCandle[] }
// OHLCVCandle: { timestamp: number, open: number, high: number, low: number,
//               close: number, volume: number }
// Assets: 'BTC' | 'ETH' | 'SOL' | 'ADA'

// Signals
getSignals(): Promise<Signal[]>
// Signal: { id, asset, direction: 'BUY'|'SELL'|'HOLD', confidence: number (0–100),
//           reason: string, timestamp: string (ISO) }

// Alerts
getAlerts(): Promise<Alert[]>
// Alert: { id, asset, condition: 'above'|'below', threshold: number,
//          currentPrice: number, triggered: boolean, createdAt: string }

// Transactions
getTransactions(): Promise<Transaction[]>
// Transaction: { id, date: string, asset, symbol, type: 'BUY'|'SELL',
//               amount: number, price: number, total: number,
//               status: 'completed'|'pending'|'failed' }

// Watchlist
getWatchlist(): Promise<WatchlistItem[]>
// WatchlistItem: { asset, symbol, currentPrice: number, change24h: number,
//                  changePct24h: number, sparkline: number[] (12 points) }
```

All mock functions:
- Return `Promise<T>` (never synchronous)
- Introduce a 150ms artificial delay (`await new Promise(r => setTimeout(r, 150))`)
- Return the same data on every call (deterministic — predictable for tests)

**React Query key conventions:**
```typescript
['portfolio']
['prices', asset, timeframe]
['signals']
['alerts']
['transactions']
['watchlist']
```

---

### Quality Requirements

- **Test framework: Vitest 2 + Testing Library + jsdom**
  Vitest is co-located with Vite — zero additional config overhead. `@testing-library/react` for component rendering and user interaction. `@testing-library/jest-dom` for DOM matchers. Tests run in jsdom environment.

  Configuration in `vitest.config.ts`:
  ```typescript
  export default defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/setupTests.ts'],
      globals: true,
      coverage: {
        provider: 'v8',
        include: ['src/components/**', 'src/hooks/**', 'src/api/mock/**'],
        thresholds: { lines: 80, functions: 80, branches: 75 }
      }
    }
  })
  ```

- **Coverage target: ≥80% line coverage on `src/components/`, `src/hooks/`, `src/api/mock/`**
  Every component must have a test file. Minimum per test: renders without crashing, primary interaction verified, key accessibility roles queried.

- **Mock strategy for Recharts in tests:**
  Recharts uses SVG and ResizeObserver which jsdom does not support. Mock Recharts in `src/setupTests.ts`:
  ```typescript
  vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }) => children,
    PieChart: () => <div data-testid="pie-chart" />,
    ComposedChart: () => <div data-testid="composed-chart" />,
    AreaChart: () => <div data-testid="area-chart" />,
    // ... etc
  }))
  ```

- **TypeScript: strict mode, zero `any`**
  `tsconfig.json` must have `"strict": true`, `"noUncheckedIndexedAccess": true`. All numeric values from the mock layer are typed — no `number | undefined` surprises when rendering prices.

- **CI: GitHub Actions (`ci.yml`)**
  Three jobs:
  1. `test` — `pnpm ci && pnpm test --run`
  2. `build` — `pnpm build` (TypeScript compile + Vite bundle)
  3. `docker-build` — `docker build -t cryptoadvisor-web .`

  All three must pass on every push to `main`. No deployment step for demo.

- **pnpm scripts:**
  ```json
  "scripts": {
    "dev": "vite --port 5173",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "lint": "tsc --noEmit"
  }
  ```

---

## DevOps Review

**Reviewer:** gigforge-devops
**Date:** 2026-03-22
**Verdict:** APPROVED WITH ONE REQUIRED CHANGE (port mapping)

---

### 1. Containerization — PASS

Clean single-stage nginx static deployment. Multi-stage Dockerfile (deps → builder → runner) is the correct pattern for a Vite SPA:

- Stage 1/2 (`node:22-alpine`) builds the bundle and is discarded
- Stage 3 (`nginx:alpine`) serves ~200–400KB of pre-hashed static assets
- No runtime process, no secrets, no env var injection needed at runtime
- Expected final image size: ~25–35MB (nginx:alpine base + static files)
- No Docker Compose complexity — single service is appropriate

The nginx config requirements (SPA `try_files`, gzip, immutable asset caching, no-cache on `index.html`) are all correct and must be implemented as specified.

---

### 2. Port Conflicts — FLAG (action required)

**The proposed host port `3000` conflicts with three existing projects on this host:**

| Project | docker-compose port mapping |
|---------|----------------------------|
| `ai-chat-widget` | `3000:3000` |
| `job-board` | `3000:3000` (frontend) |
| `todo-rest-api` | `3000:3000` |
| `crm` | `${FRONTEND_PORT:-3000}:80` (default) |

The AGENTS.md workspace registry already lists `cryptoadvisor-web` at **port 5000**, which is currently unassigned across all projects.

**Required change:** Update the docker-compose port mapping from `3000:80` to `5000:80`.

```yaml
# docker-compose.yml — corrected
ports:
  - "5000:80"
```

```bash
# Corrected run command
docker run -p 5000:80 cryptoadvisor-web
```

Dev port `5173` (Vite HMR) has no conflicts — clear to use.

Also note: `cryptoadvisor-dashboard` binds `80:80` directly on the host. If both projects run simultaneously, they must not both attempt to claim host port 80. This is avoided by the `5000:80` mapping — no issue.

---

### 3. Resource Concerns — PASS

No concerns whatsoever. This is one of the lightest possible deployments:

- **Memory:** nginx:alpine idles at ~2–5MB RSS. No Node.js process at runtime.
- **CPU:** Zero background processing. All compute happens at `pnpm build` time.
- **Disk:** Final image ~25–35MB. Bundle ~200–400KB. Negligible.
- **Network:** No outbound connections at runtime (no real API calls, no WebSocket).

This project adds no meaningful resource pressure to the host.

---

### 4. Database — N/A

No database, no persistence layer, no external data dependencies. All data is in-memory mock TypeScript modules compiled into the bundle at build time. Nothing to provision, migrate, back up, or monitor. Non-issue.

---

### 5. Security — PASS (one recommendation)

**No significant concerns.** Static SPA with mock data is a low-risk deployment profile.

Items verified:
- No API keys, secrets, or credentials in the build (mock data only — confirmed by stack design)
- No `.env` injection at runtime (correct — `VITE_API_URL` explicitly noted as not needed)
- pnpm strict hoisting reduces phantom dependency risk
- nginx:alpine is a minimal, frequently updated base image — keep it pinned to a digest in production
- No server-side execution surface; the entire attack surface is nginx serving static files

**Recommendation (non-blocking):** Add security response headers to the nginx config. Since this is a financial dashboard (even mock), the following headers should be present:

```nginx
add_header X-Frame-Options "DENY";
add_header X-Content-Type-Options "nosniff";
add_header Referrer-Policy "no-referrer";
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'";
```

The `unsafe-inline` allowances are typical for Vite/Tailwind bundles; tighten with nonces in a production-credential deployment.

---

### Summary

| Check | Status | Notes |
|-------|--------|-------|
| Docker containerization | ✅ PASS | Single nginx:alpine, correct multi-stage pattern |
| Port conflicts | ⚠️ CHANGE REQUIRED | Use `5000:80` not `3000:80` |
| Resource usage | ✅ PASS | Negligible — static files only |
| Database | ✅ N/A | No database in scope |
| Security | ✅ PASS | Recommend adding nginx security headers |

**No blockers beyond the port mapping correction.** Once `docker-compose.yml` and the run command are updated to port 5000, this stack is cleared for implementation.
