# CryptoAdvisor Web Dashboard

A dark-themed, data-rich cryptocurrency portfolio dashboard built as a React 19 SPA. This is a **demo project** — all data is served from a typed in-memory mock layer. No API keys required. Runs completely offline.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript 5 (strict) |
| Build | Vite 5 |
| Styling | Tailwind CSS 4 (dark theme only) |
| Charts | Recharts 2 |
| Data fetching | TanStack Query v5 |
| Routing | React Router v7 |
| Testing | Vitest 2 + Testing Library |
| Container | Docker (nginx:alpine) |

## Prerequisites

- Node.js 22+
- pnpm (or npm)
- Docker (for containerised deployment)

## Getting Started

### Install dependencies

```bash
npm install
# or
pnpm install
```

### Run development server (port 5173)

```bash
npm run dev
# or
pnpm dev
```

Open http://localhost:5173

### Run tests

```bash
npm run test:run
# or
pnpm test:run
```

### Run tests with coverage

```bash
npm run test:coverage
# or
pnpm test:coverage
```

### Build for production

```bash
npm run build
# or
pnpm build
```

## Docker

### Build the image

```bash
docker build -t cryptoadvisor-web .
```

### Run the container (port 5000)

```bash
docker run -p 5000:80 cryptoadvisor-web
```

Open http://localhost:5000

### Docker Compose (single command)

```bash
docker compose up --build
```

Open http://localhost:5000

## Pages & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Dashboard | Overview grid: stats, pie chart, candlestick, signals, watchlist, alerts, recent transactions |
| `/portfolio` | Portfolio | Holdings table with P&L, allocation pie chart |
| `/charts` | Charts | Full-screen candlestick OHLCV chart with asset/timeframe selectors |
| `/signals` | Signals | AI trading signals with confidence bars and direction filters |
| `/alerts` | Alerts | Price alerts with Active/Triggered filter tabs |
| `/transactions` | Transactions | Sortable 20-row transaction history table |
| `/watchlist` | Watchlist | Watched assets with large sparklines and sort controls |

## Demo / Mock Data

This app runs 100% offline with no external dependencies at runtime. All data is served from `src/api/mock/`:

- **Portfolio** — 5 holdings (BTC, ETH, SOL, ADA, USD cash), total ~$124k
- **Prices** — 30 OHLCV candles for BTC/ETH/SOL/ADA × 1D/1W/1M (deterministic)
- **Signals** — 8 AI signals with BUY/SELL/HOLD directions
- **Alerts** — 6 price alerts (mix of active and triggered)
- **Transactions** — 20 historical transactions
- **Watchlist** — 6 assets with sparkline data

All mock functions include a 150ms simulated latency to demonstrate loading skeleton states.

## Project Structure

```
src/
├── api/
│   ├── index.ts          # Public API surface (re-exports all mock services)
│   └── mock/             # In-memory mock data modules
├── components/
│   ├── charts/           # Recharts chart components (Candlestick, Pie, Sparkline)
│   ├── layout/           # AppLayout, Sidebar, Header
│   └── ui/               # Panel, Badge, StatCard, LoadingSkeleton, EmptyState, ErrorBanner
├── hooks/                # TanStack Query hooks (usePortfolio, usePrices, etc.)
├── pages/                # Page components (Dashboard, Portfolio, Charts, etc.)
├── types/
│   └── index.ts          # Shared TypeScript interfaces + CHART_COLORS constants
├── App.tsx               # Route definitions
├── main.tsx              # App entry point (QueryClient, BrowserRouter, dark class)
└── index.css             # CSS custom property design tokens + Tailwind import
```
