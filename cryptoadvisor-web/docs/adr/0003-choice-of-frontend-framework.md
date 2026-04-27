# ADR-0003: Choice of Frontend Framework and Build Toolchain
## Status: Accepted
## Date: 2026-03-22

## Context

The CryptoAdvisor Web Dashboard needs a component-based SPA framework capable of rendering a data-dense financial dashboard with multiple chart types, real-time-like updates (simulated), and a responsive layout. We needed to choose a framework, build tool, and package manager.

The client requirements specified React 19 + Tailwind CSS. The sprint plan added Vite and pnpm.

## Decision

**React 19 + TypeScript 5 (strict) + Vite 5 + Tailwind CSS 4 + pnpm.**

**React 19** is the client requirement. Its concurrent features are directly applicable:
- Suspense boundaries for loading skeletons on independent data panels — each panel suspends independently, so a slow signals load doesn't block the portfolio card
- `useTransition` for non-blocking timeframe/asset switches in the candlestick chart — the UI stays interactive while new candle data loads
- The `use()` hook for reading from React Query's promise cache

**Tailwind CSS 4** (not v3): The sprint plan explicitly specifies Tailwind 4. By March 2026, Tailwind 4 has been in stable release for over a year (released January 2025). The v4 Oxide engine is faster to compile and the CSS-first config (`@import 'tailwindcss'`) is cleaner than v3's PostCSS plugin chain. The design system tokens from `specs/design-system.md` map directly to Tailwind 4's `theme.extend.colors` config.

**pnpm**: Faster installs, strict hoisting (no phantom dependencies), smaller disk footprint. The sprint plan specifies pnpm throughout. Consistent with a team that uses it across projects.

**Vite 5**: `pnpm create vite` scaffolds the project. Sub-second HMR for development. The build output is a directory of static files — no SSR, no edge runtime.

## Alternatives Considered

**Next.js 15**
- SSR, App Router, file-based routing, built-in image optimisation
- Rejected because: (1) all content is behind the dashboard — there is no public-facing page that benefits from SSR or SEO; (2) the gigforge-website already demonstrates Next.js in the portfolio; (3) Next.js adds hydration complexity and server component/client component boundaries that are unnecessary for a client-authenticated tool; (4) larger Docker image and slower cold start vs a static nginx container

**Vue 3**
- Composition API, excellent reactivity model
- Rejected because: client specified React; no Vue precedent in this portfolio

**Remix**
- Data loading at the route level, progressive enhancement
- Rejected because: same reasoning as Next.js — this is a client-side dashboard with no SSR value proposition

**Tailwind CSS 3**
- More widely adopted, no breaking changes from v2
- Rejected because: the sprint plan explicitly specifies v4; by March 2026 v4 is stable and the team can demonstrate the latest toolchain; the design system spec already includes a Tailwind 4 config (`tailwind.config.ts` with the new format)

**npm or yarn (instead of pnpm)**
- Industry-standard package managers
- Rejected because: sprint plan specifies pnpm; strict hoisting prevents phantom dependency bugs; faster CI installs

**webpack**
- Mature, highly configurable
- Rejected because: Vite is faster for development and produces equivalent production bundles; Vite 5 is the obvious choice for a React 19 project in 2026; no webpack-specific feature is needed

## Consequences

- **Positive:** React 19 Suspense boundaries give each dashboard panel independent loading states — the dashboard is usable as soon as any panel loads.
- **Positive:** Tailwind 4 + CSS custom properties gives full design token control without a CSS-in-JS runtime cost.
- **Positive:** Vite 5 + pnpm provides the fastest possible developer experience for a React project.
- **Risk:** React 19 is newer; some community libraries may lag. Recharts and TanStack Query both support React 19.
- **Risk:** Tailwind 4 config format differs from v3 — there is no `tailwind.config.js` file in the traditional sense; config is in `tailwind.config.ts` with a new structure. Engineers must follow the v4 documentation, not v3 tutorials.
- **Note:** `darkMode: ['class']` is configured in Tailwind. The `dark` class is applied to `<html>` in `src/main.tsx` on startup and never toggled — this is a dark-only application. No light mode toggle is in scope.
