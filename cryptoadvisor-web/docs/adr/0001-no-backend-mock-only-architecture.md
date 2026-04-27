# ADR-0001: No Backend — Mock-Only Architecture
## Status: Accepted
## Date: 2026-03-22

## Context

The CryptoAdvisor Web Dashboard is a portfolio demo for an internal audience. It needs to show realistic financial data: portfolio value, OHLCV candlestick charts, AI trading signals, price alerts, transaction history, and a watchlist.

Real financial data requires API keys (CoinGecko, Binance, Alpha Vantage, etc.) that cost money, impose rate limits, and create external service dependencies that could break the demo. The client requirements explicitly state "mock API data — no real crypto API needed."

We needed to decide how to structure the data layer.

## Decision

**The project has no server process. All data is served from a typed in-memory mock layer (`src/api/mock/`) inside the React application.**

Each mock module exports an async function that returns typed `Promise<T>` with a 150ms artificial delay. Components never call mock functions directly — they use React Query hooks that wrap the mock services. The public interface (`src/api/index.ts`) is identical to what a real HTTP client would export: same function signatures, same return types.

This means a backend can be added in a future phase by replacing only the implementation inside `src/api/mock/` — component code and hook code are unchanged.

## Alternatives Considered

**Express/Node.js mock API server (separate Docker service)**
- Serves data over HTTP; the frontend calls `fetch('/api/portfolio')` exactly as it would in production
- More realistic demonstration of a full-stack architecture
- Rejected because: (1) adds a second container and Docker Compose complexity; (2) adds ~20h of backend work (server setup, routes, TypeScript compilation, tests) for data that is static; (3) the sprint budget is ~40h focused entirely on UI; (4) the `cryptoadvisor-dashboard` project (FastAPI/Python) already exists in the portfolio to demonstrate a crypto API backend; this project's purpose is to demonstrate the React frontend layer

**JSON Server (auto-REST from a JSON file)**
- `json-server --watch db.json` gives a zero-code mock REST API
- Rejected because: (1) still requires a second Docker service; (2) no TypeScript types; (3) no control over response shape, delays, or derived values (e.g., calculated P&L)

**Real crypto API (CoinGecko free tier)**
- Would show live data
- Rejected because: (1) requires API key management; (2) rate-limited; (3) the dashboard must work offline for demos and CI; (4) live prices change every second — screenshots in the README would become stale; (5) explicit client requirement: no real API

**MSW (Mock Service Worker)**
- Intercepts `fetch()` calls at the network level, returns mock responses
- Closest to real HTTP without a server
- Considered but deferred: MSW adds configuration complexity (service worker registration, handler definitions) that provides marginal benefit over async mock functions for a project that will never call real HTTP endpoints. MSW is the right choice if/when a real backend is added and the team wants to toggle between real and mock without changing hook code.

## Consequences

- **Positive:** Zero external dependencies — the app runs 100% offline. CI never fails due to a flaky API.
- **Positive:** Sprint is entirely focused on UI quality. No backend work competes for bandwidth.
- **Positive:** The service interface abstraction (`src/api/index.ts`) means adding a real backend later is a contained change.
- **Positive:** Deterministic data — tests are reproducible; screenshots are stable.
- **Risk:** The mock layer is not a full HTTP integration test. There is no guarantee that the fetch layer works until a real backend is connected. Mitigated by: designing the service interface to match REST conventions exactly (URL paths, verb semantics).
- **Note:** The 150ms artificial delay is mandatory. It ensures loading skeletons are visible and tested. Setting it to 0 would make the loading state invisible in development, leading to untested code paths.
