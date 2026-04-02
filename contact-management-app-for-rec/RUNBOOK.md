# ContactBase — Operations Runbook

This runbook covers deployment, health verification, monitoring, troubleshooting, backup/restore, scaling, and rollback for the ContactBase recruitment CRM.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Deployment](#deployment)
3. [Health Check Procedures](#health-check-procedures)
4. [Monitoring and Logging](#monitoring-and-logging)
5. [Common Issues and Troubleshooting](#common-issues-and-troubleshooting)
6. [Backup and Restore](#backup-and-restore)
7. [Scaling Considerations](#scaling-considerations)
8. [Rollback Procedure](#rollback-procedure)
9. [Contact and Escalation](#contact-and-escalation)

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Docker | 24+ | `docker --version` |
| Docker Compose | v2 | `docker compose version` — must be `docker compose` not `docker-compose` |
| `curl` | any | For health checks |
| `pg_dump` / `psql` | 16 | For database backups (install via `postgresql-client-16`) |

---

## Deployment

### Initial Deployment

```bash
# 1. Clone repository and navigate to project
cd /your/deploy/path/contact-management-app-for-rec

# 2. Copy environment template
cp .env.example .env

# 3. Edit .env — set secure values
#    POSTGRES_PASSWORD=<strong-random-password>
#    JWT_SECRET=$(openssl rand -hex 32)
#    NODE_ENV=production
nano .env

# 4. Build all Docker images
docker compose build --no-cache

# 5. Start services
docker compose up -d

# 6. Verify all services are healthy (allow ~30s for db healthcheck)
docker compose ps

# 7. Verify API health
curl -s http://localhost:4098/api/v1/health | python3 -m json.tool

# 8. Verify login works
curl -s -X POST http://localhost:4098/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gigforge.ai","password":"demo1234"}' \
  | python3 -m json.tool
```

**Expected first-boot sequence:**
1. `db` container starts PostgreSQL 16, runs `initdb`, becomes healthy
2. `api` container starts, runs `npm run migrate` (creates tables, seeds demo user), then starts Express on port 4000
3. `web` container starts Nginx serving the Vite-built React app on port 80 (external: 4098)

### Updating to a New Version

```bash
# 1. Pull latest code
git pull origin main

# 2. Rebuild images
docker compose build --no-cache

# 3. Rolling restart (db stays up — API restart is fast, ~5s downtime)
docker compose up -d --force-recreate api web

# 4. Verify health after restart
docker compose ps
curl -s http://localhost:4098/api/v1/health
```

If the update includes database migrations, they run automatically when the `api` container starts (`npm run migrate` in Dockerfile CMD). Migrations are idempotent — re-running on an existing DB is safe.

---

## Health Check Procedures

### Quick health check (30 seconds)

Run these commands in order. All should succeed.

```bash
# 1. All containers running?
docker compose ps
# Expected: all three services show "running" or "healthy"

# 2. API health endpoint
curl -s http://localhost:4098/api/v1/health
# Expected: {"data":{"status":"ok","timestamp":"..."},"error":null}

# 3. Frontend loads?
curl -s -o /dev/null -w "%{http_code}" http://localhost:4098/
# Expected: 200

# 4. Database reachable from API (implicit via health endpoint)?
# If /health returns 200, DB connection is confirmed.

# 5. Auth works?
curl -s -X POST http://localhost:4098/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gigforge.ai","password":"demo1234"}' | grep -q '"token"' && echo "AUTH OK" || echo "AUTH FAILED"
```

### Full health check (5 minutes)

```bash
#!/usr/bin/env bash
# Save as scripts/health-check.sh and run with bash scripts/health-check.sh

BASE="http://localhost:4098/api/v1"
PASS=0; FAIL=0

check() {
  local desc="$1"; local url="$2"; local expected="$3"
  actual=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$actual" == "$expected" ]; then
    echo "  PASS  $desc ($actual)"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $desc (expected $expected, got $actual)"
    FAIL=$((FAIL+1))
  fi
}

echo "=== ContactBase Health Check ==="

check "Health endpoint"      "$BASE/health"         "200"
check "Login page loads"     "http://localhost:4098" "200"
check "Unauthenticated 401"  "$BASE/contacts"       "401"

# Get token
TOKEN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gigforge.ai","password":"demo1234"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])" 2>/dev/null)

if [ -n "$TOKEN" ]; then
  echo "  PASS  Login returns token"
  PASS=$((PASS+1))
  check "Contacts list (auth)" "$BASE/contacts" "200"  # needs -H, check separately
  actual=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" "$BASE/contacts")
  [ "$actual" == "200" ] && echo "  PASS  Authenticated contacts list" && PASS=$((PASS+1)) \
    || echo "  FAIL  Authenticated contacts list ($actual)" && FAIL=$((FAIL+1))
  actual=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" "$BASE/tags")
  [ "$actual" == "200" ] && echo "  PASS  Tags list" && PASS=$((PASS+1)) \
    || echo "  FAIL  Tags list ($actual)" && FAIL=$((FAIL+1))
else
  echo "  FAIL  Login (no token returned)"
  FAIL=$((FAIL+1))
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
```

---

## Monitoring and Logging

### Log locations

All services log to stdout/stderr. View with Docker:

```bash
# All services (tail 100 lines)
docker compose logs --tail=100

# Follow logs in real time
docker compose logs -f

# Single service
docker compose logs -f api
docker compose logs -f db
docker compose logs -f web

# Since a time
docker compose logs --since="2026-03-21T10:00:00" api
```

### What to watch in API logs

| Log pattern | Meaning | Action |
|-------------|---------|--------|
| `Server running on port 4000` | API started successfully | None |
| `Migrations complete` | DB schema up to date | None |
| `[ERROR]` | Unhandled exception | Investigate stack trace |
| `connect ECONNREFUSED` | Cannot reach database | Check `db` container health |
| `JWT malformed` / `invalid signature` | Bad token (usually a client issue) | Monitor frequency; could be attack if high volume |
| `password authentication failed` | DB credentials mismatch | Check `.env` values match |

### What to watch in DB logs

```bash
docker compose logs db | grep -E "ERROR|FATAL|PANIC"
```

| Pattern | Meaning |
|---------|---------|
| `FATAL: password authentication failed` | API using wrong DB credentials |
| `FATAL: database "contacts" does not exist` | DB not initialised yet (should be temporary) |
| `ERROR: duplicate key value` | Normal — duplicate contact/tag insert attempt |

### Nginx access logs

```bash
docker compose logs web | grep -v "GET /api"  # Filter out API proxy noise
```

Watch for HTTP 502 (API unreachable) or 499 (client closed connection — may indicate slow queries).

### Key metrics to monitor manually

| Metric | Command | Healthy value |
|--------|---------|---------------|
| DB connections | `docker exec <db-container> psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"` | < 20 |
| DB size | `docker exec <db-container> psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('contacts'));"` | < 10 GB |
| Container memory | `docker stats --no-stream` | api < 512 MB, db < 1 GB |
| API response time | `time curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4098/api/v1/contacts > /dev/null` | < 500ms |

---

## Common Issues and Troubleshooting

### API container exits immediately on start

**Symptoms:** `docker compose ps` shows `api` as `Exited`

**Diagnosis:**
```bash
docker compose logs api
```

**Common causes:**
- Database connection refused — `db` container not yet healthy. Check `docker compose logs db`. Wait 30s and retry.
- Migration failure — syntax error in a SQL file. Check logs for `MIGRATION FAILED`.
- Missing environment variable — e.g. `JWT_SECRET` not set. Check `.env` is copied and populated.

**Fix:**
```bash
docker compose restart api   # Retry after db is healthy
# Or
docker compose down && docker compose up -d
```

---

### "Cannot connect to database" in API logs

**Symptoms:** API starts but returns 500 on every request

**Diagnosis:**
```bash
docker compose exec db pg_isready -U postgres -d contacts
# Should print: /var/run/postgresql:5432 - accepting connections
```

**Common causes:**
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, or `POSTGRES_DB` in `.env` does not match `DATABASE_URL` in the API's environment
- `db` container not on the `internal` Docker network

**Fix:**
1. Verify `.env` values are consistent
2. `docker compose down && docker compose up -d`

---

### JWT token rejected (401) even with a fresh login

**Symptoms:** Login succeeds, token is returned, but subsequent requests get 401

**Diagnosis:**
```bash
# Decode the token (header.payload.signature)
echo "<token>" | cut -d'.' -f2 | base64 -d 2>/dev/null | python3 -m json.tool
# Check "exp" field — is the timestamp in the future?
```

**Common causes:**
- `JWT_SECRET` changed between when the token was issued and the current request (e.g. API restarted with a different `.env`)
- Token has expired (default 24h)
- Server clock significantly skewed from client clock

**Fix:**
- Log in again to get a fresh token
- Ensure `JWT_SECRET` is stable across restarts (never regenerate in production without logging out all users)

---

### CSV import times out or returns 413

**Symptoms:** Upload fails mid-import or with "Request Entity Too Large"

**Diagnosis:**
- File size > 10 MB → reduce file size or split into batches
- Nginx default client body limit is 1 MB → needs override (see below)

**Fix for large files — Nginx config:**
```nginx
# Add to web/nginx.conf server block:
client_max_body_size 20M;
```
Then `docker compose build web && docker compose up -d web`.

---

### Full-text search returns no results for known contacts

**Symptoms:** Search query returns empty results even though contacts exist

**Diagnosis:**
```bash
# Check GIN index exists
docker compose exec db psql -U postgres -d contacts \
  -c "SELECT indexname FROM pg_indexes WHERE tablename='contacts';"
# Should show: contacts_search_idx

# Check tsvector is populated
docker compose exec db psql -U postgres -d contacts \
  -c "SELECT name, to_tsvector('english', coalesce(name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(company,'')) FROM contacts LIMIT 3;"
```

**Fix:** If index is missing, run `npm run migrate` (the migration creates it).

---

### Dark mode not persisting after refresh

This is a frontend-only issue — not a backend/ops concern. The preload script in `index.html` reads `localStorage.theme` before React hydrates. If users report this:
- Ask them to clear browser localStorage and toggle again
- Not a server-side issue; no ops action needed

---

## Backup and Restore

### Automated daily backup (cron example)

```bash
# Add to crontab (crontab -e):
# Run at 02:00 UTC daily, keep 30 days of backups
0 2 * * * docker exec $(docker compose -f /path/to/docker-compose.yml ps -q db) \
  pg_dump -U postgres contacts | gzip > /backups/contacts-$(date +%Y%m%d).sql.gz \
  && find /backups -name "contacts-*.sql.gz" -mtime +30 -delete
```

### Manual backup

```bash
# Dump to file
docker compose exec db pg_dump -U postgres contacts > backup-$(date +%Y%m%d-%H%M%S).sql

# Or as compressed archive
docker compose exec db pg_dump -U postgres contacts | gzip > backup-$(date +%Y%m%d-%H%M%S).sql.gz
```

### Restore from backup

```bash
# 1. Stop the API (prevents writes during restore)
docker compose stop api

# 2. Drop and recreate the database
docker compose exec db psql -U postgres -c "DROP DATABASE IF EXISTS contacts;"
docker compose exec db psql -U postgres -c "CREATE DATABASE contacts;"

# 3. Restore from dump
# From uncompressed .sql:
cat backup-20260321-120000.sql | docker compose exec -T db psql -U postgres contacts

# From compressed .sql.gz:
gunzip -c backup-20260321-120000.sql.gz | docker compose exec -T db psql -U postgres contacts

# 4. Restart API (runs migrations to ensure schema is current)
docker compose start api

# 5. Verify
curl -s http://localhost:4098/api/v1/health
```

### Backup verification

```bash
# Count contacts in backup vs live (they should match after restore)
docker compose exec db psql -U postgres -d contacts -c "SELECT COUNT(*) FROM contacts;"
```

---

## Scaling Considerations

The current architecture is designed for a 5-person team managing ~10,000 contacts. For larger scale:

### Vertical scaling (first step)

The bottleneck is usually the database. Increase PostgreSQL memory:

```yaml
# In docker-compose.yml, add to db service:
command: >
  postgres
  -c shared_buffers=512MB
  -c effective_cache_size=1GB
  -c work_mem=16MB
  -c max_connections=50
```

### Connection pooling

For > 20 concurrent users, add PgBouncer between the API and PostgreSQL:

```yaml
# Add to docker-compose.yml:
pgbouncer:
  image: bitnami/pgbouncer:latest
  environment:
    POSTGRESQL_HOST: db
    POSTGRESQL_USERNAME: postgres
    POSTGRESQL_PASSWORD: ${POSTGRES_PASSWORD}
    POSTGRESQL_DATABASE: contacts
    PGBOUNCER_POOL_MODE: transaction
    PGBOUNCER_MAX_CLIENT_CONN: 100
    PGBOUNCER_DEFAULT_POOL_SIZE: 10
  networks:
    - internal
```

Then update `DATABASE_URL` in `api` service to point to `pgbouncer:5432`.

### Multiple API instances

The Express API is stateless **except** for the in-memory JWT blacklist. To scale horizontally:

1. Migrate the JWT blacklist to a shared store (PostgreSQL table or Redis):
   - Add a `token_blacklist(jti TEXT PRIMARY KEY, expires_at TIMESTAMPTZ)` table
   - Update `auth.service.ts` to query this table instead of the in-memory `Set`
2. Then add multiple API replicas behind a load balancer (Nginx upstream, Traefik, etc.)

### Database read replicas

For read-heavy workloads (search-heavy use), set up a PostgreSQL streaming replica and direct `SELECT` queries to the replica URL. The contacts service would need a `readPool` separate from `writePool`.

---

## Rollback Procedure

### Code rollback (no schema changes)

```bash
# 1. Identify the last known-good git commit
git log --oneline -10

# 2. Check out the previous version
git checkout <commit-hash>

# 3. Rebuild and restart API and web (db stays up)
docker compose build api web
docker compose up -d --force-recreate api web

# 4. Verify health
curl -s http://localhost:4098/api/v1/health
```

### Database schema rollback

The migration runner does **not** have automated down-migrations. To roll back a schema change:

```bash
# 1. Stop the API
docker compose stop api

# 2. Manually reverse the migration in psql
docker compose exec db psql -U postgres -d contacts

# Example: rolling back migration 006_add_column_foo.sql
# ALTER TABLE contacts DROP COLUMN IF EXISTS foo;
# DELETE FROM _migrations WHERE filename = '006_add_column_foo.sql';
# \q

# 3. Remove the migration file from api/src/db/migrations/
rm api/src/db/migrations/006_add_column_foo.sql

# 4. Restart API on the previous code
docker compose start api
```

> **Note:** Always take a full database backup before applying migrations to production.

---

## Contact and Escalation

| Role | Contact | Scope |
|------|---------|-------|
| Lead Engineer | GigForge Engineering | Code bugs, architecture questions, migration issues |
| Project Owner | braun.brelin@ai-elevate.ai | Business escalation, access provisioning |
| Operations | mike.burton@ai-elevate.ai | Infrastructure, hosting, backups |

### Incident severity levels

| Severity | Description | Response Target |
|----------|-------------|-----------------|
| P1 — Critical | App completely unavailable, all users blocked | Acknowledge within 30 min |
| P2 — High | Core feature broken (login, contact CRUD) | Acknowledge within 2 hours |
| P3 — Medium | Non-critical feature broken (CSV export, dark mode) | Next business day |
| P4 — Low | Cosmetic or minor UX issue | Backlog |

### First-response checklist

1. `docker compose ps` — are all services running?
2. `docker compose logs --tail=50 api` — any ERROR or FATAL lines?
3. `curl http://localhost:4098/api/v1/health` — does API respond?
4. `docker compose exec db psql -U postgres -c "SELECT 1;"` — is DB reachable?
5. Check disk space: `df -h` — is the volume full?
6. Check memory: `docker stats --no-stream` — is any container OOM-killed?

Collect the above output before escalating.
