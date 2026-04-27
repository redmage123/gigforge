# Candlestick Price Chart Component Spec

**Story:** STORY-004
**Author:** UX Designer (retrofit 2026-04-27)
**Date:** 2026-03-22
**Implementation:** `src/components/charts/CandlestickChart.tsx` (247 lines)

---

## Goal

Render OHLCV price history for a chosen asset in a familiar candlestick view
with a timeframe switcher. Used on `/charts` and embedded on the Dashboard.

---

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `asset` | `'BTC'\|'ETH'\|'SOL'\|'ADA'` | YES | — | Initial asset |
| `defaultTimeframe` | `'1D'\|'1W'\|'1M'` | No | `'1W'` | Initial timeframe |
| `height` | number | No | 320 | Chart pixel height |
| `showTimeframeSelector` | boolean | No | `true` | Hide selector for embedded contexts |

The component holds its own internal state for `asset` (when an asset selector
is exposed) and `timeframe` (when the selector is shown).

---

## Visual layout

```
┌────────────────────────────────────────────────────┐
│  BTC / USD               [1D] [1W*] [1M]           │
│ ───────────────────────────────────────────────── │
│   $51,840                                  ╷       │
│                              ╷             │       │
│                   ╷          │       ╷     │       │
│   $48,200    ╷    │     ╷    │   ╷   │     │       │
│              │    │     │    │   │   │     │       │
│   $44,100    │    │     │    │   │   │     │       │
│              ┴    ┴     ┴    ┴   ┴   ┴     ┴       │
│   $40,000  ─────────────────────────────────────  │
│            Mon  Tue  Wed  Thu  Fri  Sat  Sun      │
│                                                    │
│   Volume bars (subdued), 1/4 chart height          │
│   ████  ▆▆▆▆  ████  ▇▇▇▇  ▆▆▆▆  ▅▅▅▅  ▇▇▇▇        │
└────────────────────────────────────────────────────┘
```

- **Up candles** (`close ≥ open`): `var(--color-positive)` (green) for body + wick.
- **Down candles** (`close < open`): `var(--color-negative)` (red).
- **Volume bars:** colored same as the candle, opacity 0.4.
- Y-axis price labels right-aligned, monospace tabular digits.
- X-axis tick labels: short day-of-week for `1W`, day-of-month for `1M`, hour for `1D`.

---

## Implementation notes

- Built on Recharts `ComposedChart` with custom `Bar` rendering for candles
  (high/low rendered as a `ReferenceLine`-style overlay; body as a `Bar` with
  open→close range).
- Volume rendered as a second `Bar` series on a secondary Y-axis (hidden axis).
- Candle width is computed from `chartWidth / candles.length * 0.7`.

---

## Timeframe selector

- Rendered as a 3-button group: `1D | 1W | 1M`.
- Active state: `bg-accent text-white`. Inactive: `bg-bg-elevated text-text-secondary`.
- Click → `setTimeframe(...)` triggers a fresh `usePrices(asset, timeframe)` query.

---

## States

- **Loading:** Recharts is mocked to a placeholder div in tests; in app, a
  `LoadingSkeleton` covers the chart area while `usePrices` is pending.
- **Error:** Renders an `ErrorBanner` instead of the chart.
- **Empty data:** Defensive guard renders `<div>No data</div>` in panel body.

---

## Acceptance criteria

- [x] Renders 30 candles per timeframe (matches `getPrices` mock contract).
- [x] Up/down candles colored per the rules above.
- [x] Timeframe selector switches data via React Query without remounting.
- [x] Y-axis labels use `formatUSD` (no decimals for prices > $100).
- [x] Hover tooltip shows OHLCV values + volume.
- [x] Component is responsive to its container width via `ResponsiveContainer`.
