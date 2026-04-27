# Portfolio Overview Component Spec

**Story:** STORY-003
**Author:** UX Designer (retrofit 2026-04-27)
**Date:** 2026-03-22
**Implementation:** `src/pages/Portfolio.tsx` (128 lines), `src/components/charts/AllocationPieChart.tsx` (116 lines)

---

## Goal

Detail page showing every position in the user's portfolio with PnL, allocation,
and a per-position sparkline. Composes the same `AllocationPieChart` used on the
Dashboard so the visual identity carries across screens.

---

## Layout

```
┌────────────────────────────────────────────────────┐
│  Holdings (Panel)                                  │
│  ┌────────────────────────────────────────────┐    │
│  │ Asset │ Sym │ Amount │ Avg │ Now │ Value │    │
│  │       │     │        │ Buy │     │ PnL   │    │
│  ├───────┼─────┼────────┼─────┼─────┼───────┤    │
│  │ Bitcoin│ BTC │ 0.50  │ $42k│ $51k│ +$4500│    │
│  │ Ethereum│ETH │ 4.20  │ $2.8k│ $3.2k│ +$1680│  │
│  │ ...    │     │        │     │     │       │    │
│  └────────────────────────────────────────────┘    │
│                                                    │
│  Total PnL (footer)                                │
└────────────────────────────────────────────────────┘
```

The page can be combined with `AllocationPieChart` from the Dashboard but the
detail view is table-first so power users can scan rows.

---

## Holdings table

| Column | Type | Format | Alignment |
|--------|------|--------|-----------|
| Asset name | text | as-is | left |
| Symbol | text | uppercase, monospace | left |
| Amount | number | up to 4 decimals | right, monospace tabular |
| Avg buy price | currency | `formatUSD` | right, monospace tabular |
| Current price | currency | `formatUSD` | right, monospace tabular |
| Value | currency | `formatUSD` | right, monospace tabular |
| Allocation % | percent | `pct.toFixed(1)%` | right |
| PnL absolute | currency | `formatUSD`, signed | right, color by sign |
| PnL % | percent | `formatPct` | right, color by sign |

**Color rules for PnL columns:**
- `pnl >= 0` → `text-positive` (green)
- `pnl < 0`  → `text-negative` (red)

---

## Allocation Pie Chart

`AllocationPieChart` props: `holdings: Holding[]`.

- Built on Recharts `PieChart` + `Pie` + `Cell`.
- Slice colors come from `CHART_COLORS` (8-color palette in `src/types/index.ts`),
  cycled by index — every asset always renders with the same color across views
  (deterministic by position in the holdings array).
- `<text>` label slot in the chart center shows total portfolio value.
- Tooltips on hover show `{symbol}: {pct}%`.

---

## States

- **Loading:** 8-row `LoadingSkeleton`.
- **Error:** `ErrorBanner` (no other content rendered).
- **Empty:** No empty case in current implementation — portfolio is always seeded.
  If a real backend ever returns an empty portfolio, fall back to `EmptyState`
  with copy "No holdings — add your first position to get started".

---

## Acceptance criteria

- [x] Renders one row per holding.
- [x] Total PnL shown in panel footer, color-coded by sign.
- [x] Currency values use `formatUSD` (2 dp) and percentages use `formatPct` (2 dp signed).
- [x] Numeric columns are right-aligned with tabular monospace digits.
- [x] PnL color-coding: green for ≥0, red for <0.
- [x] `AllocationPieChart` is reusable from the Dashboard.
- [x] Chart slice colors deterministic across screens.
