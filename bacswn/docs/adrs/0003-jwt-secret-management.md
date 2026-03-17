# ADR-0003 — JWT Secret Management & Secret Rotation Policy

**Status:** Accepted
**Date:** 2026-03-15
**Deciders:** gigforge-pm, gigforge-engineer
**Story:** Story 2

## Context

Two secrets are currently committed to the BACSWN git repository:

1. `.env` — contains `JWT_SECRET=change-me-in-production` and other config
2. `data/secret.key` — contains the live JWT signing key generated at first boot

Committing either file to version control means:
- Anyone with repo read access can forge JWT tokens
- Rotating the secret requires a code change and redeployment
- Cloud providers (GitHub, GitLab) may scan and flag the committed secrets

The `data/` directory was likely never intended to be tracked; it is a runtime artifact directory.

## Decision

1. Add `data/` and `.env` to `.gitignore`.
2. Remove `data/secret.key` and `.env` from git tracking via `git rm --cached`.
3. Commit `.env.example` with all keys present but values set to placeholder strings (e.g. `JWT_SECRET=REPLACE_ME`).
4. The secret key generation logic in `services/auth.py` is correct — it generates a 64-char hex key and writes it to `data/secret.key` if absent. This behaviour is kept. The file is simply not tracked by git.
5. Priority order for secret resolution (unchanged, already implemented):
   - `JWT_SECRET` env var (highest priority — use in production/Docker)
   - `data/secret.key` file (fallback — acceptable for dev)
   - Neither present: generate, write, and warn (current behaviour)
6. In production Docker deployments, `JWT_SECRET` MUST be set as an environment variable or Docker secret. `data/` volume must not be bind-mounted from a shared location.
7. Add a startup check: if `JWT_SECRET` equals `change-me-in-production` (the old default), log a CRITICAL warning and refuse to start in non-debug mode.

## Consequences

**Easier:**
- Secret rotation: change env var, restart, done.
- Security audits pass: no secrets in repo.
- Docker Compose / Kubernetes secrets management works naturally.

**Harder:**
- Developers cloning fresh must create their own `.env` from `.env.example`.
- Existing deployments with the committed `secret.key` have exposed their signing key; they must rotate (generate new key, invalidate all existing tokens).

## Alternatives Considered

**A. Use a secrets manager (Vault, AWS Secrets Manager).**
Deferred to Sprint 2. Adds operational complexity; the env-var approach is sufficient for Sprint 1 and is compatible with later migration to a secrets manager.

**B. Encrypt the secret.key file in the repo.**
Rejected: Encryption-at-rest in the repo requires key management for the encryption key — the same problem, one level up.
