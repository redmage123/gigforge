# ADR-0007: Frontend State Management

## Status: Accepted

## Context

The React frontend needs to manage two categories of state: (1) server state — contact lists, tag lists, paginated results, search results from the API; (2) client/UI state — dark mode preference, modal open/close, form field values. We must choose an approach that is maintainable, testable, and doesn't introduce unnecessary complexity for a 5-page internal tool.

## Decision

**TanStack Query (React Query) v5 for server state. React built-ins (useState, useContext) for UI state. No global state library (no Redux, no Zustand).**

**Server state — TanStack Query:**
Contacts, tags, and paginated search results are server state. TanStack Query handles: caching, background refetch, loading/error states, and cache invalidation after mutations (create/edit/delete contact). It eliminates the `useEffect + fetch + loading state + error state` pattern that every component would otherwise need. It also gives us optimistic updates for delete (contact disappears immediately from the list while the DELETE request is in flight).

Key query hooks:
- `useContacts({ page, limit, q, tag })` — cached by query key; re-fetches when search params change
- `useContact(id)` — cached single contact; populated from list cache when available
- `useTags()` — cached tag list; invalidated when a new tag is created
- Mutations: `useCreateContact`, `useUpdateContact`, `useDeleteContact`, `useImportCsv`

**UI state — React built-ins:**
Dark mode preference: stored in `localStorage`, applied as `data-theme` attribute on `<html>` before React hydrates (script in `index.html` prevents FOUC). A `useDarkMode` hook reads/writes localStorage and updates the attribute.

Modal/drawer open state: local `useState` in the parent page component — no need to share it globally.

Auth state: `AuthContext` with `useReducer` stores the JWT token and current user. Context is provided at the app root and consumed via `useAuth()` hook.

Form state: React Hook Form is intentionally NOT used — the contact form has 5 fields. `useState` + native HTML validation + Zod validation errors from the API response is sufficient. Adding React Hook Form for a 5-field form is over-engineering.

## Alternatives Considered

- **Redux Toolkit** — Industry standard for complex shared state. For a 5-page tool where the only shared state is auth and dark mode, Redux adds 3x the boilerplate for zero benefit. Context + TanStack Query covers all our needs.
- **Zustand** — Lighter than Redux. Still unnecessary — we have no complex cross-component state to share beyond auth (handled by Context) and server state (handled by TanStack Query).
- **SWR** — Vercel's data fetching library, similar to React Query. React Query has better mutation support, devtools, and offline handling. Both are valid; React Query is our team's established choice.
- **Plain useEffect + fetch** — Works, but every component reinvents loading/error state, caching, and race condition handling. At 8+ components making API calls, the duplication is a maintenance burden. TanStack Query pays for itself immediately.
- **React Hook Form** — Excellent for large forms with complex validation chains. The contact form has 5 fields and validation that maps 1:1 to Zod schemas already defined on the backend. `useState` is sufficient and keeps the dependency count lower.

## Consequences

- **Positive:** TanStack Query's cache means navigating away from and back to the contacts list doesn't trigger a full reload — instant perceived performance.
- **Positive:** `invalidateQueries` after a mutation keeps the contact list fresh without manual state wrangling.
- **Positive:** No global state store means component tests are simpler — no need to wrap in a Redux Provider; just QueryClientProvider.
- **Negative:** TanStack Query v5 has a slightly different API from v4 (removed `isLoading` in favour of `isPending`). Team must read the v5 migration guide before starting.
- **Risk:** Auth token stored in Context (in-memory) is lost on page refresh. The `AuthContext` re-reads from localStorage on mount to restore the session. This is the correct pattern but must be implemented carefully to avoid a flash of the login page on refresh.
