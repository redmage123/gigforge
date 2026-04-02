# ADR-0001: Choice of Backend Language and Framework

## Status: Accepted

## Context

We need to select a backend language and HTTP framework for a contact management API serving 5 internal users, up to 10,000 contacts, with JWT auth, PostgreSQL, CSV import/export, and full-text search. The client explicitly requested Node.js/Express. The project has a 2-week delivery timeline and a 2,000 EUR budget.

## Decision

**TypeScript (Node.js 22 LTS) with Express 4.**

The client specified both Node.js and Express. We honour that preference — it's technically sound for this workload. We layer TypeScript on top because this is a deliverable the client will maintain long-term; type safety catches an entire class of runtime bugs at compile time and makes the codebase far easier to onboard new developers into.

Node 22 LTS has active support through 2027. Express 4 is stable, battle-tested, and has zero magic — every route, middleware, and error handler is explicit and readable. No framework lock-in means the client can hire any Node.js developer to extend the app.

## Alternatives Considered

- **Python / FastAPI** — Excellent framework, great type hints, but the client specifically asked for Node.js. Introducing Python would require a separate runtime in Docker, adding operational complexity for a non-technical team.
- **Go / Gin** — Superior performance and a single binary deployment, but significant ramp-up cost within a 2-week window, and the client has no Go expertise.
- **NestJS** — More opinionated, better-structured for large teams, but the overhead of decorators, modules, and DI containers is unnecessary for an API with 10 endpoints. Express gives us the same result with 80% less boilerplate.
- **Fastify** — Marginally faster than Express, but the client asked for Express specifically and the performance difference is irrelevant at this scale (5 concurrent users).

## Consequences

- **Positive:** Client's team can maintain the codebase without learning a new language. Strong npm ecosystem for all dependencies. Existing team familiarity (we've shipped todo-rest-api, saas-billing-api, job-board on the same stack).
- **Positive:** TypeScript catches type mismatches between DB query results and API response shapes at build time.
- **Negative:** Express 4 has no built-in validation, structured logging, or OpenAPI generation — we compensate with Zod (validation) and a consistent response envelope convention.
- **Risk:** Express 5 is in release candidate; we pin to Express 4 for stability. A future migration is straightforward.
