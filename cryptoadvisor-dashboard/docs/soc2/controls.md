# Control matrix (Trust Services Criteria → AssetAdvisor)

Status: **Implemented** (in production, evidence available) · **Partial** · **Gap** (to do before audit).

## CC6 Logical and physical access

| # | Control | Status | Evidence |
|---|---|---|---|
| 6.1a | Passwords hashed with bcrypt; minimum 10 characters for new passwords | Implemented | `services/auth.py` (MIN_PASSWORD), `routers/auth.py` |
| 6.1b | Login lockout after repeated failures; per-IP rate limiting | Implemented | `services/auth.py` check_lockout, `middleware/rate_limiter.py` |
| 6.1c | Single sign-on: Google/Microsoft (OIDC, PKCE, verified ID tokens), per-firm SAML 2.0 (signed assertions, audience/recipient/time/InResponseTo, replay protection) | Implemented | `services/sso.py`, `tests/test_sso.py` |
| 6.1d | Firms can require SSO for members (admin break-glass), set session length 1–24 h | Implemented | `services/firms.py` password_blocked_by, session_hours |
| 6.1e | Multi-factor authentication (TOTP) for users, enforceable per firm | Implemented | services/mfa.py, api/totp.py, middleware/auth.py (enrollment gate), tests/test_mfa.py. Firms can require it; platform admins should enable it on their own accounts |
| 6.2 | Role-based access: firm roles admin / pm / analyst / compliance / viewer; per-portfolio viewer/manager grants; server-side checks on every request | Implemented | `services/portfolios.py` resolve/write_target, `services/firms.py`, `tests/test_firms.py` |
| 6.2b | Joiner: one-time invitation links (7-day expiry, revocable); JIT accounts only for verified firm domains | Implemented | firms.invite / accept_invite, sso._provision |
| 6.3 | Leaver/mover: suspend or remove members (immediate effect); last-admin guard; account deletion removes data, memberships, identities, broker connections | Implemented | firms.set_member, services/account.py |
| 6.3b | Periodic access review recorded with a member snapshot | Implemented | firms.mark_reviewed → audit `firm.access_review` |
| 6.6 | Sessions: signed JWT in HttpOnly, Secure, SameSite=Lax cookie; CSRF double-submit on state changes | Implemented | routers/auth.issue_session, middleware/csrf.py |
| 6.6b | Server-side sessions: every token names a session checked on each request (API, SSO, WebSocket); users list and end their sessions; logout, password change and account deletion end sessions; operators can end all of a user's sessions | Implemented | services/sessions.py, api/user_sessions.py, tests/test_sessions.py |
| 6.7 | Encryption in transit: TLS at Cloudflare; HSTS | Implemented | middleware/security_headers.py |
| 6.7b | Encryption at rest of secrets (broker credentials) with Fernet; key held outside the data volume and backups | Implemented | services/crypto_utils.py, ASSETADVISOR_ENCRYPTION_KEY |
| 6.7c | Disk/volume encryption of database and backups | **Gap** | Hetzner volume not encrypted; see hosting plan |
| 6.8 | Browser protections: CSP (enforced; scripts only from self, Plaid and Cloudflare Web Analytics, never inline), X-Frame-Options DENY, nosniff, referrer and permissions policies; output escaping of AI text | Implemented | middleware/security_headers.py, tests/test_security_headers.py, components/AiInsightPanel.jsx |
| 6.x | Infrastructure access limited to named administrators | **Gap** | Shared host with automation agents (hosting plan) |

## CC7 System operations

