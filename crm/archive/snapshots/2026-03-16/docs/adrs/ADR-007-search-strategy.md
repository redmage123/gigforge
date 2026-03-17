# ADR-007: Search Strategy

**Status:** Accepted
**Date:** 2026-03-16
**Deciders:** gigforge-engineer, gigforge-dev-backend

---

## Context

The CRM needs a global search across contacts, deals, and companies. Users need partial-name matching (e.g., "Acme" matches "Acme Corp"), case-insensitive search, and results scoped to their tenant. Search must return in under 300ms.

Three strategies were evaluated:

| Strategy | Description | Pros | Cons |
|----------|-------------|------|------|
| **pg_trgm + ILIKE** | PostgreSQL trigram extension with GIN indexes and ILIKE pattern matching | No new infrastructure; supports partial matching; GIN index keeps queries fast | Less powerful than Elasticsearch; fuzzy threshold tuning required |
| **Full-text search (tsvector + tsquery)** | PostgreSQL built-in FTS | Fast; built into PostgreSQL; good for whole-word matching | Less effective for partial names (e.g., "mic" → "Michael"); requires more query complexity |
| **Elasticsearch** | Dedicated search engine | Most powerful; supports fuzzy, faceted, multilingual search | Requires separate service; operational overhead; overkill for CRM data volumes |

---

## Decision

**pg_trgm extension with GIN indexes on searchable fields, using ILIKE `%query%` for matching.**

Implementation:
1. Migration creates `pg_trgm` extension and GIN indexes on `contacts(first_name, last_name, email)`, `deals(title)`, `companies(name, domain)`.
2. Search endpoint uses `ILIKE '%query%'` — the GIN index accelerates these queries.
3. Results capped at 10 per entity type to ensure <300ms response.
4. All queries include `tenant_id` filter for isolation.

A similarity threshold via `similarity(field, query) > 0.1` can be layered on in Sprint 3 for fuzzy "did you mean" results.

---

## Alternatives Considered

- **Elasticsearch:** Too heavy for current scale. CRM data volumes (contacts in tens of thousands) don't justify a dedicated search cluster. Revisit at 500k+ records.
- **tsvector full-text search:** Works well for whole-word queries but poor UX for partial name matching — the primary use case for CRM search. Users type "Jo" expecting "John Smith" to appear.

---

## Consequences

- GIN index on text columns adds ~20% to insert/update time on indexed tables. Acceptable tradeoff for <300ms search.
- ILIKE with leading wildcard (`%query%`) cannot use a B-tree index; GIN with pg_trgm handles this.
- Trigram similarity requires query strings of ≥3 characters to leverage the GIN index; shorter queries fall back to sequential scan (rare in practice).
- If switching to Elasticsearch in future, the search router interface remains the same — only the repository implementation changes.
