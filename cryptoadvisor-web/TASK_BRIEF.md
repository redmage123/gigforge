# TASK BRIEF — Custom API Routes (CryptoAdvisor Web CMS)

**Project:** CryptoAdvisor Web Dashboard
**Practice:** AI & Automation / Programming
**Navigator:** gigforge-engineer
**Driver:** gigforge-dev-backend
**Sprint:** Sprint 2 — CMS Layer & Custom Routes
**Date:** 2026-03-23

---

## Context

The previous sprint (Sprint 1) delivered the frontend layout shell: routing,
dark mode, i18n (EN/HR), sidebar, mobile nav. All dashboard data comes from a
typed in-memory mock layer at `src/api/mock/` — no real backend exists yet.

`cms/` contains a **stub** Payload CMS with `collections: []` and no database
adapter configured. This sprint has two parts:

**Part A — Bootstrap the Payload CMS** (prerequisite, ~1h):
Define the minimum collections the custom routes depend on: `Assets` and
`Signals`. Wire up the SQLite adapter (no PostgreSQL needed — this is a
frontend portfolio demo, not a production service).

**Part B — Add three custom routes** (~3h):
Add routes to the Payload Express server that go beyond what Payload's
auto-generated CRUD REST + GraphQL can express:

1. **Signal full-text search** — `GET /api/search` — rank signals by
   relevance to a query string; Payload's `where` filter does substring
   matching but cannot rank or score results.
2. **Portfolio risk calculator** — `GET /api/calculator/risk` — compute
   concentration risk (Herfindahl–Hirschman Index), diversification score,
   and a risk tier label from a client-supplied allocation; pure maths, no DB.
3. **Asset symbol lookup** — `GET /api/assets/:symbol` — look up an asset
   by its ticker symbol (e.g. `BTC`); Payload's `GET /api/assets/:id` uses
   internal auto-increment IDs, not human-friendly symbols.

