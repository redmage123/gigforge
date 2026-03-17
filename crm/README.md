# GigForge + TechUni CRM Platform

Production multi-tenant CRM serving GigForge and TechUni organizations.

## Status

🟡 **In Planning** — Schema and API spec in progress

## Stack

- **Frontend:** React 19 + Vite + Tailwind CSS (dark theme)
- **Backend:** FastAPI + SQLAlchemy 2.x async + Alembic
- **Database:** PostgreSQL 16
- **Auth:** JWT with RBAC (admin/manager/agent/viewer)
- **Containerization:** Docker Compose

## Quick Start

```bash
make up       # Start all services
make migrate  # Run database migrations
make test     # Run test suites
```

## Docker

### Setup

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env — set SECRET_KEY and passwords before running

# 2. Start all services (PostgreSQL, FastAPI, pgAdmin)
docker compose up --build

# 3. Verify all containers are healthy
docker compose ps
```

### Service URLs

| Service  | URL                        | Notes                        |
|----------|----------------------------|------------------------------|
| API      | http://localhost:8000      | FastAPI + Swagger at `/docs` |
| Health   | http://localhost:8000/health | Returns `{"status":"ok"}`  |
| pgAdmin  | http://localhost:5050      | Login with PGADMIN_EMAIL/PASSWORD |
| Postgres | localhost:5435             | Direct DB access (mapped from 5432) |

### Common Commands

```bash
# Start in background
docker compose up -d

# View logs for a specific service
docker compose logs -f api
docker compose logs -f db

# Run database migrations (once API is up)
docker compose exec api alembic upgrade head

# Run tests inside the container
docker compose exec api pytest

# Tear down (removes containers, networks)
docker compose down

# Tear down and delete all volumes (wipes database)
docker compose down -v

# Rebuild the API image after dependency changes
docker compose build api
docker compose up -d api
```

### Hot Reload (Dev)

The `api` service mounts `./backend` as a volume and runs uvicorn with `--reload`.
Any changes to Python files are picked up instantly without restarting the container.

## Documentation

- [Database Schema](docs/schema.md)
- [API Specification](docs/api-spec.md)
- [Project Plan](docs/project-plan.md)
- [Architecture Decisions](docs/adrs/)

## Project Structure

```
crm/
  backend/     # FastAPI application
  frontend/    # React/Vite application
  docs/        # Schema, API spec, ADRs, project plan
  kanban/      # Sprint board
  postgres/    # DB init scripts
```

## Gig File

`/opt/ai-elevate/gigforge/inbox/programming/2026-03-15-crm-platform.md`
