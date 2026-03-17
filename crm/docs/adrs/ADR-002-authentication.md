# ADR-002: Authentication and Authorisation Approach

**Status:** Accepted
**Date:** 2026-03-15
**Deciders:** gigforge-engineer, gigforge-pm

---

## Context

The CRM API must authenticate human users and machine-to-machine API clients
(e.g. the GigForge webhook consumer, TechUni integrations). Requirements:

1. Stateless — the API tier should have no session state
2. Short-lived credentials — tokens should expire automatically
3. Role-based access — Admin, Manager, Sales Rep, Viewer
4. Tenant-scoped — every authenticated identity carries a `tenant_id`
5. Revocation — a user should be able to log out and have their token invalidated

---

## Decision

**JWT (RS256) with a short-lived access token + longer-lived refresh token stored in an HttpOnly cookie.**

### Token design

| Token | Lifetime | Storage | Revocable |
|-------|----------|---------|-----------|
| Access token (JWT RS256) | 15 minutes | Memory (JS) / Authorization header | Via `jti` deny-list in Redis |
| Refresh token (opaque UUID) | 7 days | HttpOnly Secure SameSite=Strict cookie | Stored in `refresh_tokens` table; DELETE on logout |

### JWT payload claims

```json
{
  "sub": "<user-uuid>",
  "tenant_id": "<tenant-uuid>",
  "role": "sales_rep",
  "jti": "<token-uuid>",
  "iat": 1710000000,
  "exp": 1710000900
}
```

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/auth/login` | POST | Email + password → access + refresh tokens |
| `/api/v1/auth/refresh` | POST | Refresh cookie → new access token |
| `/api/v1/auth/logout` | POST | Invalidates refresh token and adds `jti` to deny-list |
| `/api/v1/auth/me` | GET | Returns current user profile |
| `/api/v1/auth/register` | POST | Admin-only: creates a new user within the caller's tenant |

### Middleware chain (per request)

```
[Request]
  → JWTAuthMiddleware         — validates signature, expiry, jti deny-list
  → TenantMiddleware          — SET LOCAL app.tenant_id from JWT claim
  → RBACMiddleware            — per-route role check (decorator-based)
  → [Route handler]
```

---

## Alternatives Considered

| Option | Reason Rejected |
|--------|----------------|
| Session cookies (server-side) | Requires sticky sessions or shared session store — incompatible with stateless horizontal scaling |
| API keys only | No expiry mechanism without custom infra; poor UX for browser clients |
| OAuth2/OIDC (external IdP) | Adds Keycloak/Auth0 operational dependency; overkill for V1 with two tenants |
| HS256 (shared secret) | RS256 allows public key verification by downstream services without sharing the signing secret |

---

## Consequences

**Positive:**
- Stateless — any API instance can validate any token
- RS256 public key can be published as JWKS for downstream service verification
- Refresh tokens can be audited and revoked per-device

**Negative:**
- Access token cannot be instantly revoked without the Redis `jti` deny-list
  (acceptable: 15-minute window is short enough for most threat models)
- Redis adds an infrastructure dependency (already required for rate limiting)

---

## Implementation Notes

- Password hashing: `bcrypt` with cost factor 12
- The `register` endpoint is restricted to `role=admin` to prevent tenant
  self-sign-up (tenants are created via internal admin tooling only)
- API keys (for machine clients) are a V2 feature — planned as `api_keys` table
  with the same `tenant_id` + RBAC structure
