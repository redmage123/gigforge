# ADR-0006: API Design Conventions

## Status: Accepted

## Context

We need consistent conventions for URL structure, response shape, error handling, and validation across all 12 API endpoints. Consistency reduces bugs, makes the frontend easier to build, and makes the API easier to hand off to the client.

## Decision

**REST over versioned URLs (`/api/v1/`), uniform response envelope, Zod validation at all boundaries, PostgreSQL-level search.**

**URL structure:** `/api/v1/<resource>`. Versioning from day one so the client can deploy v2 endpoints alongside v1 without breaking existing integrations. Nginx strips the `/api` prefix before forwarding to Express, so Express routes are `/v1/<resource>`.

**Response envelope:** Every response follows:
```json
{ "data": <payload or null>, "error": <string or null>, "pagination": <object or omitted> }
```
This makes frontend error handling trivial: check `error !== null`, then handle. No guessing whether the payload is nested or flat.

**HTTP status codes used consistently:**
- `200` OK (list, single, update, logout)
- `201` Created (POST contacts, POST tags)
- `204` No Content (DELETE)
- `400` Bad Request (malformed JSON, unknown content-type)
- `401` Unauthorized (missing or invalid JWT)
- `403` Forbidden (attempt to delete system tag)
- `404` Not Found (contact/tag ID not found)
- `409` Conflict (duplicate tag name)
- `422` Unprocessable Entity (Zod validation failure — includes `fields` object with per-field messages)
- `500` Internal Server Error (generic; no stack trace in production)

**Validation:** Zod schemas defined in `src/schemas/` for every endpoint's request body and query parameters. A `validate` middleware factory wraps Zod parse and returns 422 with field-level errors on failure. Zod validation runs before any database query.

**Pagination:** Default 25 results per page, max 100. Response always includes `pagination: { page, limit, total, pages }`. Frontend never needs to fetch all records at once.

**Search:** Full-text search via PostgreSQL `plainto_tsquery` with a GIN index on the contacts table. Implemented at the DB layer — no external search service. Combined `q` (text search) and `tag` (tag filter) parameters are ANDed.

**Routing convention for CSV import/export:** `/contacts/import` and `/contacts/export` are sub-routes of contacts. Express route order matters: these must be registered before `/:id` routes to prevent `import` and `export` being interpreted as contact IDs.

## Alternatives Considered

- **GraphQL** — More flexible querying, ideal for complex nested data. Overkill for 12 endpoints. The frontend has a well-defined data shape; we don't need field-level query flexibility. Adds Apollo Server dependency and significant schema overhead.
- **tRPC** — Type-safe end-to-end RPC. Excellent for TypeScript monorepos. Requires both frontend and backend to share types via a shared package — adds monorepo tooling (Turborepo) complexity that is not justified here.
- **OpenAPI / Swagger** — Valuable for external API consumers. This is an internal API consumed only by our own frontend. We document endpoints in TECH_STACK.md instead. Can be added post-delivery.
- **Flat response shape (no envelope)** — Simpler for simple APIs. Rejected because mixed success/error shapes make TypeScript frontend types messy. The envelope keeps the response type predictable regardless of success or failure state.
- **Cursor-based pagination** — More efficient for real-time data feeds. Offset pagination (`page` + `limit`) is simpler to implement and sufficient for a contact list that changes infrequently.

## Consequences

- **Positive:** Consistent envelope means the frontend can use a single Axios response interceptor for error handling.
- **Positive:** Versioned URLs give the client a safe upgrade path.
- **Positive:** Zod validation provides field-level error messages that map directly to form field error states in React.
- **Negative:** Route ordering for `/contacts/import` vs `/contacts/:id` is a footgun — documented in a comment in `routes/contacts.ts`.
- **Risk:** In-memory token blacklist checked in auth middleware adds one Set.has() call per request. Negligible at 5 concurrent users.
