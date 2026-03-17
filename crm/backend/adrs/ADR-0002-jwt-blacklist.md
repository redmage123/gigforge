# ADR-0002: JWT Blacklist Storage — DB Table vs Redis

**Status:** ACCEPTED
**Date:** 2026-03-15
**Author:** gigforge-engineer
**Reviewed by:** gigforge-pm

---

## Context

JWT access tokens are stateless by design. When a user logs out or an admin revokes a session, we need a mechanism to invalidate a previously issued token before its natural expiry.

Two primary options:

1. **PostgreSQL table** — store invalidated JTIs (JWT IDs) in a `token_blacklist` table; query on each authenticated request.
2. **Redis** — store invalidated JTIs in Redis with a TTL matching the token's remaining lifetime; O(1) lookup.

---

## Decision

**Use a PostgreSQL `token_blacklist` table for Sprint 1. Plan Redis migration in Sprint 2 if load testing reveals bottlenecks.**

Table schema (implemented as a SQLAlchemy model, not included in the main models package):

```python
class TokenBlacklist(Base):
    __tablename__ = "token_blacklist"

    jti: Mapped[str] = mapped_column(String(255), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

Lookup on each request:

```python
exists = await session.scalar(
    select(TokenBlacklist.jti).where(TokenBlacklist.jti == token_jti)
)
if exists:
    raise HTTPException(status_code=401, detail="Token has been revoked")
```

Cleanup job: delete rows where `expires_at < now()` — run as a background task or cron.

---

## Rationale

**Why not Redis in Sprint 1:**
- Redis adds infrastructure complexity (another service in Docker Compose, secrets, connection pooling).
- The CRM is a B2B tool with expected low-to-medium token revocation rates — PostgreSQL can handle this load easily at our scale.
- Adding Redis in Sprint 1 before we have load data is premature optimisation.
- A PostgreSQL blacklist keeps the auth system's state in one place (the DB), making it easier to audit and reason about.

**Why Redis later may make sense:**
- At high scale, a DB lookup on every authenticated request adds latency.
- Redis TTL-based expiry is automatic; the PostgreSQL approach requires a cleanup job.
- If we introduce refresh token rotation (Sprint 2), Redis becomes more attractive.

---

## Consequences

- A `token_blacklist` table must be created in the Alembic baseline migration.
- The `jti` claim must be included in every access token payload (standard JWT claim — use `uuid.uuid4()` at issuance).
- A periodic cleanup task (e.g., every hour) must delete expired rows to prevent unbounded table growth.
- Auth middleware checks the blacklist on every request to a protected endpoint — this is one extra DB query per request.
- If Redis is adopted in Sprint 2, the auth middleware's lookup can be swapped to Redis with no change to the route layer.
