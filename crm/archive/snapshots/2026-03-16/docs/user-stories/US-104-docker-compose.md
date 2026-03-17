# US-104: Docker Compose — Full Dev Stack

**ID:** CRM-104
**Epic:** Epic 1 — Foundation
**Sprint:** 1
**Assigned:** gigforge-devops
**Points:** 3
**Priority:** P0
**Status:** DONE ✓ (completed 2026-03-15)

---

## User Story

> As a developer, I want a `docker-compose.yml` that starts PostgreSQL 16, the FastAPI app, and supporting services with one command, so that I can develop locally with zero manual setup.

---

## Acceptance Criteria

- [x] `docker-compose.yml` at project root
- [x] Services: `db` (postgres:16), `api` (FastAPI/uvicorn)
- [x] `db` uses a named volume for persistence
- [x] `api` mounts source code for hot-reload in dev mode
- [x] Health check on `db` service; `api` depends on healthy `db`
- [x] Environment variables sourced from `.env` file
- [x] `docker compose up` starts all services; `GET /health` returns 200
- [x] Named network `crm-net` isolates services

---

## Notes

Stack running. Dockerfile uses multi-stage build. Network: `crm-net`.
`docker compose exec api pytest` is the acceptance test runner command.
