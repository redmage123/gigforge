# ADR-0003: Choice of Frontend Framework and Build Tool

## Status: Accepted

## Context

We need a frontend for an internal recruitment tool with: contact list/search/filter, create/edit/delete forms, CSV import/export UI, JWT login, dark mode, and mobile responsiveness. The client specified React and Tailwind CSS. Target devices: desktop (1440px) and mobile (375px). 5 users, internal tool.

## Decision

**React 19 + Vite 6 + Tailwind CSS 4 + TypeScript.**

Client specified React and Tailwind — both are sound choices for this use case. React 19 brings the new compiler with automatic memoisation, reducing the need for `useMemo`/`useCallback` boilerplate. Vite 6 gives sub-second HMR and produces an optimised static bundle that Nginx serves directly — no Node.js process needed in production for the frontend.

Tailwind CSS 4 introduces CSS-native configuration (no `tailwind.config.js`), which aligns with the Vite build pipeline. The `dark:` variant system handles dark mode cleanly. We avoid a component library (MUI, Chakra, shadcn) to keep the bundle lean and the design entirely under our control — Tailwind utility classes achieve everything we need.

For accessible primitives (Modal, Drawer, Dropdown) that require complex ARIA patterns, we use `@headlessui/react` — unstyled, keyboard-accessible, and designed for Tailwind.

## Alternatives Considered

- **Vue 3 / Nuxt** — Excellent framework, but the client asked for React. No justification to override.
- **Next.js** — Server-side rendering has no value for an internal tool behind JWT auth. Every page is protected; there are no public pages to SEO-index. Next.js adds complexity (server components, RSC, API routes) that provides zero benefit here. A Vite SPA is simpler to build, test, and deploy.
- **Svelte / SvelteKit** — Compelling performance characteristics, but client specified React. The dev team's existing React expertise is a better fit for a 2-week timeline.
- **CSS Modules / styled-components** — More maintainable at large scale, but Tailwind is faster to build with when the design system is utility-based. The client specified Tailwind.
- **shadcn/ui** — A good choice for rapid prototyping with pre-built components. Rejected because it couples us to specific Radix UI component patterns and adds ~50 component files to the codebase. For 10 UI components, rolling our own with Headless UI is cleaner.

## Consequences

- **Positive:** Vite static build is trivially served by Nginx — no Node.js server process in production, no SSR complexity.
- **Positive:** React 19 compiler reduces re-render bugs without manual memoisation.
- **Positive:** Tailwind 4 CSS-native config is forward-compatible; no JS config file to maintain.
- **Negative:** React 19 is recently released — some ecosystem libraries may have minor compatibility issues. Mitigated by auditing all dependencies at project start.
- **Negative:** No component library means we write accessible Modal, Drawer, and MultiSelect from scratch (with Headless UI primitives). Adds ~4h to STORY-011 estimate.
- **Risk:** Tailwind 4's CSS-native config is a major change from Tailwind 3. Team must read migration guide before starting. No `@apply` in components — pure utility class composition only.
