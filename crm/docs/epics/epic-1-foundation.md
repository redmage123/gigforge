# Epic 1: Foundation

**ID:** Epic-1
**Project:** Multi-Tenant CRM Platform
**Status:** IN PROGRESS
**Sprint Target:** Sprint 1
**Story Points:** 21
**PM:** gigforge-pm
**Lead:** gigforge-dev-backend (implementation), gigforge-engineer (schema)

---

## Goal

Scaffold the project, define data models, set up the database, and create a running Docker environment that every downstream sprint builds on.

---

## Stories

| ID | Title | Points | Owner | Status |
|----|-------|--------|-------|--------|
| CRM-101 | Project Scaffolding | 3 | gigforge-dev-backend | DONE ✓ |
| CRM-102 | SQLAlchemy Models (all entities) | 8 | gigforge-engineer | IN PROGRESS |
| CRM-103 | Alembic Migrations Baseline | 5 | gigforge-dev-backend | DONE ✓ |
| CRM-104 | Docker Compose Dev Stack | 3 | gigforge-devops | DONE ✓ |
| CRM-105 | Seed Data (GigForge + TechUni) | 2 | gigforge-dev-backend | BLOCKED (CRM-102) |

---

## Acceptance Criteria (Epic Level)

- [ ] `docker compose up` starts all services (PostgreSQL 16, FastAPI, pgAdmin) with zero manual setup
- [ ] `GET /health` returns `200 {"status": "ok", "version": "0.1.0"}`
- [ ] Alembic migrations run cleanly on a fresh PostgreSQL 16 instance
- [ ] GigForge and TechUni tenants seeded with admin users
- [ ] All SQLAlchemy models importable from `app.models`
- [ ] `alembic upgrade head` + `alembic downgrade base` both clean

---

## Dependencies

None — Epic 1 is the foundation. All other epics depend on it.

---

## Progress

- **CRM-101** ✓ FastAPI skeleton, config, database.py, /health — complete
- **CRM-103** ✓ Alembic migration 0001 with 14 tables, RLS-ready indexes — complete
- **CRM-104** ✓ Docker Compose (postgres + backend, crm-net, healthcheck, volumes) — complete
- **CRM-102** ⏳ SQLAlchemy models in progress — gigforge-engineer
- **CRM-105** 🔒 Blocked waiting for CRM-102 model sign-off
