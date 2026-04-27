# Transaction History Table Spec

**Story:** STORY-006
**Author:** UX Designer (retrofit 2026-04-27)
**Date:** 2026-03-22
**Implementation:** `src/pages/Transactions.tsx` (159 lines), `src/pages/Transactions.test.tsx`

---

## Goal

Sortable, filterable history of every BUY / SELL / DEPOSIT / WITHDRAW transaction
in the user's account. Power-user view — table-first, dense, no per-row visualization.

---

## Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ Transactions                                  [search…]             │
│ [ALL*] [BUY] [SELL] [DEPOSIT] [WITHDRAW]                            │
│                                                                     │
│  Date ▼   │ Type    │ Asset │ Amount  │ Price   │ Total   │ Fee   │
│ ──────────┼─────────┼───────┼─────────┼─────────┼─────────┼────── │
│ 2026-03-22│ [BUY]   │ BTC   │ 0.0250  │ $51,200 │ $1,280  │ $3.20 │
│ 2026-03-21│ [SELL]  │ ETH   │ 1.2000  │ $3,200  │ $3,840  │ $9.60 │
│ 2026-03-20│ [DEPOSIT]│ USD  │ 5,000   │ —       │ $5,000  │ $0    │
│ ...                                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Columns

| Column | Sortable | Format | Alignment |
|--------|----------|--------|-----------|
| Date | YES (default sort, desc) | ISO local date | left |
| Type | NO | `Badge` per type | center |
| Asset | NO | uppercase, monospace | left |
| Amount | NO | up to 4 dp | right, monospace tabular |
| Price | NO | `formatUSD` (or `—` for deposits/withdraws) | right |
| Total | YES | `formatUSD` | right |
| Fee | NO | `formatUSD` (or `—`) | right |

Sort indicator: `▼` for descending (default), `▲` for ascending. Clicking the
header toggles direction; clicking a non-active sortable header switches to
that column with desc as the initial direction.

## Type badge colors

- `BUY` → green (positive)
- `SELL` → red (negative)
- `DEPOSIT` → blue (accent)
- `WITHDRAW` → amber (neutral)

## Filter buttons

`ALL | BUY | SELL | DEPOSIT | WITHDRAW` — same pill pattern as Signals/Alerts.

---

## States

- **Loading:** `LoadingSkeleton rows={10}`.
- **Error:** `ErrorBanner`.
- **Empty:** `EmptyState` with copy "No transactions yet".
- **Filtered to nothing:** `EmptyState` with copy "No `{filter}` transactions" (Sprint 3 polish).

---

## Acceptance criteria

- [x] Default sort is Date descending (most recent first).
- [x] Clicking a sortable header toggles asc/desc; switching column resets to desc.
- [x] Filter buttons hide rows that don't match the type.
- [x] Currency columns rendered through `formatUSD` (2 dp).
- [x] Type badge color matches the rules above.
- [x] Empty state copy distinguishes "never had any" from "current filter shows none".
- [x] Coverage by `Transactions.test.tsx`.
