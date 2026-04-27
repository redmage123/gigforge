# ADR-0006: Dark Theme Implementation
## Status: Accepted
## Date: 2026-03-22

## Context

The client requirement is "dark theme by default — financial dashboard aesthetic." The design system (`specs/design-system.md`) defines a complete colour token set: background layers, text hierarchy, financial signal colours (positive/negative/neutral), and accent colours.

We needed to decide how to implement the dark theme — whether to use CSS custom properties, Tailwind's built-in dark mode utilities, a third-party design system, or hardcoded values.

## Decision

**CSS custom properties on `:root` combined with Tailwind CSS 4's `darkMode: ['class']` strategy. The `dark` class is applied to `<html>` at startup and never toggled.**

### Implementation

`src/index.css`:
```css
@import 'tailwindcss';

:root {
  --color-bg-base:       #0b0e11;
  --color-bg-surface:    #131722;
  --color-bg-elevated:   #1c2030;
  --color-bg-border:     #2a2e39;
  --color-text-primary:  #e2e8f0;
  --color-text-secondary:#94a3b8;
  --color-text-muted:    #475569;
  --color-accent:        #3b82f6;
  --color-accent-hover:  #2563eb;
  --color-positive:      #22c55e;
  --color-positive-bg:   #14532d2a;
  --color-negative:      #ef4444;
  --color-negative-bg:   #7f1d1d2a;
  --color-neutral:       #f59e0b;
  --color-neutral-bg:    #78350f2a;
}
```

`tailwind.config.ts` extends these values as named colours so Tailwind utilities work:
```typescript
colors: {
  bg: { base: '#0b0e11', surface: '#131722', elevated: '#1c2030', border: '#2a2e39' },
  text: { primary: '#e2e8f0', secondary: '#94a3b8', muted: '#475569' },
  accent: '#3b82f6',
  positive: '#22c55e',
  negative: '#ef4444',
  neutral: '#f59e0b',
}
```

`src/main.tsx`:
```tsx
document.documentElement.classList.add('dark')
```

This fires before the first render — no flash of unstyled content.

**Usage pattern in components:**
```tsx
// Use Tailwind utilities that reference the extended colours
<div className="bg-bg-surface border border-bg-border text-text-primary" />
<span className="text-positive font-mono">+$1,234.56</span>
<span className="text-negative font-mono">-$234.00</span>
```

**Chart colours:** CSS custom properties are NOT inherited by SVG (Recharts renders SVG). Define chart colour constants as TypeScript:
```typescript
// src/types/index.ts
export const CHART_COLORS = {
  positive: '#22c55e',
  negative: '#ef4444',
  neutral:  '#f59e0b',
  accent:   '#3b82f6',
  grid:     '#2a2e39',
  text:     '#94a3b8',
} as const
```

## Alternatives Considered

**Tailwind `dark:` variant utilities only (no CSS custom properties)**
- All dark styles written as `dark:bg-slate-900 dark:text-slate-100` etc.
- Rejected because: (1) the design system defines specific non-Tailwind colour values (`#0b0e11`, `#131722`, etc.) — mapping these to Tailwind's default palette is imprecise; (2) the `dark:` prefix doubles every colour utility in the markup; (3) Tailwind extended colours + CSS custom properties gives us semantic naming (`bg-bg-surface`) without doubling the class list

**Styled-components / Emotion with ThemeProvider**
- CSS-in-JS with a typed theme object
- Rejected because: (1) runtime CSS injection adds ~10KB to the bundle; (2) Tailwind CSS 4 is already the specified styling solution; (3) CSS custom properties achieve the same semantic token access without a runtime library

**Hardcoded hex values in Tailwind config (no CSS custom properties)**
- Simpler setup — just extend Tailwind colors with the hex values
- Partially adopted: Tailwind config does extend with hex values
- But CSS custom properties are ALSO defined because: Recharts tooltip styles and border colours are applied via inline `style` props; having `var(--color-bg-elevated)` available makes tooltip styling readable and maintainable

**Light mode toggle**
- System preference detection + toggle button
- Deferred: the project is dark-only. The `dark` class on `<html>` is set unconditionally. Light mode is out of scope. If added later: store preference in `localStorage`, read it in `main.tsx`, apply class accordingly. No component changes required.

**shadcn/ui component library**
- Pre-built components with a dark theme, Tailwind-based
- Rejected because: shadcn/ui's default palette (slate, zinc, neutral) differs from the financial dashboard aesthetic defined in the design system; overriding the theme to use `#0b0e11` surfaces destroys the value proposition of using shadcn; building components from scratch against the design system gives a more distinctive result

## Consequences

- **Positive:** Semantic utility names (`bg-bg-surface`, `text-text-secondary`) make component markup readable without memorising hex codes.
- **Positive:** CSS custom properties are available for inline styles and SVG-adjacent styling (chart tooltips) where Tailwind utilities cannot reach.
- **Positive:** No flash of light content — `dark` class is applied before first render.
- **Positive:** The design system spec (`specs/design-system.md`) is the single source of truth; token values appear in one place only (CSS custom properties declaration).
- **Risk:** Recharts SVG does not inherit CSS custom properties. All chart colours must use the `CHART_COLORS` TypeScript constants. Forgetting this leads to broken chart colours (transparent or browser-default colours). The `CHART_COLORS` constants must be co-located with the type definitions and documented in the README.
- **Note:** `font-mono` and `tabular-nums` must be applied to every numeric value: prices, P&L, percentages, volume. This is a financial UX requirement — tabular numbers align in columns and make rapid scanning possible. Enforce this in code review.
