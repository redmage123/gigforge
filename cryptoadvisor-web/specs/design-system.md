# Design System — CryptoAdvisor Web Dashboard

**Story:** STORY-001
**Author:** UX Designer
**Date:** 2026-03-22

---

## Design Principles

- **Dark first.** All surfaces are dark; light mode is not in scope.
- **Data density.** Financial dashboards pack information — use compact spacing.
- **Signal clarity.** Green = positive / gain / buy. Red = negative / loss / sell. Yellow/amber = neutral / hold / warning.
- **Trust through precision.** Numbers must be easy to scan. Use monospace for all numeric values.

---

## Colour Tokens

```css
:root {
  /* Backgrounds */
  --color-bg-base:      #0b0e11;   /* page background */
  --color-bg-surface:   #131722;   /* card / panel background */
  --color-bg-elevated:  #1c2030;   /* input, dropdown, hover */
  --color-bg-border:    #2a2e39;   /* dividers, card borders */

  /* Text */
  --color-text-primary:   #e2e8f0; /* headings, labels */
  --color-text-secondary: #94a3b8; /* supporting text, captions */
  --color-text-muted:     #475569; /* placeholder, disabled */

  /* Brand accent */
  --color-accent:         #3b82f6; /* primary action, selected state */
  --color-accent-hover:   #2563eb;

  /* Financial signals */
  --color-positive:       #22c55e; /* gains, BUY, positive delta */
  --color-positive-bg:    #14532d2a;
  --color-negative:       #ef4444; /* losses, SELL, negative delta */
  --color-negative-bg:    #7f1d1d2a;
  --color-neutral:        #f59e0b; /* HOLD, warning */
  --color-neutral-bg:     #78350f2a;
}
```

**Contrast ratios (WCAG AA):**
- Primary text on base: 12.5:1 ✓
- Secondary text on surface: 5.2:1 ✓
- Accent on surface: 4.8:1 ✓

---

## Typography

```css
/* Font stack */
--font-sans: 'Inter', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;

/* Scale */
--text-xs:   0.75rem  / 1rem;     /* 12px — captions, badges */
--text-sm:   0.875rem / 1.25rem;  /* 14px — body, table cells */
--text-base: 1rem     / 1.5rem;   /* 16px — default */
--text-lg:   1.125rem / 1.75rem;  /* 18px — subheadings */
--text-xl:   1.25rem  / 1.75rem;  /* 20px — panel titles */
--text-2xl:  1.5rem   / 2rem;     /* 24px — dashboard title */
--text-3xl:  1.875rem / 2.25rem;  /* 30px — portfolio total */

/* All price/numeric values: font-mono, tabular-nums */
```

---

## Spacing

Base unit: 4px

| Token | Value | Use |
|-------|-------|-----|
| `space-1` | 4px | icon gap, tight inline |
| `space-2` | 8px | inner padding compact |
| `space-3` | 12px | chip / badge padding |
| `space-4` | 16px | card inner padding |
| `space-6` | 24px | section gap |
| `space-8` | 32px | panel gap |

---

## Layout

```
┌─────────────────────────────────────────────────────────┐
│  SIDEBAR (240px fixed)  │  HEADER (top bar, 56px)        │
│  ─────────────────────  │  ──────────────────────────── │
│  Logo                   │  Page title   Global search    │
│  ─────────────────────  │  ──────────────────────────── │
│  Dashboard              │                               │
│  Portfolio              │  MAIN CONTENT AREA            │
│  Charts       ←nav      │  (scrollable, flex/grid)      │
│  Signals                │                               │
│  Alerts                 │                               │
│  Transactions           │                               │
│  Watchlist              │                               │
│  ─────────────────────  │                               │
│  Settings               │                               │
└─────────────────────────────────────────────────────────┘
```

**Responsive:**
- `≥1280px`: sidebar visible, 3-column grid
- `768px–1279px`: sidebar hidden (hamburger), 2-column grid
- `<768px`: sidebar off-canvas drawer, 1-column stack

---

## Dashboard Grid (main page)

```
┌──────────────────┬────────────────┬──────────────────────┐
│  Portfolio Total │  24h P&L       │  Allocation Pie      │
│  (stat card)     │  (stat card)   │  (chart, 2-col span) │
├──────────────────┴────────────────┤                      │
│  Price Chart (candlestick)        │                      │
│  full-width                       │                      │
├──────────────────┬────────────────┴──────────────────────┤
│  AI Signals      │  Watchlist                            │
│  (panel)         │  (panel)                              │
├──────────────────┼───────────────────────────────────────┤
│  Alerts          │  Transaction History                  │
│  (panel)         │  (table, 2-col span)                  │
└──────────────────┴───────────────────────────────────────┘
```

---

## Component Specs

### Stat Card
- Background: `--color-bg-surface`, border: `1px solid --color-bg-border`, border-radius: 8px
- Padding: 16px
- Label: `text-sm`, `--color-text-secondary`
- Value: `text-3xl`, `font-mono`, `--color-text-primary`
- Delta badge: `text-sm`, coloured background pill (positive/negative)

### Panel / Card
- Background: `--color-bg-surface`, border: `1px solid --color-bg-border`, border-radius: 8px
- Header: `text-xl`, `--color-text-primary`, border-bottom
- Body: `space-4` padding

### Badge
- BUY: green bg + text, `text-xs`, uppercase, `space-3` horizontal padding, rounded-full
- SELL: red bg + text
- HOLD: amber bg + text

### Table
- Header: `text-xs`, uppercase, `--color-text-secondary`, `--color-bg-elevated` bg
- Row: `text-sm`, alternating `--color-bg-surface` / `--color-bg-elevated`
- Row hover: `--color-bg-elevated` + `--color-accent` left border

### Chart Colours
- Up candle: `--color-positive` fill, `--color-positive` wick
- Down candle: `--color-negative` fill, `--color-negative` wick
- Volume bar: same as candle direction, 40% opacity
- Grid lines: `--color-bg-border`
- Tooltip: `--color-bg-elevated`, `1px solid --color-bg-border`

---

## Accessibility

- All interactive elements must have visible focus ring (`ring-2 ring-accent`)
- All icons must have `aria-label` or be `aria-hidden` with adjacent text
- Colour is never the sole indicator — badges have text labels as well
- Minimum touch target: 44×44px on mobile

---

## Tailwind Config (v4)

```ts
// tailwind.config.ts
export default {
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        bg: {
          base:     '#0b0e11',
          surface:  '#131722',
          elevated: '#1c2030',
          border:   '#2a2e39',
        },
        text: {
          primary:   '#e2e8f0',
          secondary: '#94a3b8',
          muted:     '#475569',
        },
        accent:   '#3b82f6',
        positive: '#22c55e',
        negative: '#ef4444',
        neutral:  '#f59e0b',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
}
```
