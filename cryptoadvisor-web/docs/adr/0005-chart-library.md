# ADR-0005: Choice of Chart Library
## Status: Accepted
## Date: 2026-03-22

## Context

The dashboard requires four distinct chart types:
1. **Candlestick (OHLCV)** — price chart with volume bars, timeframe selector, tooltip with O/H/L/C
2. **Pie chart** — portfolio allocation by asset
3. **Sparklines** — mini area charts in the watchlist and stat cards
4. **Volume bars** — rendered below the candlestick chart

The client requirements mentioned "Recharts/Chart.js". We needed to choose one library and commit.

## Decision

**Recharts as the primary and only chart library.**

Recharts is built for React — every chart is a React component tree, not an imperative canvas API. This means:
- Full TypeScript support with proper prop types
- SVG output — scales perfectly at any resolution, selectable text, accessible
- Composable: `ComposedChart` layers `Bar`, `Line`, and custom shapes in one SVG
- `ResponsiveContainer` handles resize automatically — no manual `ResizeObserver` code
- `CustomShape` render props allow a bespoke candlestick shape drawn as SVG rectangles/lines

The four chart requirements map to Recharts components:
- Candlestick: `ComposedChart` with a custom `CandlestickBar` shape + `Bar` for volume
- Allocation: `PieChart` + `Pie` + `Cell` (one cell per asset, coloured by index)
- Sparklines: `AreaChart` + `Area` + `ResponsiveContainer` (no axes, minimal config)
- Volume: `Bar` inside the same `ComposedChart` as the candlestick

**Candlestick note:** Recharts has no built-in candlestick type. A custom `CandlestickBar` shape must be implemented as a React component that renders SVG `rect` (body) and `line` (wick) elements. This is ~50 lines of SVG math and is well-documented in the Recharts community. The implementation takes the candle's `open`, `high`, `low`, `close`, `x`, `y`, `width`, `height` props from the chart and renders green/red based on `close > open`.

## Alternatives Considered

**Chart.js + react-chartjs-2**
- Mentioned in client requirements as a fallback
- Canvas-based rendering — good performance for large datasets
- Rejected because: (1) canvas is harder to customise than SVG; (2) custom candlestick shapes in Chart.js require the Financial plugin (`chartjs-chart-financial`) which adds a dependency and is less actively maintained; (3) `react-chartjs-2` is a thin wrapper — it does not feel native to React; (4) testing is harder (canvas does not render in jsdom without a polyfill); (5) Recharts native React model is a better fit for this component-based codebase

**D3.js**
- Maximum flexibility — any chart imaginable
- Rejected because: (1) D3 is an imperative DOM manipulation library; integrating it with React requires careful ref management and `useEffect` lifecycle syncing; (2) this is far more code than Recharts for standard chart types; (3) the sprint budget does not include time to build chart primitives from scratch

**Victory (by FormidableLabs)**
- React-native like Recharts, good TypeScript support
- Rejected because: (1) less adopted than Recharts (fewer community examples, less Stack Overflow coverage); (2) the Recharts ComposedChart + custom shape pattern is well-documented and sufficient; (3) no advantage over Recharts for the specific charts required

**Plotly.js + react-plotly.js**
- Supports candlestick charts natively (`type: 'candlestick'`)
- Rejected because: (1) Plotly.js is a very large library (~3MB minified); (2) the bundle size impact would double the application size; (3) it is designed for scientific/analytical charts and brings significant overhead for a dashboard that only needs 4 chart types; (4) canvas-based rendering has the same testing difficulties as Chart.js

**Tremor**
- React component library built on top of Recharts, pre-styled
- Considered briefly; rejected because: (1) Tremor uses a light-mode-first design language that conflicts with our dark financial aesthetic; (2) it would constrain the design system to Tremor's opinions; (3) using Recharts directly gives us full control over the dark theme colours, tooltip styles, and custom candlestick shapes

## Consequences

- **Positive:** Recharts SVG output renders perfectly at any DPI. Charts look sharp on retina displays with zero extra configuration.
- **Positive:** Custom `CandlestickBar` shape is ~50 lines of SVG — a clear, readable, testable React component.
- **Positive:** Testing is straightforward: mock the Recharts components in `setupTests.ts` (they use SVG/ResizeObserver which jsdom doesn't support) and test component behaviour and data flow independently.
- **Positive:** `ResponsiveContainer` handles window resize — no `useEffect` + `ResizeObserver` boilerplate.
- **Risk:** Custom candlestick shape requires manual SVG math. The engineer must correctly calculate body height (`|close - open|`), body Y position (`min(open, close)`), wick X position (`x + width/2`), etc. A unit test for the `CandlestickBar` rendering with known OHLCV values is mandatory.
- **Note:** All chart colours come from the CSS custom property tokens defined in `specs/design-system.md`. Pass them as explicit hex strings to Recharts (Recharts SVG does not inherit CSS custom properties). Use constants exported from `src/types/index.ts`: `CHART_COLORS = { positive: '#22c55e', negative: '#ef4444', ... }`.
