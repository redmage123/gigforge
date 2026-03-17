# US-103: Alembic Migrations — Baseline Schema

**ID:** CRM-103
**Epic:** Epic 1 — Foundation
**Sprint:** 1
**Assigned:** gigforge-dev-backend
**Points:** 5
**Priority:** P0
**Status:** DONE ✓ (completed 2026-03-15)

---

## User Story

> As a DevOps engineer, I want an Alembic migration that creates the full schema from scratch, including indexes, FK constraints, and PostgreSQL extensions, so that any fresh database can be bootstrapped deterministically.

---

## Acceptance Criteria

- [x] `alembic init` configured with `asyncpg` async driver
- [x] `alembic.ini` reads DB URL from `DATABASE_URL` env var
- [x] Initial migration (`0001_initial_schema`) creates all 14 tables in correct dependency order
- [x] PostgreSQL extensions enabled: `pgcrypto`, `pg_trgm`, `btree_gin`
- [x] `set_updated_at()` trigger function created and attached to all mutable tables
- [x] Composite unique constraint: `(org_id, email)` on users
- [x] GIN index on contacts for trigram full-text search
- [x] `alembic upgrade head` runs cleanly against fresh PostgreSQL 16 instance
- [x] `alembic downgrade base` removes all tables cleanly

---

## TDD Test Cases

- `test_alembic_upgrade_head_creates_all_tables`
- `test_alembic_downgrade_base_removes_all_tables`
- `test_extensions_created_on_upgrade`

---

## Notes

Migration `0001_initial_schema.py` at `backend/migrations/versions/`. All 14 tables
created in FK dependency order. `downgrade()` drops in reverse order.
