# ADR-0007: State Management Strategy
## Status: Accepted
## Date: 2026-03-22

## Context

The dashboard has two distinct categories of state:

1. **Server/async state** — data fetched from the mock layer (portfolio, prices, signals, alerts,
   transactions, watchlist). This state has loading, error, and success phases. It may need to be
   refetched, cached, or shared across multiple components on the same page.

2. **UI/interaction state** — currently selected asset ticker, active timeframe (1D/1W/1M), sort
   column and direction in the transaction table, sidebar open/closed on mobile. This state is local
   to the component or a small subtree.

We needed to decide how to manage both categories — specifically whether a global store (Redux,
Zustand) was warranted, or whether a lighter approach was sufficient.

## Decision

**TanStack Query v5 (React Query) for all async/server state. `useState` and prop drilling for
all UI/interaction state. No global store.**

### How it works

Each domain has a custom hook that wraps `useQuery`:

```typescript
// src/hooks/usePortfolio.ts
export function usePortfolio() {
  return useQuery({
    queryKey: ['portfolio'],
    queryFn: getPortfolio,
    staleTime: 30_000,   // treat as fresh for 30s
  })
}

// src/hooks/usePrices.ts
export function usePrices(asset: Asset, timeframe: Timeframe) {
  return useQuery({
    queryKey: ['prices', asset, timeframe],
    queryFn: () => getPrices(asset, timeframe),
  })
}
```

Components import the hook, never the mock function directly:

```tsx
function PortfolioOverview() {
  const { data, isLoading, isError } = usePortfolio()
  if (isLoading) return <LoadingSkeleton />
  if (isError) return <ErrorBanner />
  return <StatCard value={data.totalValue} ... />
}
```

UI state lives as `useState` in the component closest to where it's needed:

```tsx
// CandlestickChart: timeframe selection is local UI state
const [timeframe, setTimeframe] = useState<Timeframe>('1D')
const [asset, setAsset] = useState<Asset>('BTC')
const { data } = usePrices(asset, timeframe)
```

### QueryClient configuration

```typescript
// src/main.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,          // 1 minute default stale time
      gcTime: 5 * 60_000,         // 5 minutes garbage collection
      retry: 1,                    // one retry on failure
      refetchOnWindowFocus: false, // mock data doesn't change; don't refetch
    },
  },
})
```

`refetchOnWindowFocus: false` is set because the mock data is deterministic — refetching on focus
would trigger unnecessary loading states without producing new data.

## Alternatives Considered

**Redux Toolkit**
- Industry standard for complex client applications with shared mutable state
- Rejected because: (1) all state in this application is either async data (better handled by React
  Query) or local UI state (better handled by useState); (2) Redux adds ~50KB to the bundle and
  requires boilerplate (slices, reducers, actions) that provides no value here; (3) there is no
  shared mutable client state — the mock data does not change; (4) a financial dashboard with mock
  data has none of the use cases that motivate Redux: optimistic updates, complex event sourcing,
  time-travel debugging

**Zustand**
- Lightweight global store (~3KB), minimal boilerplate, TypeScript-friendly
- Rejected because: even Zustand is unnecessary. The only state that could be "global" is the
  currently selected asset/timeframe — but these are per-chart UI states that belong in the chart
  component, not a global store. If a future feature requires sharing the selected asset across
  multiple pages (e.g., clicking a watchlist item sets the chart asset), Zustand would be the
  right addition at that point.

**Jotai / Recoil (atomic state)**
- Granular reactivity, atom-based
- Rejected for the same reasons as Zustand — no shared state problem to solve. Jotai atoms make
  sense for state that is read by many disconnected components; this application has no such state.

**React Context for async data**
- `createContext` + `useReducer` + `useEffect` for fetching
- Rejected because React Query solves this better: it handles caching, deduplication of
  in-flight requests, background refetching, loading/error states, and stale-while-revalidate
  semantics. Reimplementing these in Context is significant work and produces an inferior result.

**React Context for UI state**
- Pass selected asset/timeframe via Context instead of props
- Rejected because: (1) prop drilling is not a problem here — the component tree is shallow
  (Page → Chart → TimeframeSelector is two levels); (2) Context adds indirection that makes
  data flow harder to trace; (3) Context re-renders all consumers on every state change,
  which is wasteful for high-frequency UI state

## Consequences

- **Positive:** React Query handles all loading/error/success states — no manual `isLoading`
  boolean juggling in components.
- **Positive:** React Query deduplicates concurrent requests — two components mounting at the same
  time that both call `usePortfolio()` will share a single in-flight Promise.
- **Positive:** The query key convention (`['prices', asset, timeframe]`) means switching assets
  or timeframes hits the cache if previously loaded, with zero extra code.
- **Positive:** Zero bundle size cost for state management beyond React Query (~13KB gzipped).
- **Positive:** When mock functions are replaced with real `fetch()` calls, the hook and component
  code are unchanged — only the `queryFn` implementation changes.
- **Risk:** React Query must be correctly configured in tests. Components that use `useQuery` hooks
  must be wrapped in a `QueryClientProvider` in test renders. A `renderWithProviders` test helper
  must be defined in `src/setupTests.ts` to avoid repetitive boilerplate.
- **Note:** `staleTime` must be set appropriately. The default (`staleTime: 0`) causes React Query
  to refetch on every component mount, even for mock data. A `staleTime` of 30–60 seconds prevents
  unnecessary re-fetches while keeping the dashboard "live-feeling" if a real backend is later
  connected.
