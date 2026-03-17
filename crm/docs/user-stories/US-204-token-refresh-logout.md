# US-204: Token Refresh + Logout

**ID:** CRM-204
**Epic:** Epic 2 — Auth & Multi-Tenancy
**Sprint:** 1
**Assigned:** gigforge-dev-backend
**Points:** 3
**Priority:** P1
**Status:** READY (blocked by CRM-201)

---

## User Story

> As a logged-in user, I want to refresh my access token without re-entering my password, and securely log out by invalidating my tokens, so that my session is both convenient and secure.

---

## Acceptance Criteria

- [ ] `POST /api/auth/refresh` accepts `{refresh_token}`, returns new `{access_token, refresh_token}`
- [ ] Old refresh token is invalidated on rotation — reusing it returns `401`
- [ ] `POST /api/auth/logout` adds the current access token's `jti` to the blacklist
- [ ] Blacklist stored in the `token_blacklist` DB table (keyed by `jti`, expires at token `exp`)
- [ ] Any subsequent request with a blacklisted `jti` returns `401 Unauthorized`
- [ ] Expired refresh token returns `401` with `{"detail": "Refresh token expired"}`
- [ ] Blacklist entries cleaned up automatically (DB job or TTL-based query) when `exp` has passed

---

## TDD Test Cases (write BEFORE implementing)

```
test_refresh_returns_new_access_and_refresh_tokens
test_old_refresh_token_rejected_after_rotation
test_expired_refresh_token_returns_401
test_logout_blacklists_access_token_jti
test_blacklisted_token_rejected_on_next_request
test_logout_with_invalid_token_returns_401
```

---

## DB Table: token_blacklist

```sql
CREATE TABLE token_blacklist (
    jti        UUID        PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_token_blacklist_exp ON token_blacklist (expires_at);
```

---

## ADR Reference

ADR-002 — Authentication (JWT blacklist stored in DB table)
