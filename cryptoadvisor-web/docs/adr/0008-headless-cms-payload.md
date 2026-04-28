# ADR-0008: Headless CMS — Payload v3 over Strapi / Directus

**Status:** Accepted
**Date:** 2026-04-28 (retrofit)
**Decision driver:** Sprint 2-CMS introduced a CMS layer; this ADR documents
why Payload was chosen.

---

## Context

Sprint 2-CMS added a CMS to the project for two purposes:

1. **Content collections** — Assets and Signals catalogues that the React
   frontend can query.
2. **Custom routes** — `/api/search`, `/api/calculator/risk`,
   `/api/assets/:symbol` — endpoints that go beyond what auto-generated CRUD
   can express.

Three open-source headless CMS contenders were evaluated:

| | Payload v3 | Strapi v5 | Directus 11 |
|---|---|---|---|
| Language | TypeScript-native | TypeScript (mostly) | Node + Vue |
| Config style | Code-first (`payload.config.ts`) | UI-first + JSON exports | UI-first |
| Custom endpoints | First-class `Endpoint` type | Plugin/policy pattern | Hooks + flows |
| Database adapters | SQLite, Postgres, Mongo | SQLite, Postgres, MySQL, Mongo | Postgres, MySQL, SQLite |
| Self-host story | npm install, single process | npm install, single process | Docker image preferred |
| TypeScript types | `payload generate:types` | OK with v5 | Auto-introspect via SDK |
| Free tier limits | None (MIT, fully self-hosted) | None | None |
| Community size (2026-04) | mid (~30k stars) | large (~65k stars) | mid (~28k stars) |

---

## Decision

**Use Payload v3.**

Payload was chosen for these reasons:

1. **Code-first config** — `payload.config.ts` is the source of truth.
   Collections, fields, access control, and custom endpoints all live in
   TypeScript, so they version-control naturally and refactor through the
   same tooling as the rest of the codebase. Strapi's UI-first config drifts
   in its export JSON; Directus stores config in the database.
2. **First-class custom endpoints** — Payload's `Endpoint` type returns a
   standard `Response`, so the three custom routes shipped in Sprint 2-CMS
   read like regular Express handlers. Strapi requires plugin scaffolding
   for the same surface; Directus models them as flows or hooks.
3. **TypeScript-native** — `req.payload.find()` is fully typed end-to-end,
   and `payload generate:types` produces a `payload-types.ts` file used by
   the frontend. Strapi v5 improved here but is not as deeply typed.
4. **Single-process self-host** — `npm run dev` is the entire deploy story
   for the demo. Adds one container to docker-compose; no external services.

---

## Consequences

### Positive

- Single-language stack (TypeScript everywhere).
- Code review covers CMS config + custom routes uniformly.
- `payload-types.ts` autogen unifies frontend + CMS types (Sprint 6
  STORY-604 wires this into `prebuild`).

### Negative / Trade-offs

- **Smaller community** than Strapi. Some Stack Overflow answers are
  Payload v2 era and don't apply to v3.
- **Production deployment requires a Next.js scaffold.** Payload v3
  bundles `@payloadcms/next` and is intended to run as a Next.js app
  (`src/app/(payload)/admin/[[...segments]]/page.tsx`, etc.). The Sprint 2
  scaffold is config-only (no Next.js app router), so the production
  Dockerfile shipped in Sprint 6 STORY-601 currently runs `payload dev`
  with `NODE_ENV=production` set rather than `next start`. Adding the full
  Next.js scaffold is queued as future work; the current setup is
  acceptable for the portfolio demo but not for paying customers.
- **`payload dev` in production is a known compromise.** Documented above.
  Resolution path: add the minimal Next.js app router files (handful of
  route shims that re-export Payload's request handlers) and switch the
  runtime command to `next start`.

### Future enhancements (out of scope for this ADR)

- Add Next.js scaffold for true production `next build && next start`.
- Migrate from SQLite to Postgres if multi-process scaling is needed.
- Evaluate Payload Cloud if self-hosting becomes a maintenance burden.
