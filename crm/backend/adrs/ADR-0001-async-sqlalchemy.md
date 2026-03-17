# ADR-0001: Async vs Sync SQLAlchemy

**Status:** ACCEPTED
**Date:** 2026-03-15
**Author:** gigforge-engineer
**Reviewed by:** gigforge-pm

---

## Context

The CRM API is built on FastAPI, which is an async-first framework using Python's `asyncio`. We need to decide whether to use SQLAlchemy's synchronous or asynchronous API for database access.

**Options considered:**

1. **Sync SQLAlchemy + sync engine** — simple, well-understood, no `async`/`await` plumbing. Works but blocks the event loop on every query.
2. **Async SQLAlchemy + asyncpg** — fully non-blocking, integrates with FastAPI's async request handling end-to-end.
3. **Sync SQLAlchemy wrapped in `run_in_executor`** — technically unblocks the event loop but adds overhead and hides the intent.

---

## Decision

**Use async SQLAlchemy 2.x with `asyncpg` as the PostgreSQL driver.**

```python
# engine configuration
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

engine = create_async_engine(
    "postgresql+asyncpg://user:pass@host/db",
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
```

Session dependency for FastAPI:

```python
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
```

DAO pattern with async:

```python
class ContactDAO:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def get_by_id(self, tenant_id: UUID, contact_id: UUID) -> Contact | None:
        result = await self._session.execute(
            select(Contact).where(
                Contact.tenant_id == tenant_id,
                Contact.id == contact_id,
                Contact.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()
```

---

## Rationale

- FastAPI is designed for async; using sync SQLAlchemy blocks the event loop and defeats FastAPI's performance advantage.
- `asyncpg` is the fastest PostgreSQL async driver for Python (significantly faster than psycopg2 in benchmarks).
- SQLAlchemy 2.x async support is production-stable and the async API closely mirrors the sync API, reducing cognitive overhead.
- Alembic migrations continue to use the **sync** engine (standard psycopg2) because Alembic does not need to be async — migrations run as offline CLI commands.

---

## Consequences

- All DAO methods must be `async def`.
- All route handlers that touch the DB must be `async def`.
- Test fixtures must use `pytest-asyncio` with an async session factory pointed at a test database.
- Alembic config uses a separate sync DSN (`postgresql+psycopg2://...`) — the async DSN (`postgresql+asyncpg://...`) is used only by the running app.
- `expire_on_commit=False` on `AsyncSessionLocal` is required to avoid lazy-load errors after commits in async context.
