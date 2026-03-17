# ADR-0002 — Secure Bootstrap of Default Admin User

**Status:** Accepted
**Date:** 2026-03-15
**Deciders:** gigforge-pm, gigforge-engineer
**Story:** Story 1

## Context

BACSWN currently calls `ensure_default_admin()` on every startup. If the database is empty, it inserts two well-known accounts:
- `admin` / `admin` (role: admin)
- `meteorologist` / `weather` (role: meteorologist)

These credentials are publicly visible in the source code. Any operator who deploys BACSWN without changing them has a permanent backdoor in their system. This is a critical security vulnerability — BACSWN handles emergency dispatch, aviation safety, and sensitive operational data.

## Decision

Remove the auto-creation of hardcoded credentials entirely. Replace with a controlled bootstrap mechanism:

1. `ensure_default_admin()` checks for existing users as before.
2. If no users exist AND the env var `BACSWN_BOOTSTRAP_PASSWORD` is set (min 12 chars), create `admin` with that password (hashed via bcrypt). Log a one-time warning: "Bootstrap admin created — set a permanent password and unset BACSWN_BOOTSTRAP_PASSWORD."
3. If no users exist AND `BACSWN_BOOTSTRAP_PASSWORD` is NOT set, log a CRITICAL warning: "No users exist and BACSWN_BOOTSTRAP_PASSWORD is not set. The system will not be accessible until an admin user is created." Do not create any user.
4. The `meteorologist` demo account is removed entirely from the bootstrap path. Demo accounts must be created manually by an admin via the `/api/auth/register` endpoint or a future admin CLI.
5. Password complexity: minimum 12 characters. Enforced at creation time.

## Consequences

**Easier:**
- New deployments have no standing backdoor.
- Security auditors can confirm: no default credentials exist.
- Operators are forced to make a conscious choice about the initial password.

**Harder:**
- First-time setup requires an extra step (setting env var or using CLI).
- Development/demo setups can no longer spin up with zero config. Teams must set `BACSWN_BOOTSTRAP_PASSWORD=demo-only-local` in their `.env.example` for local dev.

## Alternatives Considered

**A. Random-generated password printed to stdout on first boot.**
Rejected: Passwords in logs are a security anti-pattern; logs are often captured by log aggregators.

**B. Keep hardcoded creds but document "change before production".**
Rejected: Experience shows operators skip this step. Known default creds + documented source = standing vulnerability.

**C. Interactive first-run wizard.**
Rejected: BACSWN runs as a headless service in Docker; interactive prompts break containerised deployments.
