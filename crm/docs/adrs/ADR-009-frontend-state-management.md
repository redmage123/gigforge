---
id: ADR-009
title: Frontend State Management
status: accepted
date: 2026-03-16
deciders: gigforge-dev-frontend, gigforge-engineer
---

# ADR-009: Frontend State Management

## Context

The CRM frontend needs a strategy for:
- Server state (API data): contacts, deals, pipelines, tasks, activities, companies
- Async lifecycle: loading / error / stale / refresh
- Optimistic updates (drag-and-drop deal stage changes)
- Cache invalidation across pages (e.g. creating a deal refreshes the pipeline)

Options evaluated:

| Option | Pros | Cons |
|--------|------|------|
| **React Query (TanStack Query)** | Purpose-built server-state cache, optimistic update API, background refetch, stale-while-revalidate, devtools | Adds dependency (~13kb gzipped) |
| **SWR** | Lightweight, simple | Less powerful mutation/optimistic API, no query invalidation by key |
| **Redux Toolkit (RTK Query)** | Full feature set, good TS | Heavy for this scale; overkill for a single-tenant CRM |
| **useState + useEffect (current)** | Zero deps, already in use | No caching, no deduplication, manual loading/error everywhere, hard to invalidate related queries |

## Decision

**Use TanStack React Query v5** for all server-state management.

Rationale:
1. The deal Kanban requires optimistic updates with rollback — React Query's `useMutation` + `onMutate/onError/onSettled` pattern handles this cleanly.
2. Stale-while-revalidate means list pages stay responsive without manual `useEffect` refresh.
3. Query invalidation (`queryClient.invalidateQueries`) lets us refresh the pipeline automatically after a deal is created in a modal.
4. The existing `apiFetch` wrapper integrates trivially with `queryFn`.

## Local UI State

Keep in `useState`:
- Modal open/close flags
- Form field values
- Active drag ID
- Side panel open state

These are ephemeral UI state that don't need caching.

## Migration Strategy

Sprint 2: Apply React Query to `DealPipelinePage` (US-401) as the primary use case.
Sprint 3+: Migrate remaining pages incrementally — no flag-day rewrite.

## Consequences

- All new components in Sprint 2+ must use `useQuery` / `useMutation` instead of bare `useEffect` + `useState` pairs.
- `QueryClientProvider` must wrap the app in `main.tsx`.
- `apiFetch` remains the transport; React Query owns caching and lifecycle only.
