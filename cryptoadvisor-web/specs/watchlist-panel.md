# Watchlist Panel Spec

**Story:** STORY-007
**Author:** UX Designer (retrofit 2026-04-27)
**Date:** 2026-03-22
**Implementation:** `src/pages/Watchlist.tsx` (137 lines)

---

## Goal

Lightweight tracking surface for assets the user is interested in but does not
hold. Per-row sparkline gives a quick read on recent direction without leaving
the list.

---

## Layout

```
┌────────────────────────────────────────────────────────────────┐
│ Watchlist                                                       │
│ Sort by:  [Price ▼] [24h Change]                                │
│                                                                 │
│  BTC   Bitcoin               $51,840   +3.20%   ╱╲╱╲╱─────╱     │
│  ETH   Ethereum              $3,180    -1.10%   ╲╱╲╱╲╱╲────     │
│  SOL   Solana                $142.20   +5.80%   ╱╱╱╱─╲╱╲╱╱      │
│  ADA   Cardano               $0.4820   -2.40%   ╲╲╲╲╱╲╲╲╲       │
│  AVAX  Avalanche             $38.90    +1.10%   ╱╲─╱╲╱╲╱╱       │
│  LINK  Chainlink             $14.20    +0.40%   ─╱╲╱─╲╱──       │
└────────────────────────────────────────────────────────────────┘
```

Embedded variant on the Dashboard renders the top 5 rows only with no header
controls.

---

## Per-row anatomy

| Region | Content | Style |
|--------|---------|-------|
| Symbol | uppercase ticker (`BTC`) | font-mono, bold, base size, `text-primary` |
| Asset name | full name (`Bitcoin`) | sm size, `text-muted`, truncate |
| Price | `formatUSD` (2 dp ≥ $1, 4 dp < $1) | right, monospace tabular, `text-primary` |
| 24h change | `formatPct` (signed 2 dp) | right, color by sign (green/red) |
| Sparkline | 24-point line, last 24 h | fixed width 80 px, height 28 px |

Sparkline color mirrors the 24 h change sign:
- positive → `var(--color-positive)`
- negative → `var(--color-negative)`

Hover style on the row: `hover:bg-bg-elevated transition-colors rounded-md`.

---

## Sort controls

Two sort keys:
- `currentPrice` — descending (highest price first)
- `changePct24h` — descending (biggest movers first), with negative changes
  ranking last

Direction stored in component state alongside the active key; clicking the
active key toggles direction, switching keys resets to descending.

---

## States

- **Loading:** `LoadingSkeleton rows={6}`.
- **Error:** `ErrorBanner`.
- **Empty:** `EmptyState` ("Watchlist is empty — add an asset to start tracking").

---

## Acceptance criteria

- [x] One row per watchlist item.
- [x] Sparkline always 24 data points, sized 80x28 px.
- [x] Sparkline color matches `changePct24h` sign.
- [x] Currency formatting picks 4 dp for prices < $1, 2 dp otherwise.
- [x] Sort controls cover price + 24 h change with toggle direction.
- [x] Numeric columns right-aligned with tabular monospace digits.
- [x] Hover highlight on rows.
- [x] Embedded Dashboard variant renders top 5 with header controls hidden.
