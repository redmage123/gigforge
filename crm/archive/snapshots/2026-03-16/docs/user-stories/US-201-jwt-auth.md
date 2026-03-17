# US-201: User Registration + JWT Login

**ID:** CRM-201
**Epic:** Epic 2 — Auth & Multi-Tenancy
**Sprint:** 1
**Assigned:** gigforge-dev-backend
**Points:** 8
**Priority:** P0
**Status:** READY (no blockers — CRM-101 and CRM-102 complete/in-progress)

---

## User Story

> As a new user, I want to register with my email and password and receive a JWT access token, so that I can authenticate subsequent API requests.

---

## Acceptance Criteria

- [ ] `POST /api/auth/register` creates user, hashes password with bcrypt (cost ≥ 12), returns `{access_token, refresh_token, user}`
- [ ] `POST /api/auth/login` accepts `{email, password, org_slug}` — verifies credentials, returns tokens
- [ ] Access token: JWT HS256, 15-minute TTL, payload includes `sub`, `org_id`, `role`, `is_agent`, `exp`, `jti`
- [ ] Refresh token: JWT, 7-day TTL, stored in DB for rotation tracking
- [ ] Registration requires `org_slug` to scope the user to the correct tenant
- [ ] Duplicate email within same tenant returns `409 Conflict`
- [ ] Wrong password returns `401 Unauthorized` — no user enumeration (same error for unknown email)
- [ ] Login with valid `org_slug` but no matching user returns `401` (not `404`)
- [ ] OpenAPI schema auto-generated at `/docs`

---

## TDD Test Cases (write BEFORE implementing)

```
test_register_new_user_returns_201_with_tokens
test_register_duplicate_email_same_tenant_returns_409
test_register_duplicate_email_different_tenant_succeeds
test_login_valid_credentials_returns_tokens
test_login_wrong_password_returns_401
test_login_unknown_email_returns_401_not_404
test_login_unknown_org_slug_returns_401
test_access_token_has_correct_claims
test_access_token_expires_after_15_minutes  (mock time)
test_bcrypt_cost_factor_is_at_least_12
```

---

## JWT Payload Structure

```json
{
  "sub":       "user-uuid",
  "org_id":    "org-uuid",
  "role":      "agent",
  "is_agent":  false,
  "exp":       1234567890,
  "iat":       1234567890,
  "jti":       "unique-token-id"
}
```

---

## ADR Reference

ADR-002 — Authentication strategy
