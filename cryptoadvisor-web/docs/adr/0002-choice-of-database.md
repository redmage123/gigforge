# ADR-0002: No Database — In-Memory Mock Data Only
## Status: Accepted
## Date: 2026-03-22

## Context

Many dashboard projects require a database for user state, preferences, saved alerts, or historical data. We needed to decide whether the CryptoAdvisor Web Dashboard requires any persistent storage.

## Decision

**No database. No localStorage. No IndexedDB. All data is generated at module import time and held in memory for the lifetime of the browser session.**

The mock data modules produce the same data on every page load. There is no user state to persist: no authentication, no saved settings, no custom alert thresholds. The dashboard is a read-only demo.

## Alternatives Considered

**SQLite (via the backend)**
- Would enable persistent alert state, saved transactions, custom watchlists
- Rejected because: there is no backend (see ADR-0001). Adding a backend for SQLite would exceed the sprint scope.

**localStorage for user preferences**
- Persist selected timeframe, active asset, sidebar open/closed state
- Not rejected for future phases — this is a valid enhancement
- Deferred for MVP: the sprint goal is to demonstrate data visualisation. Persistence adds complexity without demonstrating a new UI pattern. The selected asset and timeframe are held in React component state (`useState`) for the duration of a session.

**IndexedDB for transaction history cache**
- Could cache mock transaction data to avoid regenerating it
- Rejected because: mock generation is instantaneous; there is nothing to cache.

**Firebase / Supabase realtime**
- Live price updates via WebSocket subscription
- Rejected because: (1) adds an external service dependency; (2) requires API keys; (3) the project is explicitly offline-capable; (4) the `cryptoadvisor-dashboard` project already demonstrates a WebSocket price feed — this project's value is the React UI layer, not the data transport layer.

## Consequences

- **Positive:** No setup, no migration, no seed scripts. `pnpm dev` works immediately with no external process.
- **Positive:** Single Docker container (nginx only) — no database container needed.
- **Positive:** Tests are fully isolated — no database state leaks between tests.
- **Risk:** Refreshing the page resets all state (selected asset, timeframe). This is expected and acceptable for a demo.
- **Future path:** If user accounts and alert management are added, the service interface in `src/api/` is already structured to accept a backend. The mock modules would be replaced by `fetch()` calls to a real API with no component changes required.
