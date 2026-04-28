# ADR-0009: Mock vs CMS data layer — build-time env toggle

**Status:** Accepted
**Date:** 2026-04-28 (retrofit covering Sprint 4 + Sprint 5)
**Decision driver:** Sprint 4 added a CMS HTTP client; Sprint 5 added a
CoinGecko / Binance live data path. Both needed to coexist with the
existing in-memory mock layer without the frontend becoming an `if/else`
spaghetti maze.

---

## Context

By Sprint 5, the frontend has three potential data sources:

1. **Mock layer** (`src/api/mock/`) — deterministic seeded data; offline-capable;
   the only data source in Sprints 1-3.
2. **CMS HTTP client** (`src/api/cms/`) — typed wrappers for Payload custom
   endpoints; needed for `/api/search`, `/api/calculator/risk`,
   `/api/assets/:symbol`, plus persisted Watchlist + AlertConfigs.
3. **Live exchange APIs** (`src/api/live/`) — CoinGecko `market_chart` for
   OHLCV, Binance WebSocket for last-trade tickers.

Three options were considered for switching between them.

| Option | How | Trade-offs |
|---|---|---|
| **Runtime config** | `localStorage` flag + UI switcher | Most flexible. But two flags × three sources = 9 paths to test; tree-shaking can't strip dead code. |
| **Build-time env flags** | `VITE_CMS_URL`, `VITE_LIVE_PRICES` | Simple. Same code can build a "demo" bundle (no CMS, no live) or a "full-stack" bundle. Tree-shakable. Needs a rebuild to switch. |
| **Separate entry bundles** | `main.demo.tsx` vs `main.live.tsx` | Maximum isolation. But duplicates the bootstrapping; CI doubles. |

---

## Decision

**Use build-time Vite env flags.**

Two flags, both checked once at module load:

| Flag | Source enabled | Used by |
|---|---|---|
| `VITE_CMS_URL` (URL string) | CMS HTTP client | `useCmsApi()`, `searchSignals`, `calculateRisk`, `getAssetBySymbol`, `usePersistedWatchlist`, `usePersistedAlerts` |
| `VITE_LIVE_PRICES=1` | Live data path (CoinGecko + Binance WS) | `dataSource()`, `usePricesSmart`, `useLiveTicker` |

Each module exports a single boolean / function (`useCmsApi()`,
`LIVE_PRICES_ENABLED`, `dataSource()`) that components and hooks call. A
component renders a CMS-dependent surface only when the flag is on; the
mock layer is the unconditional fallback.

When the live path fails (CoinGecko 429, network error), the smart router
in `src/api/live/index.ts` transparently falls back to the mock layer. The
UI never sees a "live mode broken" state — only the badge in the header
flips back to MOCK.

---

## Consequences

### Positive

- **Three deployable configurations from one codebase**:
  - Demo: nothing set → pure mock, offline-capable
  - CMS-backed: `VITE_CMS_URL=...` → search, risk calc, assets, persistence
  - Full live: `+VITE_CMS_URL VITE_LIVE_PRICES=1` → real prices + live ticker + persistence
- **Tree-shakable**: Vite drops the dead branch when the flag is unset, so
  the demo bundle doesn't ship the CMS client or CoinGecko adapter.
- **Single source of truth for env** is `vite-env.d.ts`. The CMS Dockerfile
  passes `VITE_CMS_URL` as a build arg; docker-compose pipes the value
  through.

### Negative

- **Switching modes requires a rebuild.** A user can't toggle live data
  on/off at runtime. For a portfolio demo this is fine; for a real product
  with self-hosted users, runtime config would be needed.
- **Two parallel implementations of similar functions.** `getSignals` (mock)
  and `searchSignals` (CMS) have slightly different shapes — they're not
  drop-in replacements. Sprint 8 STORY-807 plans to unify the types.
- **Tests must stub the env vars.** `setupTests.ts` sets
  `import.meta.env.VITE_CMS_URL` so `useCmsApi()` returns true. New
  flag-dependent tests need to do the same.

### Future enhancements (out of scope)

- Sprint 8 — STORY-807: unify mock and CMS Signal types so both paths
  return the same shape.
- Optional runtime override (e.g. `?source=mock` query param) for QA
  testing without rebuilds.