> **Navigator note:** The original route names from the brief ("court fee
> calculator", "jurisdiction lookup") are from a different project context.
> In the CryptoAdvisor domain they map to **portfolio risk calculator** and
> **asset symbol catalogue** respectively. The structural contract is identical:
> one route is pure computation (no DB), one is a typed static/DB catalogue
> with filtering by a human-readable key rather than an internal ID.

---

## Part A — Bootstrap the Payload CMS

### A-1: Configure the database adapter — `cms/payload.config.ts`

Replace the stub with a working SQLite adapter. The frontend demo must run
with `docker compose up` and no external database:

```typescript
import { buildConfig } from 'payload'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'

import { Assets }  from './src/collections/Assets'
import { Signals } from './src/collections/Signals'

export default buildConfig({
  admin:   { user: 'users' },
  editor:  lexicalEditor({}),
  collections: [Assets, Signals],
  globals:     [],
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL ?? 'file:./cms.sqlite' },
  }),
  secret: process.env.PAYLOAD_SECRET ?? 'change-me-in-dev',
  typescript: { outputFile: 'src/payload-types.ts' },
})
```

Install `@payloadcms/db-sqlite` and `@libsql/client` if absent:
```bash
cd cms && npm install @payloadcms/db-sqlite @libsql/client
```

### A-2: `Assets` collection — `cms/src/collections/Assets.ts`

A catalogue of supported crypto assets. Used by the asset lookup route.

```
slug: 'assets'
fields:
  - name: text, required (e.g. "Bitcoin")
  - symbol: text, required, unique (e.g. "BTC") — the human key; indexed
  - description: textarea, optional
  - riskTier: select ['low', 'medium', 'high'], required, defaultValue: 'medium'
  - exchanges: array of text (e.g. ["Binance", "Coinbase", "Kraken"])
  - marketCapTier: select ['large', 'mid', 'small'], required, defaultValue: 'large'
  - chain: text, optional (e.g. "Bitcoin", "Ethereum", "Solana")
  - isActive: checkbox, required, defaultValue: true
access:
  read: () => true          # public — frontend reads this
  create/update/delete: admin only
admin:
  useAsTitle: 'name'
  defaultColumns: ['name', 'symbol', 'riskTier', 'marketCapTier', 'isActive']
```

**Seed data** (add via `afterInit` hook or a seed script — at minimum these 6):

| name | symbol | riskTier | marketCapTier | chain |
|------|--------|----------|---------------|-------|
| Bitcoin | BTC | low | large | Bitcoin |
| Ethereum | ETH | low | large | Ethereum |
| Solana | SOL | medium | large | Solana |
| Cardano | ADA | medium | mid | Cardano |
| Avalanche | AVAX | high | mid | Avalanche |
| Chainlink | LINK | high | small | Ethereum |

### A-3: `Signals` collection — `cms/src/collections/Signals.ts`

AI-generated trading signals. Used by the search route.

```
slug: 'signals'
fields:
  - assetSymbol: text, required (e.g. "BTC") — denormalized for speed; not a relationship
  - assetName: text, required (e.g. "Bitcoin")
  - direction: select ['BUY', 'SELL', 'HOLD'], required
  - confidence: number (integer), required, min: 0, max: 100
  - reason: textarea, required — the full natural-language reason text (FTS target)
  - generatedAt: date, required, defaultValue: now
  - expiresAt: date, optional
access:
  read: () => true          # public — frontend reads this
  create/update/delete: admin only
admin:
  useAsTitle: 'reason'
  defaultColumns: ['assetSymbol', 'direction', 'confidence', 'generatedAt']
```

**Seed data** (5+ signals):

| assetSymbol | direction | confidence | reason |
|-------------|-----------|------------|--------|
| BTC | BUY | 82 | RSI below 30 on the weekly chart; MACD bullish crossover forming; on-chain accumulation by long-term holders increasing. |
| ETH | HOLD | 61 | Price consolidating in the $3,100–$3,300 range; staking yield stable; gas fees trending down post-Dencun. Await breakout confirmation. |
| SOL | BUY | 74 | Network TPS hitting all-time highs; DeFi TVL growing; technical pattern shows cup-and-handle breakout in progress. |
| ADA | SELL | 55 | Project roadmap delivery repeatedly delayed; declining developer activity on GitHub; price rejected from 200-day MA. |
| AVAX | BUY | 68 | Subnet ecosystem expansion; institutional interest increasing; relative strength vs BTC improving over 30-day window. |

---

## Part B — Custom Routes

### Files to Create / Modify

**New collection files (Part A):**
```
cms/src/collections/Assets.ts
cms/src/collections/Signals.ts
```

**New route files:**
```
cms/src/routes/search.ts          — Signal full-text search
cms/src/routes/riskCalculator.ts  — Portfolio risk calculator
cms/src/routes/assetLookup.ts     — Asset symbol lookup
cms/src/routes/index.ts           — Barrel re-export
```

**Modify:**
```
cms/payload.config.ts             — Register collections + endpoints
```

---

## Route Specifications

---

### Route 1: Signal Full-Text Search — `GET /api/search`

**Auth:** None required (signals are public).

**Query parameters (validate all):**

| Param | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `q` | string | YES | — | min 1 char |
| `direction` | string | No | all | enum `BUY\|SELL\|HOLD` if present |
| `limit` | integer | No | 10 | min 1, max 50 |
| `minConfidence` | integer | No | 0 | 0–100 |

**Behaviour:**

1. Validate params. `q` missing/empty → `422`.
2. Fetch all `Signals` via `req.payload.find({ collection: 'signals', limit: 1000 })`.
3. Filter in-memory:
   - Case-insensitive substring match on `reason` OR `assetName` OR `assetSymbol`.
   - If `direction` provided, also filter by direction.
   - If `minConfidence` provided, exclude signals below threshold.
4. Score each match: assign `score = 2` if `assetSymbol` matches, `score = 1.5`
   if `assetName` matches, `score = 1` for `reason` match only. Signals matching
   multiple fields sum their scores.
5. Sort descending by score, then by `confidence` descending as tiebreaker.
6. Apply `limit` after sorting.
7. Return results with the matched field annotated.

**Success — `200 OK`:**
```json
{
  "query": "bitcoin accumulation",
  "direction": null,
  "minConfidence": 0,
  "results": [
    {
      "id": "...",
      "assetSymbol": "BTC",
      "assetName": "Bitcoin",
      "direction": "BUY",
      "confidence": 82,
      "reason": "RSI below 30 on the weekly chart; on-chain accumulation by long-term holders increasing.",
      "generatedAt": "2026-03-23T00:00:00.000Z",
      "score": 3.0,
      "matchedFields": ["assetName", "reason"]
    }
  ],
  "count": 1
}
```

Empty results → `200` with `results: []`, `count: 0` — **never `404`**.

**Acceptance criteria:**

- [ ] `GET /api/search?q=bitcoin` → `200`, BTC signals ranked first
- [ ] `GET /api/search?q=bitcoin&direction=SELL` → only SELL signals for BTC
- [ ] `GET /api/search?q=bitcoin&minConfidence=70` → signals with confidence ≥ 70
- [ ] `GET /api/search` (no `q`) → `422`, error on `q` field
- [ ] `GET /api/search?q=nomatch` → `200`, `results: []`, `count: 0`
- [ ] `GET /api/search?q=bitcoin&limit=1` → at most 1 result
- [ ] `GET /api/search?q=bitcoin&direction=INVALID` → `422`
- [ ] `GET /api/search?q=bitcoin&limit=51` → `422`
- [ ] Results sorted by score descending; ties broken by confidence descending
- [ ] `matchedFields` array correctly identifies which field triggered the match

---

### Route 2: Portfolio Risk Calculator — `GET /api/calculator/risk`

**Auth:** None required (public endpoint, pure computation).

**No database access — pure maths.**

**Query parameters:**

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `allocations` | string | YES | Comma-separated `SYMBOL:PCT` pairs, e.g. `BTC:42,ETH:22,SOL:14,ADA:7,USD:15` |
| `currency` | string | No | Default `USD`; display label only, no conversion |

**Behaviour:**

1. Parse `allocations` into `{ symbol: string, pct: number }[]`.
2. Validate:
   - Each `pct` ≥ 0.
   - `pct` values sum to 100 (±0.5 rounding tolerance).
   - At least 1 asset.
   - At most 20 assets.
   - No duplicate symbols.
3. Compute **Herfindahl–Hirschman Index (HHI)**:
   ```
   HHI = sum((pct / 100)²)  for each asset
   ```
   - HHI near 1.0 = maximum concentration (all in one asset)
   - HHI near 0.0 = perfectly distributed
4. Compute **diversification score** (0–100, higher = more diversified):
   ```
   diversificationScore = round((1 - HHI) * 100, 1)
   ```
5. Assign **risk tier** based on HHI:
   ```
   HHI ≥ 0.50  → "high"
   HHI ≥ 0.25  → "medium"
   HHI < 0.25  → "low"
   ```
6. Identify **largest position** (highest `pct`).
7. Return breakdown.

**Success — `200 OK`:**
```json
{
  "currency": "USD",
  "allocations": [
    { "symbol": "BTC", "pct": 42 },
    { "symbol": "ETH", "pct": 22 },
    { "symbol": "SOL", "pct": 14 },
    { "symbol": "ADA", "pct": 7 },
    { "symbol": "USD", "pct": 15 }
  ],
  "hhi": 0.2618,
  "diversificationScore": 73.8,
  "riskTier": "medium",
  "largestPosition": { "symbol": "BTC", "pct": 42 },
  "assetCount": 5,
  "breakdown": "HHI of 0.2618 indicates moderate concentration. BTC represents 42% of the portfolio."
}
```

**Example calculations (driver must verify these exact outputs):**

| Input | Expected HHI | Expected riskTier |
|-------|-------------|-------------------|
| `BTC:100` | `1.0` | `high` |
| `BTC:50,ETH:50` | `0.50` | `high` |
| `BTC:34,ETH:33,SOL:33` | `0.3334` | `medium` |
| `BTC:25,ETH:25,SOL:25,ADA:25` | `0.25` | `medium` |
| `BTC:20,ETH:20,SOL:20,ADA:20,USD:20` | `0.20` | `low` |

**Error cases:**

| Condition | Code | Error message |
|-----------|------|---------------|
| `allocations` missing | `422` | `"allocations is required"` |
| Percentages don't sum to 100 ± 0.5 | `422` | `"Allocations must sum to 100 (got X.X)"` |
| Any `pct` < 0 | `422` | `"Allocation percentages must be non-negative"` |
| Duplicate symbol | `422` | `"Duplicate symbol: BTC"` |
| > 20 assets | `422` | `"Maximum 20 assets allowed"` |
| Malformed pair (e.g. `BTC`) | `422` | `"Invalid allocation format: BTC"` |
| `pct` is non-numeric | `422` | `"Invalid allocation percentage: abc"` |

**Acceptance criteria:**

- [ ] `BTC:100` → `hhi === 1.0`, `riskTier === "high"`, `diversificationScore === 0`
- [ ] `BTC:50,ETH:50` → `hhi === 0.5`, `riskTier === "high"`
- [ ] `BTC:25,ETH:25,SOL:25,ADA:25` → `hhi === 0.25`, `riskTier === "medium"`, `diversificationScore === 75`
- [ ] `BTC:20,ETH:20,SOL:20,ADA:20,USD:20` → `hhi === 0.2`, `riskTier === "low"`
- [ ] Missing `allocations` → `422`
- [ ] Sum ≠ 100 → `422` with correct message
- [ ] Duplicate symbol → `422` naming the duplicate
- [ ] Tests in `riskCalculator.test.ts` cover all five reference calculations above (zero mocks — pure functions)

---

### Route 3: Asset Symbol Lookup — `GET /api/assets/:symbol`

**Auth:** None required (assets are public).

**Path param:** `:symbol` — the ticker symbol (e.g. `BTC`, `ETH`). Case-insensitive — normalise to uppercase before querying.

**Behaviour:**

Payload's auto-generated `GET /api/assets/:id` uses the internal numeric ID.
This route allows lookup by human-friendly symbol:

1. Uppercase the `:symbol` param.
2. Query: `req.payload.find({ collection: 'assets', where: { symbol: { equals: symbol }, isActive: { equals: true } }, limit: 1 })`
3. If no document found → `404`.
4. Return the single document, augmented with a `signals` summary (count by direction).

**Response — `200 OK`:**
```json
{
  "id": "1",
  "name": "Bitcoin",
  "symbol": "BTC",
  "description": "The original peer-to-peer electronic cash system.",
  "riskTier": "low",
  "marketCapTier": "large",
  "chain": "Bitcoin",
  "exchanges": ["Binance", "Coinbase", "Kraken"],
  "isActive": true,
  "signalsSummary": {
    "total": 3,
    "BUY": 2,
    "SELL": 0,
    "HOLD": 1
  }
}
```

**The `signalsSummary` is computed by fetching from the `Signals` collection:**
```
payload.find({ collection: 'signals', where: { assetSymbol: { equals: symbol } } })
```
Count by direction. This is data Payload's CRUD cannot compute without a custom aggregation.

**Also expose a catalogue route:** `GET /api/assets` (no path param)

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `riskTier` | string | No | filter: `low\|medium\|high` |
| `marketCapTier` | string | No | filter: `large\|mid\|small` |
| `q` | string | No | substring match on `name` or `symbol` |

Returns all matching active assets (no pagination needed — catalogue is small).

```json
{
  "assets": [
    { "symbol": "BTC", "name": "Bitcoin", "riskTier": "low", "marketCapTier": "large" }
  ],
  "count": 1
}
```

**Acceptance criteria:**

- [ ] `GET /api/assets/BTC` → `200` with Bitcoin record + `signalsSummary`
- [ ] `GET /api/assets/btc` → `200` (case-insensitive)
- [ ] `GET /api/assets/UNKNOWN` → `404`
- [ ] `GET /api/assets` → `200` with all 6 seeded active assets
- [ ] `GET /api/assets?riskTier=low` → only low-risk assets
- [ ] `GET /api/assets?marketCapTier=large` → only large-cap assets
- [ ] `GET /api/assets?q=bit` → assets whose name/symbol contains "bit" (case-insensitive)
- [ ] `signalsSummary.total` equals `BUY + SELL + HOLD` counts
- [ ] `signalsSummary` counts match actual seeded signal data

---

## ADR Decisions to Follow

### ADR-0003 (implied): TypeScript 5, strict mode
- All route files are `.ts` — no `.js`
- `"strict": true` — no `any`; use generated `payload-types.ts` once available
- If `payload-types.ts` is not generated yet, use `Record<string, unknown>` as
  a temporary type and replace with generated types after first `npm run dev`

### ADR (frontend) — Mock data layer is NOT replaced
The `src/api/mock/` layer in the React frontend is **not modified**. The Payload
CMS API is an independent service. In a future phase, `src/api/index.ts` could
switch from mock functions to real `fetch()` calls to Payload. That swap is
**explicitly out of scope for this brief**.

### Payload v3 custom endpoint pattern
```typescript
import type { Endpoint, PayloadRequest } from 'payload'

export const myRoute: Endpoint = {
  path: '/my-route',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.url) return Response.json({ error: 'Bad request' }, { status: 400 })
    const url = new URL(req.url)
    // ... logic ...
    return Response.json({ result: 'ok' })
  },
}
```

Register in `payload.config.ts`:
```typescript
endpoints: [searchRoute, riskCalculatorRoute, assetLookupRoute, assetCatalogueRoute]
```

### Error envelope
All `4xx/5xx` responses must return consistent JSON:
```json
{
  "error": {
    "message": "Human-readable message",
    "status": 422,
    "errors": [{ "field": "allocations", "message": "Allocations must sum to 100 (got 95.0)" }]
  }
}
```
`errors` array only on `422`. Other status codes: `message` and `status` only.

---

## Testing Strategy

### Test files to create

```
cms/src/routes/search.test.ts
cms/src/routes/riskCalculator.test.ts
cms/src/routes/assetLookup.test.ts
```

### `riskCalculator.test.ts` — zero mocks (pure functions)

Extract the computation logic into a standalone function:
```typescript
// riskCalculator.service.ts (extract from route handler)
export function computeRisk(allocations: { symbol: string; pct: number }[]): RiskResult
```

Test this function directly — no HTTP layer, no Payload instance needed:
```typescript
import { computeRisk } from './riskCalculator.service'

test('single asset = maximum concentration', () => {
  const result = computeRisk([{ symbol: 'BTC', pct: 100 }])
  expect(result.hhi).toBe(1.0)
  expect(result.riskTier).toBe('high')
  expect(result.diversificationScore).toBe(0)
})
```

Cover all five reference calculations from the Route 2 spec table.

### `search.test.ts` — mock Payload `find`

```typescript
const mockFind = jest.fn()
const mockPayload = { find: mockFind } as unknown as Payload

// call handler with a mock PayloadRequest
const req = { url: 'http://localhost/api/search?q=bitcoin', payload: mockPayload } as PayloadRequest
```

### `assetLookup.test.ts` — mock Payload `find`

Test the symbol normalisation (lowercase input → uppercase query), the 404
path, and the `signalsSummary` aggregation logic.

### TDD order (mandatory)
1. **RED** — write all test assertions; they fail (route files don't exist yet)
2. **GREEN** — create route files + service functions until all pass
3. **VERIFY** — `cd cms && npx tsc --noEmit` exits 0

---

## Gotchas & Constraints

### G-01 — `@payloadcms/db-sqlite` NOT `better-sqlite3` directly
Use the official Payload adapter. Do not import `better-sqlite3` directly — Payload wraps it. The `client.url` uses libsql format: `"file:./cms.sqlite"` for a local file.

### G-02 — Payload v3 handler receives `PayloadRequest`, returns `Response`
There is no `res` argument. Use `Response.json({...}, { status: 200 })` or `new Response(text, { headers: { 'Content-Type': 'text/plain' } })`.

### G-03 — Parse query params with `new URL(req.url)`
```typescript
const url = new URL(req.url)
const q   = url.searchParams.get('q') ?? ''
```

### G-04 — `req.payload` is the live Payload instance
Inside a custom endpoint handler, `req.payload.find(...)` is how you query. Do not import Payload's `getPayload` separately — use `req.payload`.

### G-05 — SQLite file is created at CMS startup
On first `npm run dev`, Payload will create `cms/cms.sqlite` and run its own schema migrations. Do NOT commit this file. Add `cms/*.sqlite` to `.gitignore`.

### G-06 — Seed data must be idempotent
If you use an `afterInit` hook to seed, check if assets already exist before inserting. Seeding twice must not error.

### G-07 — HHI precision in tests
Floating-point maths means `BTC:34,ETH:33,SOL:33` produces `0.3334` not exactly `1/3`. Use `expect(result.hhi).toBeCloseTo(0.3334, 3)` in Jest.

### G-08 — Route path prefix is `/api` (Payload adds it)
A route with `path: '/search'` is reachable at `http://localhost:3001/api/search`. Do NOT include `/api` in the path string you define in the route object.

### G-09 — Asset symbol in Signals is denormalized
`Signals.assetSymbol` is a plain text field, not a `relationship` to `Assets`. This keeps queries simple — there is no JOIN needed for the `signalsSummary` aggregation. The trade-off (possible inconsistency) is acceptable for a demo CMS.

### G-10 — `isActive` filter in asset lookup
Only return assets where `isActive === true`. Inactive assets (soft-deleted) must not appear in the catalogue or symbol lookup route.

### G-11 — Payload's `Users` collection is required for `admin.user`
Even if you don't expose a user management UI, Payload requires a `users` collection when `admin.user: 'users'` is set. Add a minimal `Users` collection with `auth: true` if not already present. Alternatively, set `admin: { user: undefined }` to disable the admin UI entirely — but then the admin panel won't work. Keep the admin panel functional.

### G-12 — The React frontend is NOT changed
`src/api/mock/` and all `src/` files are unchanged. The Payload CMS is an independent service. The only deliverable in `src/` is adding the CMS port to `.env.example` as `CMS_URL=http://localhost:3001`.

---

## Definition of Done

**Part A — CMS Bootstrap:**
- [ ] `cms/payload.config.ts` — SQLite adapter, `Assets` + `Signals` collections registered
- [ ] `cms/src/collections/Assets.ts` — created, compiles cleanly
- [ ] `cms/src/collections/Signals.ts` — created, compiles cleanly
- [ ] `cd cms && npm run dev` — starts without errors
- [ ] `http://localhost:3001/admin` — loads the Payload admin UI
- [ ] `GET http://localhost:3001/api/assets` — returns `200` (empty array before seed)
- [ ] `GET http://localhost:3001/api/signals` — returns `200` (empty array before seed)
- [ ] Seed data loaded: 6 assets + 5 signals visible in admin UI
- [ ] `cms/*.sqlite` added to `.gitignore`

**Part B — Custom Routes:**
- [ ] `cms/src/routes/search.ts` — created
- [ ] `cms/src/routes/riskCalculator.ts` + `riskCalculator.service.ts` — created
- [ ] `cms/src/routes/assetLookup.ts` — created (handles both `/:symbol` and `/`)
- [ ] `cms/payload.config.ts` — `endpoints` array includes all routes
- [ ] `cd cms && npx tsc --noEmit` exits 0 — zero TypeScript errors
- [ ] `grep -r ': any' cms/src/routes/` returns zero results
- [ ] All acceptance criteria in Route 1, 2, 3 specs pass (manual smoke tests)
- [ ] `riskCalculator.test.ts` — all five reference calculations pass with zero mocks
- [ ] `search.test.ts` + `assetLookup.test.ts` — tests pass
- [ ] `cd cms && npm test` exits 0

**Frontend:**
- [ ] `src/` unchanged — `pnpm test --run` still exits 0
- [ ] `.env.example` in project root updated to include `CMS_URL=http://localhost:3001`
- [ ] Handoff written to `memory/handoffs/` before marking done
