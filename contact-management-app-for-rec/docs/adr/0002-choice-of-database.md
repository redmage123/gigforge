# ADR-0002: Choice of Database

## Status: Accepted

## Context

The application needs to store ~3,000 contacts growing to ~10,000, with a many-to-many relationship between contacts and tags, full-text search across name/email/company, and bulk CSV import. The client explicitly requested PostgreSQL.

## Decision

**PostgreSQL 16 with the `pg` (node-postgres) driver. No ORM.**

PostgreSQL is the correct choice for this data model. The contact↔tag relationship requires a join table (`contact_tags`) with FK constraints — relational integrity that must be enforced at the database level, not in application code. PostgreSQL's GIN index with `tsvector` gives us sub-200ms full-text search across 10,000 rows without a separate search service. ACID transactions ensure CSV bulk imports are atomic (either all rows commit or none do).

We use raw SQL via `pg` rather than an ORM. At 10 endpoints, an ORM (Prisma, TypeORM, Sequelize) adds abstraction overhead and makes the GIN index query harder to express. Raw SQL is transparent, debuggable, and the queries can be handed directly to the client's DBA if needed.

## Alternatives Considered

- **SQLite** — Would work at this scale for reads, but lacks: GIN full-text search indexes, concurrent write safety (5 users editing simultaneously), `plainto_tsquery` search syntax, and pg-specific JSON features. Not worth the limitations when PostgreSQL is specified.
- **MongoDB** — Document model is a poor fit. Tags as embedded arrays would make the "filter all contacts by tag" query expensive without a proper index strategy. No ACID transactions for bulk import. Schema-less adds no value here — the data model is well-defined.
- **MySQL/MariaDB** — A reasonable alternative, but the client asked for PostgreSQL. Full-text search in MySQL uses FULLTEXT indexes rather than GIN/tsvector, and the query syntax differs. Not worth deviating.
- **Prisma ORM** — Good developer experience, but generates complex SQL for join queries that's hard to optimise. The GIN index full-text search query (`to_tsvector`, `plainto_tsquery`, `@@`) is not expressible in Prisma's query API — we'd fall back to `$queryRaw` anyway. Better to own the SQL from the start.

## Consequences

- **Positive:** GIN index ensures full-text search performance at 10,000+ contacts without a separate Elasticsearch/Meilisearch service.
- **Positive:** FK constraints enforce referential integrity — deleting a tag cascades correctly to `contact_tags`.
- **Positive:** Raw SQL is fully auditable, optimisable, and familiar to any PostgreSQL DBA.
- **Negative:** No ORM means we write and maintain SQL migration files manually. Mitigated by the simple schema (4 tables) and numbered migration files that run in order.
- **Risk:** Concurrent CSV import of 3,000 rows in a single transaction could briefly lock the contacts table. Mitigated by batching inserts into chunks of 100 rows per transaction.
