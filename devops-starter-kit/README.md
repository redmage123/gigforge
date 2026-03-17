# DevOps Starter Kit

A production-ready Node.js API with Prometheus metrics, GitHub Actions CI/CD, Docker multi-stage builds, Grafana dashboards, and automated deploy scripts.

## Stack

- **Runtime**: Node.js 20, TypeScript strict
- **Framework**: Express 4
- **Metrics**: prom-client (Prometheus)
- **Validation**: Zod
- **Tests**: Jest 29 + ts-jest + supertest (61 tests, 7 suites)

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev        # development with nodemon
npm run build      # compile TypeScript
npm start          # run compiled output
npm test           # run all 61 tests
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check with uptime and version |
| GET | /metrics | Prometheus metrics endpoint |
| GET | /api/items | List all items |
| POST | /api/items | Create item `{ name: string }` |
| GET | /api/items/:id | Get item by ID |
| PUT | /api/items/:id | Update item |
| DELETE | /api/items/:id | Delete item |

## Docker

```bash
docker build -f docker/Dockerfile -t devops-starter-kit .
docker run -p 3000:3000 devops-starter-kit
```

## Deploy

```bash
# Railway
./deploy/deploy-railway.sh [app-name]

# Fly.io
./deploy/deploy-fly.sh [app-name] [region]

# VPS via SSH
DEPLOY_HOST=your.server.com DEPLOY_USER=ubuntu DEPLOY_DIR=/opt/app ./deploy/deploy-vps.sh
```

## CI/CD Workflows

- **ci.yml**: Lint → Test → Build on push to main and all PRs
- **release.yml**: Push Docker image to GHCR on version tags (v*)
- **nightly.yml**: Security audit with npm audit + Trivy filesystem scan

## Grafana

Import `grafana/dashboard.json` into Grafana (schema version 39). Panels:

1. **Request Rate** — requests per second by route/method
2. **Error Rate** — 5xx errors per second
3. **p95 Latency** — 95th percentile response time
4. **Total Requests** — stat panel with all-time total
5. **p50 Latency** — median response time
6. **4xx Error Rate** — client errors by route

## Environment Variables

See `.env.example` for all configuration options.
