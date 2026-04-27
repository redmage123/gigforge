# Dashboard Layout Wireframe

**Story:** STORY-002
**Author:** UX Designer (retrofit 2026-04-27)
**Date:** 2026-03-22
**Implementation:** `src/pages/Dashboard.tsx` (280 lines)

---

## Goal

Single-screen overview giving an experienced trader an at-a-glance read on
portfolio health, market signals, and pending actions, with one-click navigation
to deeper screens.

---

## Layout — desktop (≥1024 px)

```
┌──────────────────────────────────────────────────────────────────────┐
│  [Sidebar 240px]  │  [Header 64px — page title + lang/theme]         │
│  Dashboard  ▦     │  ────────────────────────────────────────────────│
│  Portfolio  ◈     │  ┌─────────┬─────────┬─────────┐                 │
│  Charts     📈    │  │ Total   │ 24h     │ Top     │  Stat row (3)   │
│  Signals    ⚡    │  │ Value   │ Change  │ Holding │                 │
│  Alerts     🔔    │  └─────────┴─────────┴─────────┘                 │
│  Transactions ↕   │  ┌─────────────────────┬──────────────────┐      │
│  Watchlist  ★     │  │ Allocation Pie       │ Recent Signals  │      │
│  Risk Calc  ⚖     │  │ (Recharts PieChart)  │ (top 5)         │      │
│                   │  └─────────────────────┴──────────────────┘      │
│  [Lang switch]    │  ┌─────────────────────┬──────────────────┐      │
│                   │  │ Featured Chart       │ Active Alerts   │      │
│                   │  │ (BTC candles 1W)     │ (top 5)         │      │
│                   │  └─────────────────────┴──────────────────┘      │
│                   │  ┌─────────────────────┬──────────────────┐      │
│                   │  │ Recent Transactions  │ Watchlist       │      │
│                   │  │ (last 5 rows)        │ (top 5)         │      │
│                   │  └─────────────────────┴──────────────────┘      │
└──────────────────────────────────────────────────────────────────────┘
```

## Layout — mobile (<1024 px)

- Sidebar collapses behind a hamburger button (rendered in `MobileNav`).
- All grid cells stack to a single column.
- Stat row collapses from `grid-cols-3` to `grid-cols-1` at the `sm:` breakpoint.

---

## Spacing

- Outer page padding: `p-4` mobile, `p-6` desktop (matches `AppLayout.tsx`).
- Inter-row spacing: `space-y-4` (16 px).
- Inter-cell gap inside grids: `gap-4` (16 px).

## Sections

| # | Region | Component | Source rows |
|---|--------|-----------|-------------|
| 1 | Stat row | 3 × `StatCard` | total value, 24h change, top holding |
| 2L | Allocation pie | `AllocationPieChart` | `usePortfolio()` |
| 2R | Recent signals | `Panel` + cards | `useSignals()` top 5 |
| 3L | Featured chart | `CandlestickChart` (BTC 1W) | `usePrices('BTC', '1W')` |
| 3R | Active alerts | `Panel` + cards | `useAlerts()` top 5 |
| 4L | Recent transactions | `Panel` + table | `useTransactions()` top 5 |
| 4R | Watchlist | `Panel` + rows | `useWatchlist()` top 5 |

Each "top 5" panel includes a `Link` to its full page in the panel header
("View all →").

---

## Loading / error / empty states

- While any of the 5 hooks are pending, the corresponding cell shows a
  `LoadingSkeleton` (`StatCardSkeleton` for the stat row; default skeleton elsewhere).
- On error, the cell renders an `ErrorBanner` instead of its content.
- On empty data (e.g. no signals), the panel body is replaced by an
  `EmptyState` with a short copy describing what's missing.

These three states are non-negotiable — no panel may ship with undefined behavior
under fetch failure, empty result, or pending state.

---

## Acceptance criteria

- [x] Renders 5 hooks' data in a 4-row grid layout.
- [x] All cells gracefully handle loading / error / empty states.
- [x] Header reads "Dashboard" via the `PAGE_TITLES` map in `AppLayout.tsx`.
- [x] All currency values rendered through the local `formatUSD` helper (USD, 2dp).
- [x] All percentage deltas rendered through `formatPct` (signed, 2dp).
- [x] All "View all →" links navigate to the right detail route.
- [x] Sidebar entry has the dashboard icon (`▦`) and links to `/`.
