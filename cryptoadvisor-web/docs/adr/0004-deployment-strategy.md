# ADR-0004: Deployment Strategy
## Status: Accepted
## Date: 2026-03-22

## Context

The CryptoAdvisor Web Dashboard is a static SPA — Vite compiles everything to HTML, CSS, and JS at build time. We needed to decide how to containerise and serve it.

## Decision

**Single Docker container: multi-stage build (Node.js 22 → nginx:alpine). Served on port 3000.**

Because there is no server process and no database, a single nginx container is the correct and minimal deployment unit. The Dockerfile has three stages:

1. `deps` — `node:22-alpine`, install pnpm, run `pnpm install --frozen-lockfile`
2. `builder` — copy source, run `pnpm build` → output in `/app/dist`
3. `runner` — `nginx:alpine`, copy `dist/` to `/usr/share/nginx/html`, copy `nginx.conf`

The `docker-compose.yml` wraps this single service for convenience.

**nginx.conf key directives:**
```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  # SPA routing — all paths return index.html
  location / {
    try_files $uri $uri/ /index.html;
  }

  # Long-term cache on Vite content-hashed assets
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  # Never cache index.html
  location = /index.html {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
  }

  gzip on;
  gzip_types text/html text/css application/javascript application/json image/svg+xml;
  gzip_min_length 1024;
}
```

The target image size is < 100MB (sprint acceptance criterion). The nginx:alpine base is ~8MB; the built SPA is ~300–500KB.

## Alternatives Considered

**Docker Compose with frontend + API services**
- Multi-service setup mirrors the client-portal and job-board projects
- Rejected because: there is no API service. Running Docker Compose with a single service adds a file and a concept without adding value.

**Serve directly from Vite preview (`vite preview`)**
- `vite preview` is the Vite built-in production preview server
- Rejected because: not production-grade; intended for local preview only; nginx is the correct tool for serving static assets in production with proper cache headers and gzip

**Caddy instead of nginx**
- Automatic HTTPS, simpler config syntax, modern alternative to nginx
- Rejected because: no Caddy precedent in the portfolio; nginx is established across all GigForge projects (job-board, client-portal); the nginx config is simple enough that the verbosity is not a burden

**Static hosting (Netlify, Vercel, Cloudflare Pages)**
- Zero-config deployment, CDN-backed, automatic HTTPS
- Rejected for the primary deliverable because: the project must run locally with Docker; managed hosting requires external credentials and network access during the demo
- **Noted as a future deployment target in README**: `vite build` + drag-and-drop to Netlify drop is a 30-second operation for anyone who wants a public URL

**Node.js `serve` package**
- `npx serve dist/`
- Rejected because: nginx is faster, lighter, and more appropriate for a professional portfolio demo; `serve` is a development convenience, not a production server

## Consequences

- **Positive:** The simplest possible deployment — one container, one command.
- **Positive:** Image is tiny (<100MB target). nginx:alpine + ~400KB SPA.
- **Positive:** The nginx config demonstrates correct SPA routing, cache control, and gzip — all production-relevant concerns that a client or interviewer would notice.
- **Positive:** Node.js 22 base image for the build stage avoids the April 2026 Node 20 EOL issue.
- **Risk:** No health check endpoint. nginx returns 200 for `index.html` — this is sufficient for Docker health checks (`curl -f http://localhost/ || exit 1`), but there is no `/health` route.
- **Note:** `VITE_API_URL` is not needed — there is no API. No build args need to be injected at Docker build time. The image is portable without any environment-specific configuration.