| # | Control | Status | Evidence |
|---|---|---|---|
| 7.2a | Tamper-evident audit trail: append-only table (DB trigger blocks UPDATE/DELETE/TRUNCATE), SHA-256 hash chain | Implemented | services/audit_events.py, services/db.py migration 3 |
| 7.2b | Events: sign-in success/failure/refusal, logout, registration, password change, account deletion, SSO link/unlink/config, firm and membership changes, invitations, portfolio create/update/delete/share, trades, cash, allocation, rebalancing, broker connect/sync/disconnect, audit exports | Implemented | grep `audit_events.record` / `from_request` |
| 7.2c | Daily integrity check of the chain; platform admins alerted on failure or write errors | Implemented | audit_events.daily_integrity_check (scheduler) |
| 7.2d | Firm admins/compliance can search and export (CSV) the firm's audit trail | Implemented | api/firms.py /audit, /audit.csv |
| 7.2e | Centralized log retention and alerting (app/nginx logs) | **Gap** | Docker logs only; add log shipping + retention |
| 7.3 | Incident response procedure | Partial | policies.md §6 (draft) |
| 7.4 | Vulnerability management: dependency scanning | Partial | `pip-audit`, `npm audit` run 2026-11-17 (see below); schedule monthly |
| 7.4b | External penetration test | **Gap** | Before Type I |

## CC8 Change management

| # | Control | Status | Evidence |
|---|---|---|---|
| 8.1a | Changes in version control with descriptive commits | Implemented | git history (gigforge repo, master) |
| 8.1b | Automated tests before deploy (≈256 tests incl. security tests), run again inside the production image against a separate test database | Implemented | tests/, /tmp/aa-ctest.sh |
| 8.1c | Deploy tooling refuses to overwrite files changed by others (drift check), backs up replaced files, prints rollback | Implemented | aa-deploy.sh |
| 8.1d | Database schema changes as numbered, recorded migrations | Implemented | services/db.py schema_migrations |
| 8.1e | Peer review / approval of changes before production; segregation of developer and deployer | **Gap** | Pull requests + approval on a protected branch |
| 8.1f | Separate staging environment | **Gap** | Hosting plan |

## A1 Availability

| # | Control | Status | Evidence |
|---|---|---|---|
| A1.2a | Nightly database backup with automated restore test, 14 days retention, owner-only files | Implemented | backups/assetadvisor/backup.sh, backup.log |
| A1.2b | Backups stored off-site and encrypted | **Partial** | Encryption to an offline GPG key and rsync off-site built into backup.sh; needs a storage target (runbook section 7) |
| A1.2c | Documented recovery procedure (RTO/RPO) and a restore drill | Partial | scripts/migrate_to_postgres.py export; drill to schedule |
| A1.1 | Capacity and uptime monitoring with alerting | **Gap** | Add external uptime monitor |

## C1 Confidentiality

| # | Control | Status | Evidence |
|---|---|---|---|
| C1.1 | Data separated per user/firm; access enforced server-side; shared books never mix into others' views | Implemented | portfolios.resolve, tests |
| C1.2 | Account deletion erases personal records; audit events kept but anonymized | Implemented | services/account.py, audit_events.anonymize |
| C1.2b | Data retention schedule | Partial | policies.md §8 (draft) |

## CC1–CC5, CC9 Governance, risk, vendors

| Control | Status |
|---|---|
| Named security owner; policies approved by management; annual review | **Gap** (drafts in policies.md) |
| Security awareness training for staff | **Gap** |
| Risk assessment (annual) | **Gap** (template in policies.md §2) |
| Vendor inventory and reviews (Hetzner, Cloudflare, Anthropic, Meta/WhatsApp, Plaid, SnapTrade, Alpaca, Google/Microsoft, Blockscout and other public data sources) | Partial (inventory in system-description.md) |
| Customer terms, privacy policy, security page | **Gap** |

## Dependency scan (2026-11-17)

- Python (`pip-audit`): python-jose (PYSEC-2026-4298, forged HS256 tokens when algorithms are not
  restricted) — **not exploitable here**: every decode restricts algorithms (HS256 sessions, RS256 SSO);
  no fixed release yet; consider moving to PyJWT. ecdsa (PYSEC-2026-1325, timing leak when signing) —
  not used for signing; transitive only.
- JavaScript (`npm audit`): 30 → 11 after non-breaking fixes (both critical resolved: plotly.js,
  maplibre-gl); 11 → 0 on 2026-11-24 by replacing `@walletconnect/ethereum-provider` (Reown AppKit tree)
  with `@walletconnect/universal-provider` and removing `ethers` and `@walletconnect/modal`.
  `npm audit` reports 0 vulnerabilities in production and dev dependencies.
