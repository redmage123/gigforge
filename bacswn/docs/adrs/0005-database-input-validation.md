# ADR-0005 — Database Layer Input Validation & Table Allowlist

**Status:** Accepted
**Date:** 2026-03-15
**Deciders:** gigforge-pm, gigforge-engineer
**Story:** Story 4

## Context

`services/database.py` exposes a generic DAO-style API (`db_insert`, `db_select`, `db_update`, `db_delete`, `db_execute`). These functions accept `table: str` as a parameter and interpolate it directly into SQL strings using f-strings:

```python
f"INSERT INTO {table} ({columns}) VALUES ({placeholders})"
f"SELECT * FROM {table}"
f"UPDATE {table} SET {set_clause} WHERE {where_clause}"
f"DELETE FROM {table} WHERE {where_clause}"
```

SQLite parameterisation (`?` placeholders) cannot be used for table or column names — only for values. This means any caller that passes an untrusted string as `table` creates a SQL injection vector. While current callers use hardcoded string literals, the pattern is unsafe and will become a critical vulnerability if future code ever passes a user-supplied value.

The `order_by` parameter in `db_select` has the same problem: `f" ORDER BY {order_by}"`.

## Decision

Implement a **table + column allowlist** in `services/database.py`:

1. Define `ALLOWED_TABLES: frozenset[str]` containing all valid table names:
   ```
   users, weather_observations, flight_records, emissions, incidents,
   channel_messages, agent_activity, stations, advisories
   ```

2. All `db_*` functions validate `table` against `ALLOWED_TABLES` at the top of the function. Invalid table raises `ValueError("Invalid table name: {table}")`.

3. For `order_by` in `db_select`, define `ALLOWED_ORDER_COLUMNS: dict[str, frozenset[str]]` mapping each table to its sortable columns. The `order_by` string must match `column_name ASC` or `column_name DESC` where `column_name` is in the allowlist. Invalid value raises `ValueError`.

4. Column names in `db_insert` are validated: each key in `data` must be a valid identifier (alphanumeric + underscore, no spaces, no SQL keywords). A simple regex `^[a-zA-Z_][a-zA-Z0-9_]*$` is sufficient.

5. `db_execute()` — raw SQL — is restricted to internal use only. Add a module-level comment marking it as internal. It is NOT called with any user-supplied data currently; this is documented.

6. All validation happens before any SQL is constructed, so injection cannot reach the database layer.

## Consequences

**Easier:**
- SQL injection via table/column names is structurally impossible
- Clear `ValueError` at the application boundary (not a cryptic SQLite error)
- Easy to audit: the allowlist is one place in the codebase

**Harder:**
- Adding a new table requires updating `ALLOWED_TABLES` — this is intentional friction (good)
- Adding new sortable columns requires updating `ALLOWED_ORDER_COLUMNS` — same

## Alternatives Considered

**A. Replace generic DAO with table-specific repository classes.**
Deferred to Sprint 2. Provides stronger typing and eliminates the generic API entirely, but requires refactoring all callers. Sprint 1 scope is the security fix, not architectural refactoring.

**B. Use an ORM (SQLAlchemy, Tortoise-ORM).**
Deferred to Sprint 2. ORMs solve this problem structurally and add migration management. Migration effort is too large for Sprint 1.

**C. Trust callers to pass safe strings (no validation).**
Rejected: Defence in depth requires the DAO layer to validate its own inputs regardless of caller trustworthiness.
