# DESIGN.md — CryptoAdvisor Web Dashboard
**Version:** 3.0
**Date:** 2026-03-23
**Author:** gigforge-ux-designer
**Status:** Ready for implementation
**Aligned with:** SOFTWARE_SPEC.md · TECH_STACK.md · ADR-0003 · ADR-0005 · ADR-0006

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Color Palette](#2-color-palette)
3. [Typography](#3-typography)
4. [Spacing & Sizing Scale](#4-spacing--sizing-scale)
5. [Layout Wireframes — Each Page](#5-layout-wireframes--each-page)
6. [Component Hierarchy](#6-component-hierarchy)
7. [Responsive Breakpoints](#7-responsive-breakpoints)
8. [Interaction Patterns](#8-interaction-patterns)
9. [Accessibility Requirements](#9-accessibility-requirements)
10. [Appendix A: Token Quick Reference](#appendix-a-design-token-quick-reference)
11. [Appendix B: Component Checklist](#appendix-b-component-implementation-checklist)

---

## 1. Design Principles

**Financial terminal aesthetic.** The app should feel like a Bloomberg terminal or TradingView — dark, data-dense, information-forward. Every pixel earns its place.

**No flash of white.** The `dark` class is set on `<html>` before the first paint (in `src/main.tsx`). No light background ever appears — not during load, not during route transitions.

**Progressive disclosure.** The Dashboard shows summaries. Dedicated pages show detail. Never overwhelm; always provide the drill-down path.

**Numbers are sacred.** All financial values use `font-mono` and `tabular-nums`. Columns align. Decimals line up. Positive values are green with a `+` prefix. Negative values are red with a `−` prefix. Both the prefix AND the colour must be present — never rely on colour alone.

**Skeletons over spinners.** Every panel renders a shape-matched skeleton during its 150ms fetch. The layout never jumps. Content appears in the exact space the skeleton occupied.

**Tokens, always.** No hardcoded hex values in component files. All colours reference CSS custom property tokens via Tailwind utility classes.

---

## 2. Color Palette

### 2.1 CSS Custom Property Tokens

Defined in `src/index.css` under `:root`. These are the single source of truth. Tailwind config, inline chart styles, and all component markup reference these tokens — never raw hex values.

```css
/* src/index.css */
@import 'tailwindcss';

:root {
  /* Backgrounds — layered depth model: base < surface < elevated */
  --color-bg-base:       #0b0e11;    /* Main page background — near black       */
  --color-bg-surface:    #131722;    /* Card / panel background                  */
  --color-bg-elevated:   #1c2030;    /* Dropdown, tooltip, modal, skeleton fill  */
  --color-bg-border:     #2a2e39;    /* Default border / divider colour          */

  /* Text hierarchy */
  --color-text-primary:  #e2e8f0;    /* Headings, primary content                */
  --color-text-secondary:#94a3b8;    /* Labels, subtitles, axis tick text        */
  --color-text-muted:    #475569;    /* Disabled, placeholder text               */

  /* Brand accent */
  --color-accent:        #3b82f6;    /* Interactive elements, active states      */
  --color-accent-hover:  #2563eb;    /* Hover state for accent elements          */

  /* Financial signal colours — semantic use only */
  --color-positive:      #22c55e;    /* Gains, BUY, ACTIVE, completed            */
  --color-positive-bg:   #14532d2a; /* Subtle tinted background for gains        */
  --color-negative:      #ef4444;    /* Losses, SELL, TRIGGERED, failed          */
  --color-negative-bg:   #7f1d1d2a; /* Subtle tinted background for losses       */
  --color-neutral:       #f59e0b;    /* HOLD signals, pending status, warnings   */
  --color-neutral-bg:    #78350f2a; /* Subtle tinted background for neutral      */
}
```

### 2.2 Tailwind Config Extensions

`tailwind.config.ts` exposes these as utility classes:

```typescript
export default {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base:     'var(--color-bg-base)',
          surface:  'var(--color-bg-surface)',
          elevated: 'var(--color-bg-elevated)',
          border:   'var(--color-bg-border)',
        },
        text: {
          primary:   'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted:     'var(--color-text-muted)',
        },
        accent:   'var(--color-accent)',
        positive: 'var(--color-positive)',
        negative: 'var(--color-negative)',
        neutral:  'var(--color-neutral)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
}
```

### 2.3 Chart Color Constants

Recharts renders SVG — SVG elements do not inherit CSS custom properties. All chart fill and stroke values must be explicit hex strings passed as props. Export from `src/types/index.ts`:

```typescript
export const CHART_COLORS = {
  positive:   '#22c55e',  // Up candles, positive area fill
  negative:   '#ef4444',  // Down candles
  neutral:    '#f59e0b',  // HOLD signals, neutral elements
  accent:     '#3b82f6',  // Accent lines, selected asset sparkline
  grid:       '#2a2e39',  // Chart grid lines, axis lines
  text:       '#94a3b8',  // Axis labels and tick text
  tooltip_bg: '#1c2030',  // Tooltip background fill
  pie: [
    '#3b82f6',  // blue    — BTC
    '#8b5cf6',  // purple  — ETH
    '#10b981',  // emerald — SOL
    '#f59e0b',  // amber   — ADA
    '#ec4899',  // pink    — 5th holding
    '#06b6d4',  // cyan    — 6th holding
  ],
} as const
```

### 2.4 Color Usage Rules

| Context | Class | Hex |
|---------|-------|-----|
| Page background | `bg-bg-base` | `#0b0e11` |
| Panel / card background | `bg-bg-surface` | `#131722` |
| Dropdown / tooltip / skeleton | `bg-bg-elevated` | `#1c2030` |
| Border / divider | `border-bg-border` | `#2a2e39` |
| Primary text | `text-text-primary` | `#e2e8f0` |
| Secondary text (labels, timestamps) | `text-text-secondary` | `#94a3b8` |
| Muted text (placeholders) | `text-text-muted` | `#475569` |
| Active nav, focus ring | `bg-accent` / `ring-accent` | `#3b82f6` |
| Positive / gain / BUY | `text-positive` | `#22c55e` |
| Negative / loss / SELL | `text-negative` | `#ef4444` |
| Neutral / HOLD / pending | `text-neutral` | `#f59e0b` |
| Hover state (rows, items) | `hover:bg-bg-elevated` | `#1c2030` |
| Skeleton pulse fill | `bg-bg-elevated animate-pulse` | `#1c2030` |
| Focus ring | `focus-visible:ring-2 ring-accent ring-offset-2 ring-offset-bg-base` | — |

---

## 3. Typography

### 3.1 Font Stack

**Sans-serif (all UI text):** Inter → `ui-sans-serif` → `system-ui` → `sans-serif`

Load Inter via Google Fonts in `index.html` (weights 400, 500, 600, 700). Apply to `body` in `src/index.css`:

```css
body {
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  background-color: var(--color-bg-base);
  color: var(--color-text-primary);
  -webkit-font-smoothing: antialiased;
}
```

**Monospace (all financial numbers):** `font-mono tabular-nums`

This is mandatory on every price, P&L value, percentage, volume, and amount. `tabular-nums` ensures figures take equal horizontal space so columns align. This is a financial UX requirement, not optional.

### 3.2 Type Scale

| Role | Tailwind classes | Size / Weight | Usage |
|------|-----------------|---------------|-------|
| Page title (header bar) | `text-xl font-semibold text-text-primary` | 20px / 600 | Header bar current page name |
| Panel heading | `text-xs font-semibold uppercase tracking-wider text-text-secondary` | 12px / 600 | Panel header label |
| Stat card value | `text-3xl font-bold font-mono tabular-nums text-text-primary` | 30px / 700 | Portfolio value, P&L dollar |
| Stat card label | `text-xs text-text-secondary uppercase tracking-wide` | 12px / 400 | "TOTAL VALUE", "24H CHANGE" |
| Table header | `text-xs font-semibold text-text-secondary uppercase tracking-wider` | 12px / 600 | Column headers |
| Table cell — text | `text-sm text-text-primary` | 14px / 400 | Asset name, strings |
| Table cell — number | `text-sm font-mono tabular-nums` | 14px / 400 | Prices, amounts |
| Badge label | `text-xs font-semibold` | 12px / 600 | BUY / SELL / HOLD / ACTIVE |
| Signal reason | `text-xs text-text-secondary` | 12px / 400 | Signal description |
| Nav item | `text-sm font-medium` | 14px / 500 | Sidebar links |
| Relative timestamp | `text-xs text-text-muted` | 12px / 400 | "2h ago", "15m ago" |
| Empty state heading | `text-base font-semibold text-text-secondary` | 16px / 600 | "No data yet" |
| Empty state body | `text-sm text-text-muted` | 14px / 400 | Supporting description |
| Error message | `text-sm text-negative` | 14px / 400 | Error banner text |

### 3.3 Number Formatting Conventions

| Value type | Format string | Example |
|-----------|--------------|---------|
| USD value | `$X,XXX.XX` | `$43,218.50` |
| USD gain | `+$X,XXX.XX` (green) | `+$1,234.56` |
| USD loss | `−$X,XXX.XX` (red) | `−$234.00` |
| Percentage gain | `+X.XX%` (green) | `+2.87%` |
| Percentage loss | `−X.XX%` (red) | `−1.43%` |
| Large portfolio value | `$XXX,XXX.XX` | `$124,893.20` |
| Volume | `X,XXX,XXX` (integer) | `32,847,200` |
| Date (table) | `YYYY-MM-DD HH:MM` | `2026-03-15 14:32` |
| Relative time | `Xm ago` / `Xh ago` / `Xd ago` | `15m ago` |
| Crypto amount | `X.XXXX` (4dp) | `0.2150` |
| Confidence % | `XX%` (integer) | `87%` |

---

## 4. Spacing & Sizing Scale

Tailwind's default scale (multiples of 4px). These are the prescribed values — use them consistently.

| Element | Value | Class |
|---------|-------|-------|
| Page outer padding (desktop) | 24px | `p-6` |
| Page outer padding (mobile) | 16px | `p-4` |
| Panel internal padding | 20px | `p-5` |
| Panel gap in grid | 16px | `gap-4` |
| Stat card min-height | 120px | `min-h-[120px]` |
| Table row height | 48px | `h-12` |
| Sidebar width (expanded, desktop) | 240px | `w-60` |
| Sidebar width (icon rail, tablet) | 64px | `w-16` |
| Header bar height | 64px | `h-16` |
| Candlestick chart height (desktop / Charts page) | 500px | `h-[500px]` |
| Candlestick chart height (desktop / Dashboard panel) | 400px | `h-[400px]` |
| Candlestick chart height (mobile) | 280px | `h-[280px]` |
| Sparkline height (watchlist panel, stat card) | 40px | `h-10` |
| Sparkline height (watchlist page rows) | 80px | `h-20` |
| Badge padding | 4px 8px | `px-2 py-1` |
| Panel border radius | 8px | `rounded-lg` |
| Badge border radius | 4px | `rounded` |
| Min touch target | 44px × 44px | `min-h-[44px] min-w-[44px]` |
| Nav icon size | 20px | `w-5 h-5` |
| User avatar diameter | 36px | `w-9 h-9` |

---

## 5. Layout Wireframes — Each Page

### 5.1 Application Shell (Persistent Across All Pages)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────────────────────────────────┐  │
│  │ SIDEBAR (240px)  │  │ HEADER (sticky top-0, full content width)    │  │
│  │ bg-bg-surface    │  │ [Page Title]    [Search…]    [● Demo User]   │  │
│  │ border-r         │  ├──────────────────────────────────────────────┤  │
│  │                  │  │ PAGE CONTENT AREA (scrollable, pt-16)        │  │
│  │ ┌──────────────┐ │  │                                              │  │
│  │ │ 🔷 CryptoAdv │ │  │  (route-specific content renders here)       │  │
│  │ └──────────────┘ │  │                                              │  │
│  │                  │  │                                              │  │
│  │ ○ Dashboard      │  │                                              │  │
│  │ ○ Portfolio      │  │                                              │  │
│  │ ● Charts ←active │  │                                              │  │
│  │ ○ Signals        │  │                                              │  │
│  │ ○ Alerts         │  │                                              │  │
│  │ ○ Transactions   │  │                                              │  │
│  │ ○ Watchlist      │  │                                              │  │
│  │                  │  │                                              │  │
│  └──────────────────┘  └──────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

**`AppLayout.tsx` structure:**
```tsx
<div className="flex h-screen overflow-hidden bg-bg-base">
  <Sidebar />                             {/* fixed left column */}
  <div className="flex-1 flex flex-col overflow-hidden ml-60 xl:ml-60 md:ml-16">
    <Header />                            {/* sticky top-0 h-16 z-10 */}
    <main className="flex-1 overflow-y-auto p-6 pt-4">
      <Outlet />
    </main>
  </div>
</div>
```

**Sidebar anatomy:**
- Logo block: 64px tall, `bg-bg-base border-b border-bg-border`, logo icon + "CryptoAdvisor" text
- Nav items: `<NavLink>` from React Router — applies active class automatically
  - Inactive: `flex items-center gap-3 px-4 py-3 rounded-lg mx-2 text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors`
  - Active: same + `bg-bg-elevated text-text-primary border-l-2 border-accent -ml-px pl-[15px]`

**Header anatomy:**
- `<header className="h-16 bg-bg-surface border-b border-bg-border flex items-center px-6 gap-4 sticky top-0 z-10">`
- Mobile only: `<HamburgerButton>` (hidden on md+)
- Page title: `<h1 className="text-xl font-semibold text-text-primary flex-1 md:flex-none">` — reads from route context
- Search: `<input type="search" placeholder="Search assets…" className="hidden md:block w-64 xl:w-80 bg-bg-elevated border border-bg-border rounded-lg px-4 h-9 text-sm text-text-secondary placeholder:text-text-muted">` — non-functional
- Avatar: `<div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-white text-sm font-semibold ml-auto">DU</div>` + `<span className="text-sm text-text-secondary hidden md:block">Demo User</span>`

**Panel anatomy (all data panels share this wrapper):**
```tsx
// Panel.tsx
<section aria-label={title} className="bg-bg-surface border border-bg-border rounded-lg overflow-hidden">
  <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-bg-border">
    <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{title}</h2>
    {action && <div>{action}</div>}
  </div>
  <div className="p-5">{children}</div>
</section>
```

---

### 5.2 Dashboard Page (`/`)

```
┌──────────────────────────────────────────────────────────────────────┐
│ STAT CARDS ROW — 3 equal columns                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │ TOTAL VALUE     │  │ 24H CHANGE ($)  │  │ 24H CHANGE (%)  │      │
│  │ $124,893.20     │  │ +$1,234.56      │  │ +2.87%          │      │
│  │ ▁▂▃▄▅▃▄▅▆▇▅▆   │  │ ▁▂▃▄▅▃▄▅▆▇▅▆   │  │ ▁▂▃▄▅▃▄▅▆▇▅▆   │      │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘      │
│                                                                      │
│ ┌─────────────────────────────────────┐ ┌──────────────────────────┐ │
│ │ PRICE CHART [BTC▾] [1D][1W][1M]     │ │ ALLOCATION               │ │
│ │                                     │ │ ┌──────────────────────┐ │ │
│ │  [OHLCV candlestick — 400px tall]   │ │ │  [donut pie chart]   │ │ │
│ │  green=up  red=down  wicks          │ │ │  total value centre  │ │ │
│ │                                     │ │ └──────────────────────┘ │ │
│ │  [volume bars — secondary axis]     │ │  [legend: BTC ETH SOL…] │ │ │
│ └─────────────────────────────────────┘ └──────────────────────────┘ │
│                                                                      │
│ ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │
│ │ AI SIGNALS       │  │ ALERTS           │  │ WATCHLIST            │ │
│ │ [signal card]    │  │ [alert card]     │  │ [asset row + spark]  │ │
│ │ [signal card]    │  │ [alert card]     │  │ [asset row + spark]  │ │
│ │ [signal card]    │  │ [alert card]     │  │ [asset row + spark]  │ │
│ │ …(max 5)         │  │ …(max 5)         │  │ …(all 6)             │ │
│ └──────────────────┘  └──────────────────┘  └──────────────────────┘ │
│                                                                      │
│ ┌──────────────────────────────────────────────── → View All ──────┐ │
│ │ RECENT TRANSACTIONS (5 rows — condensed)                         │ │
│ │  Date        Asset  Type   Total      Status                     │ │
│ │  2026-03-15  BTC    [BUY]  $6,630.00  [✓ completed]             │ │
│ └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

**Dashboard CSS grid (implement in `Dashboard.tsx`):**

```css
/* Desktop ≥1280px */
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-areas:
    "stats    stats    stats"
    "candle   candle   pie"
    "signals  alerts   watchlist"
    "txstrip  txstrip  txstrip";
  gap: 1rem;
}

/* Tablet 768–1279px */
@media (max-width: 1279px) {
  .dashboard-grid {
    grid-template-columns: repeat(2, 1fr);
    grid-template-areas:
      "stats     stats"
      "candle    candle"
      "pie       pie"
      "signals   alerts"
      "watchlist watchlist"
      "txstrip   txstrip";
  }
}

/* Mobile <768px */
@media (max-width: 767px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
    grid-template-areas:
      "stats" "candle" "pie"
      "signals" "alerts" "watchlist" "txstrip";
  }
}
```

Or use Tailwind responsive grid classes: `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4`.

Panel areas in JSX:
```tsx
<div className="[grid-area:stats]"><StatCardsRow /></div>
<div className="[grid-area:candle] md:col-span-2 xl:col-span-2"><PriceChartPanel /></div>
<div className="[grid-area:pie]"><AllocationPanel /></div>
<div className="[grid-area:signals]"><SignalsPanel /></div>
<div className="[grid-area:alerts]"><AlertsPanel /></div>
<div className="[grid-area:watchlist]"><WatchlistPanel /></div>
<div className="[grid-area:txstrip] md:col-span-2 xl:col-span-3"><TransactionStrip /></div>
```

---

### 5.3 Portfolio Page (`/portfolio`)

```
┌──────────────────────────────────────────────────────────────────────┐
│ PAGE TITLE: Portfolio                                                │
│                                                                      │
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│ │ TOTAL VALUE     │  │ TOTAL P&L ($)   │  │ TOTAL P&L (%)   │      │
│ │ $124,893.20     │  │ +$8,243.10      │  │ +7.07%          │      │
│ └─────────────────┘  └─────────────────┘  └─────────────────┘      │
│                                                                      │
│ ┌──────────────────────────────────────┐  ┌────────────────────────┐│
│ │ HOLDINGS TABLE                       │  │ ALLOCATION PIE         ││
│ │                                      │  │ [donut chart]          ││
│ │ Asset   Sym  Amt    AvgBuy  CurPrice  │  │ [same component as     ││
│ │         Val($)  P&L($)   P&L(%)      │  │  Dashboard panel]      ││
│ │ ──────  ───  ─────  ──────  ────────  │  │                        ││
│ │ Bitcoin BTC  1.215  38,500  44,200    │  │ [legend]               ││
│ │              53,703  +6,903  +17.9%  │  │                        ││
│ │ ──────  ───  ─────  ──────  ────────  │  │                        ││
│ │ Etherem ETH  8.50   2,400   3,142    │  │                        ││
│ │ ──────  ───  ─────  ──────  ────────  │  │                        ││
│ │ TOTAL                       $XX,XXX   │  │                        ││
│ │                             +$X,XXX   │  │                        ││
│ └──────────────────────────────────────┘  └────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

**Holdings table columns (8 columns):**

| # | Header | Width | Align | Format |
|---|--------|-------|-------|--------|
| 1 | Asset | 140px | Left | Full name: "Bitcoin" |
| 2 | Symbol | 72px | Left | `text-xs bg-bg-elevated px-2 py-0.5 rounded font-mono` |
| 3 | Amount | 96px | Right mono | `X.XXXX` |
| 4 | Avg Buy | 110px | Right mono | `$X,XXX.XX` |
| 5 | Current Price | 120px | Right mono | `$X,XXX.XX` |
| 6 | Current Value | 120px | Right mono | `$X,XXX.XX` |
| 7 | P&L ($) | 110px | Right mono | `+$X,XXX.XX` green or `−$X,XXX.XX` red |
| 8 | P&L (%) | 90px | Right mono | `+X.XX%` green or `−X.XX%` red |

**Summary row:** spans Asset column with text "TOTAL", `font-semibold`, `bg-bg-elevated/50`, Value and P&L columns populated, others blank.

**Grid:** Desktop `grid grid-cols-5 gap-4` — holdings spans `col-span-3`, pie `col-span-2`. Tablet/Mobile: `grid-cols-1`.

---

### 5.4 Charts Page (`/charts`)

```
┌──────────────────────────────────────────────────────────────────────┐
│ PAGE TITLE: Charts                                                   │
│                                                                      │
│ ┌────────────────────────────────────────────────────────────────┐   │
│ │ PRICE CHART PANEL                                              │   │
│ │                                                                │   │
│ │  Asset:  [BTC] [ETH] [SOL] [ADA]        [1D] [1W] [1M]        │   │
│ │                                                                │   │
│ │  ┌──────────────────────────────────────────────────────────┐  │   │
│ │  │                                                          │  │   │
│ │  │   [OHLCV candlestick chart — 500px tall on desktop]      │  │   │
│ │  │   Y-axis: price (left)                                   │  │   │
│ │  │   X-axis: dates/times                                    │  │   │
│ │  │   Grid lines: #2a2e39                                    │  │   │
│ │  │   Up candles: #22c55e body + wick                        │  │   │
│ │  │   Down candles: #ef4444 body + wick                      │  │   │
│ │  │                                                          │  │   │
│ │  │   ──────────────────────────────── (axis separator)      │  │   │
│ │  │   [Volume bar chart — ~80px]                             │  │   │
│ │  └──────────────────────────────────────────────────────────┘  │   │
│ └────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

**Asset selector — button group:**
```tsx
// Each: min-h-[44px] px-4 rounded text-sm font-medium transition-colors
// Active: bg-accent text-white
// Inactive: bg-bg-elevated text-text-secondary hover:text-text-primary hover:bg-bg-border
<div className="flex gap-2 flex-wrap">
  {['BTC','ETH','SOL','ADA'].map(a => (
    <button
      key={a}
      onClick={() => setAsset(a)}
      className={asset === a
        ? 'px-4 min-h-[44px] rounded text-sm font-medium bg-accent text-white'
        : 'px-4 min-h-[44px] rounded text-sm font-medium bg-bg-elevated text-text-secondary hover:text-text-primary'}
    >
      {a}
    </button>
  ))}
</div>
```

---

### 5.5 Signals Page (`/signals`)

```
┌──────────────────────────────────────────────────────────────────────┐
│ PAGE TITLE: AI Signals                                               │
│                                                                      │
│  [All (12)] [BUY (5)] [SELL (4)] [HOLD (3)]                         │
│  └─ role="tablist" ─┘                                               │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  [BTC]  [● BUY]                              2h ago      │  │  │
│  │  │  Confidence  [████████████████░░░░░]  87%               │  │  │
│  │  │  Strong upward momentum. RSI shows oversold condition.   │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  [ETH]  [● SELL]                             4h ago      │  │  │
│  │  │  Confidence  [████████████░░░░░░░░░░]  62%               │  │  │
│  │  │  Bearish divergence on 4H chart. Consider reducing.      │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │  [more cards…]                                                  │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

**Signal card markup pattern:**
```tsx
<article className="bg-bg-surface border border-bg-border rounded-lg p-4 mb-3">
  <div className="flex items-center justify-between mb-2">
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-text-secondary bg-bg-elevated px-2 py-1 rounded">
        {signal.asset}
      </span>
      <Badge variant={signal.direction.toLowerCase() as BadgeVariant} />
    </div>
    <span className="text-xs text-text-muted">{relativeTime(signal.timestamp)}</span>
  </div>
  <div className="flex items-center gap-3 mb-2">
    <span className="text-xs text-text-secondary w-24 shrink-0">Confidence</span>
    <div className="flex-1 bg-bg-border rounded-full h-1.5">
      <div
        className="h-1.5 rounded-full bg-accent"
        style={{ width: `${signal.confidence}%` }}
      />
    </div>
    <span className="text-xs font-mono tabular-nums text-text-primary w-8 text-right">
      {signal.confidence}%
    </span>
  </div>
  <p className="text-xs text-text-secondary">{signal.reason}</p>
</article>
```

**Filter tab with count badge:**
```tsx
// role="tab" aria-selected={active}
<button
  role="tab"
  aria-selected={filter === 'BUY'}
  className={`min-h-[44px] px-4 rounded text-sm font-medium flex items-center gap-2 ${
    filter === 'BUY'
      ? 'bg-accent text-white'
      : 'bg-bg-elevated text-text-secondary hover:text-text-primary'
  }`}
>
  BUY
  <span className={`text-xs rounded-full px-1.5 py-0.5 ${
    filter === 'BUY' ? 'bg-white/20' : 'bg-bg-border text-text-muted'
  }`}>
    {counts.BUY}
  </span>
</button>
```

Layout: cards in a single column, `max-w-3xl mx-auto`.

---

### 5.6 Alerts Page (`/alerts`)

```
┌──────────────────────────────────────────────────────────────────────┐
│ PAGE TITLE: Alerts                                                   │
│                                                                      │
│  [All (8)] [Active (5)] [Triggered (3)]                              │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  ETH                                    [● ACTIVE]       │  │  │
│  │  │  Price above $4,000.00                                   │  │  │
│  │  │  ─────────────────────────────────────────────────────   │  │  │
│  │  │  Current: $3,142.50          Threshold: $4,000.00        │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  BTC                                    [⚡ TRIGGERED]    │  │  │
│  │  │  Price below $45,000.00                                  │  │  │
│  │  │  ─────────────────────────────────────────────────────   │  │  │
│  │  │  Current: $44,218.50         Threshold: $45,000.00       │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

**Alert card styling:**
- Active: `bg-bg-surface border border-bg-border rounded-lg p-4 mb-3`
- Triggered: `bg-bg-surface border border-negative/30 rounded-lg p-4 mb-3 opacity-80`

**Status badge variants:**
- `ACTIVE`: `bg-positive-bg text-positive border border-positive/30` + filled circle icon
- `TRIGGERED`: `bg-negative-bg text-negative border border-negative/30` + bolt icon

Condition label format:
- `above`: `"Price above $X,XXX.XX"`
- `below`: `"Price below $X,XXX.XX"`

---

### 5.7 Transactions Page (`/transactions`)

```
┌──────────────────────────────────────────────────────────────────────┐
│ PAGE TITLE: Transactions                                             │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ overflow-x-auto (mobile scroll wrapper)                      │   │
│  │ ┌──────────────────────────────────────────────────────────┐ │   │
│  │ │ min-w-[700px]                                            │ │   │
│  │ │                                                          │ │   │
│  │ │  Date ↑    Asset    Type    Amount   Price    Total  Stat │ │   │
│  │ │  ──────── ──────── ──────  ──────── ──────── ──────  ──── │ │   │
│  │ │  03-15 14 BTC      [BUY]   0.1500   $44,200  $6,630  [✓] │ │   │
│  │ │  03-14 09 ETH      [SELL]  2.0000   $3,100   $6,200  [✓] │ │   │
│  │ │  03-12 16 SOL      [BUY]   15.000   $142.50  $2,137  [✓] │ │   │
│  │ │  ... (20 rows total)                                     │ │   │
│  │ └──────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

**Table structure:**
```tsx
<div className="overflow-x-auto">
  <table className="min-w-[700px] w-full text-sm border-collapse">
    <thead className="bg-bg-elevated">
      <tr>
        {columns.map(col => (
          <th
            key={col.key}
            role="columnheader"
            aria-sort={sortState.column === col.key ? sortState.direction : 'none'}
            className="px-4 h-12 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:text-text-primary select-none"
            onClick={() => handleSort(col.key)}
          >
            <span className="flex items-center gap-1">
              {col.label}
              <SortIcon column={col.key} sort={sortState} />
            </span>
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {sortedTransactions.map((tx, i) => (
        <tr
          key={tx.id}
          className={i % 2 === 0 ? 'bg-bg-surface' : 'bg-bg-elevated/30'}
        >
          ...
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

**Column widths and alignment:**

| Column | Min-width | Text align | Format |
|--------|-----------|-----------|--------|
| Date | 140px | Left | `font-mono text-sm` `YYYY-MM-DD HH:MM` |
| Asset | 80px | Left | Asset name string |
| Type | 72px | Center | `<Badge variant="buy/sell">` |
| Amount | 96px | Right mono | `X.XXXX` |
| Price | 110px | Right mono | `$X,XXX.XX` |
| Total | 120px | Right mono | `$X,XXX.XX` |
| Status | 96px | Center | `<Badge variant="completed/pending/failed">` |

**Alternating rows:** even rows `bg-bg-surface`, odd rows `bg-bg-elevated/30`. Row hover: `hover:bg-bg-elevated/60`.

---

### 5.8 Watchlist Page (`/watchlist`)

```
┌──────────────────────────────────────────────────────────────────────┐
│ PAGE TITLE: Watchlist                                                │
│                                                                      │
│  Sort: [Price ↓] [24h Change ↓]                                      │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  Bitcoin (BTC)         $44,218.50     +$1,270  +2.87%    │  │  │
│  │  │  [sparkline — 80px tall, full width, area chart]         │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  Ethereum (ETH)        $3,142.50      −$89.10  −2.76%    │  │  │
│  │  │  [sparkline — 80px tall]                                 │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │  [4 more rows...]                                               │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

Sparklines on the Watchlist page: `h-20` (80px) with filled area (`fillOpacity: 0.15`, positive colour for up trend, negative for down). On the Dashboard watchlist panel: `h-10` (40px), no fill — stroke only for compactness.

---

### 5.9 Mobile Sidebar Overlay

On `< 768px`, sidebar is hidden. Hamburger button in header opens a slide-in overlay:

```
┌──────────────────────────────────────────────────────────────────────┐
│ [☰]  CryptoAdvisor        [● Demo User]                             │  ← header
├──────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────┐                                     │
│ │  [×]                         │  ← close button                    │
│ │  🔷 CryptoAdvisor            │                                     │
│ │                              │                                     │
│ │  ◉ Dashboard   ← active     │                                     │
│ │  ○ Portfolio                 │                                     │
│ │  ○ Charts                    │                                     │
│ │  ○ Signals                   │                                     │
│ │  ○ Alerts                    │                                     │
│ │  ○ Transactions              │                                     │
│ │  ○ Watchlist                 │                                     │
│ └──────────────────────────────┘                                     │
│  [backdrop: bg-black/50, click to close]                             │
└──────────────────────────────────────────────────────────────────────┘
```

**Implementation:**
- Sidebar panel: `fixed left-0 top-0 h-full w-60 bg-bg-surface z-50 transform transition-transform duration-300`
- Open: `translate-x-0`; Closed: `-translate-x-full`
- Backdrop: `fixed inset-0 bg-black/50 z-40` (rendered when open; `onClick` closes)
- On nav link click: close sidebar → navigate
- On `Escape` keydown: close sidebar
- On route change (`useLocation`): close sidebar via `useEffect`

**Reduced motion:** Wrap transition in:
```css
@media (prefers-reduced-motion: reduce) {
  .sidebar-panel { transition: none; }
}
```

---

## 6. Component Hierarchy

### 6.1 Full Component Tree

```
src/
├── main.tsx
│   ├── document.documentElement.classList.add('dark')   ← before first render
│   ├── <QueryClientProvider client={queryClient}>
│   └── <BrowserRouter>
│       └── <App />
│
├── App.tsx
│   └── <Routes>
│       └── <Route path="/" element={<AppLayout />}>
│           ├── <Route index element={<Dashboard />} />
│           ├── <Route path="portfolio" element={<Portfolio />} />
│           ├── <Route path="charts" element={<Charts />} />
│           ├── <Route path="signals" element={<Signals />} />
│           ├── <Route path="alerts" element={<Alerts />} />
│           ├── <Route path="transactions" element={<Transactions />} />
│           └── <Route path="watchlist" element={<Watchlist />} />
│
├── components/layout/
│   ├── AppLayout.tsx           props: —
│   │   ├── <Sidebar>
│   │   ├── <div.flex-1>
│   │   │   ├── <Header>
│   │   │   └── <main><Outlet /></main>
│   │
│   ├── Sidebar.tsx             props: —
│   │   ├── Logo block
│   │   └── <nav aria-label="Main navigation">
│   │       └── <NavLink> × 7 (active state via NavLink className prop)
│   │
│   └── Header.tsx              props: —
│       ├── <button> HamburgerButton (mobile only)
│       ├── <h1> PageTitle (from usePageTitle hook or useLocation)
│       ├── <input type="search"> SearchInput
│       └── UserAvatar block
│
├── components/ui/
│   ├── Panel.tsx               props: { title: string, action?: ReactNode, children }
│   │
│   ├── StatCard.tsx            props: { label, value, change?, sparklineData?: number[] }
│   │   └── <Sparkline> (if sparklineData)
│   │
│   ├── Badge.tsx               props: { variant: BadgeVariant }
│   │   BadgeVariant = 'buy'|'sell'|'hold'|'active'|'triggered'
│   │               |'completed'|'pending'|'failed'
│   │   Renders coloured pill with matching text
│   │
│   ├── LoadingSkeleton.tsx     props: { className?: string }
│   │   Renders: <div className={`animate-pulse bg-bg-elevated rounded ${className}`} />
│   │
│   ├── EmptyState.tsx          props: { icon?, heading?, description? }
│   │   Renders: centred icon + heading + description inside panel
│   │
│   └── ErrorBanner.tsx         props: { message?: string }
│       role="alert" — red-tinted, scoped to its panel
│
├── components/charts/
│   ├── CandlestickChart.tsx    props: { asset, timeframe, onAssetChange, onTimeframeChange }
│   │   ├── asset/timeframe button controls
│   │   ├── <ResponsiveContainer>
│   │   │   └── <ComposedChart data={candles}>
│   │   │       ├── <XAxis> — date labels, text: CHART_COLORS.text
│   │   │       ├── <YAxis yAxisId="price"> — price scale
│   │   │       ├── <YAxis yAxisId="volume"> — volume scale
│   │   │       ├── <CartesianGrid stroke={CHART_COLORS.grid} />
│   │   │       ├── <Bar dataKey="volume" yAxisId="volume" fill={CHART_COLORS.text} />
│   │   │       ├── <Bar dataKey="candle" shape={<CandlestickBar />} />
│   │   │       └── <Tooltip content={<CandlestickTooltip />} />
│   │
│   ├── CandlestickBar.tsx      Custom Recharts shape (~50 lines SVG)
│   │   props: x, y, width, height, open, high, low, close (from Recharts data)
│   │   Renders:
│   │   ├── <line> wick — from high to low, x = x + width/2
│   │   └── <rect> body — from min(open,close) to max(open,close)
│   │   Color: close >= open → CHART_COLORS.positive; else → CHART_COLORS.negative
│   │
│   ├── AllocationPieChart.tsx  props: { holdings: Holding[] }
│   │   └── <ResponsiveContainer>
│   │       └── <PieChart>
│   │           ├── <Pie innerRadius={60} outerRadius={100}>
│   │           │   └── <Cell> × holdings.length (colour from CHART_COLORS.pie[i])
│   │           ├── <Tooltip content={<PieTooltip />} />
│   │           └── <Legend />
│   │   Centre label: total portfolio value (absolute positioned)
│   │
│   └── Sparkline.tsx           props: { data: number[], height?: number, positive?: boolean }
│       └── <ResponsiveContainer height={height ?? 40}>
│           └── <AreaChart data={data.map((v,i)=>({v,i}))}>
│               ├── <Area dataKey="v" stroke={positive ? CHART_COLORS.positive : CHART_COLORS.negative}
│               │         fill={positive ? CHART_COLORS.positive : CHART_COLORS.negative}
│               │         fillOpacity={height > 40 ? 0.15 : 0} />
│               └── (no XAxis, no YAxis, no CartesianGrid, no Tooltip)
│
└── pages/
    ├── Dashboard.tsx           uses: usePortfolio, usePrices, useSignals, useAlerts, useTransactions, useWatchlist
    ├── Portfolio.tsx           uses: usePortfolio
    ├── Charts.tsx              uses: usePrices (asset + timeframe state)
    ├── Signals.tsx             uses: useSignals + local filter state
    ├── Alerts.tsx              uses: useAlerts + local filter state
    ├── Transactions.tsx        uses: useTransactions + local sort state
    └── Watchlist.tsx           uses: useWatchlist + local sort state
```

### 6.2 State Ownership

| State | Lives in | Type |
|-------|----------|------|
| All server data | React Query cache | `useQuery` hooks |
| Selected asset (chart) | `Charts.tsx` | `useState<'BTC'\|'ETH'\|'SOL'\|'ADA'>` |
| Selected timeframe | `Charts.tsx` | `useState<'1D'\|'1W'\|'1M'>` |
| Signals direction filter | `Signals.tsx` | `useState<string>` |
| Alerts status filter | `Alerts.tsx` | `useState<string>` |
| Transactions sort | `Transactions.tsx` | `useState<{ column: string, dir: 'asc'\|'desc' }>` |
| Watchlist sort | `Watchlist.tsx` | `useState<{ column: string, dir: 'asc'\|'desc' }>` |
| Sidebar open (mobile) | `AppLayout.tsx` | `useState<boolean>` |

No global state manager needed. React Query owns async data. `useState` owns local UI state.

### 6.3 Data Loading Pattern

Every page/panel follows this identical pattern:

```tsx
const { data, isLoading, isError } = useSignals()

if (isLoading) return <SignalsSkeleton />
if (isError)   return <ErrorBanner />
if (!data?.length) return <EmptyState heading="No signals" />

return <SignalCardList signals={data} />
```

Skeletons are always shape-matched — they look like the real content at the same dimensions.

---

## 7. Responsive Breakpoints

### 7.1 Breakpoint Table

| Name | Min-width | Tailwind prefix | Sidebar | Grid |
|------|-----------|-----------------|---------|------|
| Mobile | 375px | (default / no prefix) | Hidden; hamburger opens overlay | 1 column |
| Tablet | 768px | `md:` | Icon-only rail (64px) | 2 columns |
| Desktop | 1280px | `xl:` | Full sidebar (240px) | 3 columns |

### 7.2 Sidebar Behaviour Per Breakpoint

```
Mobile (<768px)
  Sidebar: display:none (hidden)
  Header: shows hamburger button
  Nav: accessible via overlay panel (see §5.9)

Tablet (768px–1279px)
  Sidebar: w-16 (64px), shows icons only
  Nav items: icon visible, label hidden (md:hidden xl:block)
  Tooltip on icon hover shows label text
  Header: hides hamburger

Desktop (≥1280px)
  Sidebar: w-60 (240px), shows icon + label
  Header: hides hamburger
  Content area: ml-60 (margin left = sidebar width)
```

### 7.3 Dashboard Grid Per Breakpoint

| Viewport | Columns | Candle panel | Lower panels |
|---------|---------|-------------|-------------|
| Mobile | 1 | Full width | Stacked |
| Tablet | 2 | Spans both cols | 2-col row |
| Desktop | 3 | Spans 2 of 3 cols | 3-col row |

### 7.4 Chart Heights Per Breakpoint

| Chart | Mobile | Tablet | Desktop |
|-------|--------|--------|---------|
| Candlestick (Dashboard) | `h-[280px]` | `h-[360px]` | `h-[400px]` |
| Candlestick (Charts page) | `h-[280px]` | `h-[400px]` | `h-[500px]` |
| Volume bar section | `~50px` | `~65px` | `~80px` |
| Sparkline (panels) | `h-10` (40px) | `h-10` | `h-10` |
| Sparkline (Watchlist page) | `h-20` (80px) | `h-20` | `h-20` |

### 7.5 Touch Target Enforcement (Mobile)

All tappable elements on mobile must meet 44×44px minimum:

| Element | Implementation |
|---------|---------------|
| Sidebar nav items | `min-h-[44px] flex items-center` |
| Hamburger button | `w-11 h-11 flex items-center justify-center` |
| Filter tabs | `min-h-[44px] px-4 flex items-center` |
| Asset/timeframe buttons | `min-h-[44px] px-4` |
| Sort header buttons | `h-12` (table row height) |
| Close button (mobile sidebar) | `w-11 h-11` |

### 7.6 Horizontal Overflow Policy

| Element | Mobile overflow behaviour |
|---------|--------------------------|
| Page layout | No overflow (single column stacks) |
| Candlestick chart | `ResponsiveContainer` fills panel; no overflow |
| Transactions table | `overflow-x-auto` wrapper; `min-w-[700px]` table |
| Holdings table (Portfolio) | `overflow-x-auto` wrapper |
| All other content | No overflow |

---

## 8. Interaction Patterns

### 8.1 Loading Skeletons

Each panel renders a shape-matched skeleton during the 150ms mock fetch delay.

**Stat card skeleton:**
```tsx
<div className="animate-pulse min-h-[120px] p-5">
  <div className="h-3 w-20 bg-bg-elevated rounded mb-4" />   {/* label */}
  <div className="h-8 w-36 bg-bg-elevated rounded mb-4" />   {/* value */}
  <div className="h-10 w-full bg-bg-elevated rounded" />     {/* sparkline */}
</div>
```

**Generic panel skeleton (3 rows):**
```tsx
<div className="animate-pulse p-5 space-y-3">
  {[1,2,3].map(i => <div key={i} className="h-12 bg-bg-elevated rounded" />)}
</div>
```

**Chart skeleton:**
```tsx
<div className="animate-pulse p-5">
  <div className="h-[400px] w-full bg-bg-elevated rounded" />
</div>
```

**Transaction table skeleton (5 rows):**
```tsx
<div className="animate-pulse p-5 space-y-2">
  <div className="h-10 bg-bg-elevated rounded" />  {/* header row */}
  {[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-bg-elevated/50 rounded" />)}
</div>
```

### 8.2 Candlestick Chart Interaction

1. User clicks an asset or timeframe button
2. Local state updates immediately — active button is highlighted
3. `usePrices(newAsset, newTimeframe)` fires with the new React Query key
4. `isLoading: true` for ~150ms → chart area shows `<CandlestickSkeleton>`
5. New data resolves → `<CandlestickChart>` renders fresh candles

Hover tooltip shows: date/time, O, H, L, C values, volume — all formatted with labels.

### 8.3 Client-Side Filters (Signals / Alerts)

No re-fetch on filter change:

```tsx
// Signals.tsx
const [filter, setFilter] = useState<'All' | 'BUY' | 'SELL' | 'HOLD'>('All')
const { data: signals } = useSignals()

const filtered = useMemo(
  () => filter === 'All' ? signals : signals?.filter(s => s.direction === filter),
  [signals, filter]
)
```

Active tab changes immediately. List re-renders on next tick. Counts stay live:

```tsx
const counts = useMemo(() => ({
  All:  signals?.length ?? 0,
  BUY:  signals?.filter(s => s.direction === 'BUY').length ?? 0,
  SELL: signals?.filter(s => s.direction === 'SELL').length ?? 0,
  HOLD: signals?.filter(s => s.direction === 'HOLD').length ?? 0,
}), [signals])
```

### 8.4 Transaction Table Sorting

```tsx
type SortState = { column: keyof Transaction, dir: 'asc' | 'desc' }
const [sort, setSort] = useState<SortState>({ column: 'date', dir: 'desc' })

const sorted = useMemo(() => {
  if (!data) return []
  return [...data].sort((a, b) => {
    const av = a[sort.column], bv = b[sort.column]
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sort.dir === 'asc' ? cmp : -cmp
  })
}, [data, sort])

const handleSort = (column: keyof Transaction) => {
  setSort(prev =>
    prev.column === column
      ? { column, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { column, dir: 'desc' }
  )
}
```

Sort indicator icon: Lucide `ChevronsUpDown` (inactive), `ChevronUp` (asc), `ChevronDown` (desc).

### 8.5 Candlestick Custom Shape (CandlestickBar)

The `CandlestickBar` component receives Recharts computed layout props and renders SVG:

```tsx
interface CandlestickBarProps {
  x: number; y: number; width: number; height: number
  open: number; high: number; low: number; close: number
}

// Recharts passes x/y/width/height based on the data layout
// open/high/low/close are raw data values; map to pixel coords via the chart's scale
// The component receives these already mapped via a custom dataKey approach

export function CandlestickBar({ x, y, width, open, high, low, close, yScale }: ...) {
  const isUp   = close >= open
  const color  = isUp ? CHART_COLORS.positive : CHART_COLORS.negative
  const bodyY  = yScale(Math.max(open, close))
  const bodyH  = Math.abs(yScale(open) - yScale(close))
  const wickX  = x + width / 2
  const highY  = yScale(high)
  const lowY   = yScale(low)

  return (
    <g>
      {/* Wick */}
      <line x1={wickX} y1={highY} x2={wickX} y2={lowY} stroke={color} strokeWidth={1} />
      {/* Body */}
      <rect x={x + 1} y={bodyY} width={width - 2} height={Math.max(bodyH, 1)}
            fill={color} />
    </g>
  )
}
```

Unit test for `CandlestickBar` is mandatory — verify body height = `|close - open|` mapped through scale, wick extends to high and low.

### 8.6 Allocation Pie — Donut with Centre Label

The `AllocationPieChart` uses Recharts `PieChart` with `innerRadius` to create a donut. Total portfolio value is rendered as absolute-positioned text centred over the hole:

```tsx
<div className="relative">
  <ResponsiveContainer width="100%" height={280}>
    <PieChart>
      <Pie data={holdingSlices} innerRadius={70} outerRadius={110} dataKey="allocationPct">
        {holdingSlices.map((_, i) => (
          <Cell key={i} fill={CHART_COLORS.pie[i % CHART_COLORS.pie.length]} />
        ))}
      </Pie>
      <Tooltip content={<PieTooltip />} />
      <Legend />
    </PieChart>
  </ResponsiveContainer>
  {/* Centre label — absolute positioned */}
  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
    <span className="text-xs text-text-secondary uppercase tracking-wide">Total</span>
    <span className="text-lg font-bold font-mono tabular-nums text-text-primary">
      {formatUSD(portfolio.totalValue)}
    </span>
  </div>
</div>
```

### 8.7 Empty State

Displayed when a mock data array returns empty (edge case, always tested):

```tsx
// EmptyState.tsx
<div className="flex flex-col items-center justify-center min-h-[200px] gap-3">
  <InboxIcon className="w-12 h-12 text-text-muted" aria-hidden="true" />
  <p className="text-base font-semibold text-text-secondary">{heading ?? 'No data yet'}</p>
  <p className="text-sm text-text-muted text-center">{description}</p>
</div>
```

### 8.8 Error State

Displayed when a mock API call rejects (tested via mock override in Vitest):

```tsx
// ErrorBanner.tsx — role="alert" for immediate screen reader announcement
<div
  role="alert"
  className="flex items-center gap-3 p-4 bg-negative-bg border border-negative/30 rounded-lg text-sm text-negative"
>
  <AlertCircleIcon className="w-5 h-5 shrink-0" aria-hidden="true" />
  {message ?? 'Failed to load data. Please try again.'}
</div>
```

---

## 9. Accessibility Requirements

### 9.1 Target Standard

**WCAG 2.1 AA** — demonstrating AA compliance signals professional quality to fintech prospective clients.

### 9.2 Colour Contrast Ratios

| Foreground | Background | Ratio | Level |
|-----------|-----------|-------|-------|
| `#e2e8f0` (primary text) | `#131722` (surface) | 14.2:1 | ✅ AAA |
| `#94a3b8` (secondary text) | `#131722` | 5.4:1 | ✅ AA |
| `#22c55e` (positive) | `#131722` | 4.8:1 | ✅ AA |
| `#ef4444` (negative) | `#131722` | 4.6:1 | ✅ AA |
| `#f59e0b` (neutral/warning) | `#131722` | 4.5:1 | ✅ AA |
| `white` | `#3b82f6` (accent) | 4.6:1 | ✅ AA |
| `#e2e8f0` | `#1c2030` (elevated) | 12.3:1 | ✅ AAA |

`#475569` (muted text) on `#131722` = 3.5:1 — AA for large text/decorative use only. Never use for important data or interactive labels.

### 9.3 ARIA Labels and Semantic Roles

| Component | Semantic markup |
|-----------|----------------|
| Sidebar | `<nav aria-label="Main navigation">` |
| Active nav link | `aria-current="page"` |
| Hamburger button (open) | `<button aria-label="Open navigation menu" aria-expanded={false}>` |
| Hamburger button (close) | `aria-expanded={true}` when open |
| Sidebar backdrop | `<div aria-hidden="true" onClick={close}>` |
| Data panels | `<section aria-label="{Panel Title}">` |
| Stat card | `<article aria-label="{label}: {value}">` |
| `AllocationPieChart` | `<figure aria-label="Portfolio allocation donut chart">` |
| `CandlestickChart` | `<figure aria-label="Price chart for {asset} {timeframe}">` |
| `Sparkline` | `aria-hidden="true"` (decorative; data shown in adjacent text) |
| Sort button (th) | `<th aria-sort="ascending|descending|none">` |
| Filter tabs | `role="tablist"` on container, `role="tab" aria-selected={bool}` on each |
| Active filter tab panel | `role="tabpanel"` on filtered list |
| `LoadingSkeleton` | `role="status" aria-label="Loading {context}"` |
| `ErrorBanner` | `role="alert"` (immediately announced by screen readers) |
| Search input | `<input type="search" aria-label="Search assets" placeholder="Search assets…">` |
| Progress bar (signal confidence) | `role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label="Confidence: {value}%"` |

### 9.4 Keyboard Navigation

**Tab order:** DOM source order — sidebar nav → header → page content.

**Focus ring:** Visible on all interactive elements:
```tsx
className="focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
```

Apply to all `<button>`, `<a>`, `<input>`. Avoid `<div onClick>` — use semantic elements.

**Mobile sidebar keyboard behaviour:**
- Opening: focus moves to first nav link (`autoFocus` or programmatic `focus()` in `useEffect`)
- `Escape`: closes the overlay
- `Tab` stays within sidebar (focus trap) while overlay is open — use `focus-trap-react` or a manual `keydown` handler
- On close: focus returns to the hamburger button

**Table:** Column header `<th>` elements are `<button>` wrapped or have `tabIndex={0}` with keyboard `Enter`/`Space` triggering sort.

### 9.5 Positive/Negative — Never Colour Alone

Per WCAG 1.4.1 (Use of Color), colour must never be the sole indicator of meaning. Every positive/negative value must have BOTH:
1. A textual sign prefix: `+` for positive, `−` for negative
2. The appropriate colour class: `text-positive` / `text-negative`

Correct:
```tsx
<span className="text-positive font-mono tabular-nums">+$1,234.56</span>
<span className="text-negative font-mono tabular-nums">−$234.00</span>
```

### 9.6 Motion

The only animations used are:
- `animate-pulse` on skeletons (CSS opacity, safe for vestibular disorders)
- Sidebar slide (`transition-transform duration-300`) — disabled via `prefers-reduced-motion`

No spinning loaders. No layout shift animations. No data-driven transitions.

```css
@media (prefers-reduced-motion: reduce) {
  .animate-pulse { animation: none; }
  .sidebar-panel  { transition: none; }
}
```

---

## Appendix A: Design Token Quick Reference

```
BACKGROUNDS (darkest → lightest)
  bg-bg-base      #0b0e11   Main page background
  bg-bg-surface   #131722   Panel / card
  bg-bg-elevated  #1c2030   Dropdown / tooltip / skeleton / hover
  border-bg-border #2a2e39  Borders / dividers

TEXT
  text-text-primary   #e2e8f0   Primary content, headings
  text-text-secondary #94a3b8   Labels, descriptions, axis ticks
  text-text-muted     #475569   Placeholders, disabled, timestamps

ACCENT
  bg/text-accent      #3b82f6   Active nav, focus rings, buttons
  (hover)             #2563eb

FINANCIAL SIGNALS
  text/bg-positive    #22c55e / rgba(20,83,45,0.16)    Gains, BUY, Active
  text/bg-negative    #ef4444 / rgba(127,29,29,0.16)   Losses, SELL, Triggered
  text/bg-neutral     #f59e0b / rgba(120,53,15,0.16)   HOLD, Pending, Warning

CHART COLORS (TypeScript constants — not CSS vars)
  CHART_COLORS.positive  #22c55e
  CHART_COLORS.negative  #ef4444
  CHART_COLORS.neutral   #f59e0b
  CHART_COLORS.accent    #3b82f6
  CHART_COLORS.grid      #2a2e39
  CHART_COLORS.text      #94a3b8
  CHART_COLORS.pie[0-5]  #3b82f6 #8b5cf6 #10b981 #f59e0b #ec4899 #06b6d4
```

---

## Appendix B: Component Implementation Checklist

Use before marking any component as done:

**Styling:**
- [ ] Uses Tailwind token classes (`bg-bg-surface`, `text-text-primary`) — no hardcoded hex
- [ ] No white backgrounds anywhere (confirm in Playwright screenshot)
- [ ] `dark` class on `<html>` means all `dark:` variants are always active — avoid using them (use base token classes instead)

**Numbers:**
- [ ] All financial figures: `font-mono tabular-nums`
- [ ] Positive values: `text-positive` + `+` prefix
- [ ] Negative values: `text-negative` + `−` prefix (em-dash, not hyphen)

**Charts:**
- [ ] Chart fill/stroke uses `CHART_COLORS.*` constants — never `var(--color-*)`
- [ ] `ResponsiveContainer` used — no hardcoded chart width

**Interaction:**
- [ ] Interactive elements: `focus-visible:ring-2 ring-accent ring-offset-2 ring-offset-bg-base`
- [ ] Min touch target on mobile: `min-h-[44px]` on all buttons/links

**States:**
- [ ] `isLoading` → `<LoadingSkeleton>` (shape-matched)
- [ ] `isError` → `<ErrorBanner>`
- [ ] Empty data → `<EmptyState>`

**Accessibility:**
- [ ] Semantic HTML (`<section>`, `<nav>`, `<article>`, `<figure>`, `<table>`)
- [ ] ARIA labels on interactive elements
- [ ] `aria-current="page"` on active nav link
- [ ] `role="alert"` on `<ErrorBanner>`
- [ ] `role="status"` on `<LoadingSkeleton>`
- [ ] `aria-hidden="true"` on decorative sparklines

**Testing:**
- [ ] Has co-located `*.test.tsx` / `*.test.ts` file
- [ ] Test uses role-based queries (`getByRole`, `getByLabelText`) not `data-testid`
- [ ] Skeleton, empty state, and error state are each tested with mock overrides

---

*Design spec authored by: gigforge-ux-designer*
*Review required by: gigforge-engineer (technical feasibility), gigforge-pm (spec alignment)*
*Next step: Sprint 1 — implement design tokens in `src/index.css` + `AppLayout` shell*
