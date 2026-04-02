# ADR-0004: Deployment Strategy

## Status: Accepted

## Context

The client requested Docker deployment. The application has three runtime components: PostgreSQL database, Node.js API, and a React frontend. We need a deployment approach that: (a) runs on any machine with Docker installed, (b) requires a single command to start, (c) is maintainable by a non-DevOps team, and (d) fits the 2,000 EUR budget.

## Decision

**Docker Compose v2 with three services: `db`, `api`, `web`.**

Three-service Docker Compose is the right tool for a 5-user internal application. A single `docker compose up` starts the entire stack. The client's team can run this on any VPS (DigitalOcean Droplet, Hetzner CX22) or locally for development — identical behaviour in both environments.

**Service breakdown:**
- `db`: `postgres:16-alpine` — lightweight, official, production-grade. Data persisted on named volume `postgres_data` so it survives `docker compose down`.
- `api`: Multi-stage Node.js build (stage 1: install deps, stage 2: TypeScript compile, stage 3: production runner). Non-root user. Internal port 4000. Health check via `/api/v1/health`. Depends on `db` with `pg_isready` wait loop.
- `web`: Nginx alpine serving the Vite production build. Proxies `/api` to `api:4000`. Exposed to host on port 3000.

**No TLS in the Docker Compose stack** — TLS termination is the responsibility of the hosting provider's reverse proxy (Caddy, Cloudflare Tunnel, or nginx on the host) sitting in front of `localhost:3000`. We document this in the README.

## Alternatives Considered

- **Kubernetes / Helm** — Massively over-engineered for 5 users. K8s has a steep operational burden; the client's team would not be able to maintain it. Eliminated immediately.
- **Single container (all-in-one)** — Running Postgres, Node.js, and Nginx in one container (Supervisor) violates the one-process-per-container principle, makes logs messy, and complicates updates (can't upgrade just the API without rebuilding everything). Rejected.
- **Railway / Fly.io / Render** — Managed PaaS hosting would be simpler to operate, but the client asked for Docker deployment (implying self-hosted or VPS). We provide a `README.md` note on how to deploy the Compose stack to a VPS if they later want a hosted environment.
- **Docker Swarm** — More capable than Compose but less ergonomic for a team that just wants `docker compose up`. No multi-node requirement here. Overkill.

## Consequences

- **Positive:** `docker compose up` works on macOS, Linux, and Windows with Docker Desktop. Zero environment-specific setup.
- **Positive:** The DB volume persists data across restarts. `docker compose down` does NOT wipe data; `docker compose down -v` does (documented in README).
- **Positive:** Multi-stage API build keeps the production image small (~200MB) and excludes dev dependencies and TypeScript compiler from the running container.
- **Negative:** No built-in TLS, health dashboard, or automatic restarts. Client must add a process supervisor (systemd) and reverse proxy for production hardening.
- **Risk:** If `db` takes longer than expected to start, `api` may crash before connecting. Mitigated by an `entrypoint.sh` wait loop using `pg_isready` before starting the Node.js process.
