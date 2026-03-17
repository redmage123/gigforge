# ADR-004: Async SQLAlchemy Driver Choice

**Status:** Accepted
**Date:** 2026-03-15
**Deciders:** gigforge-engineer, gigforge-pm

---

## Context

The CRM backend uses FastAPI with async/await throughout. The ORM is SQLAlchemy 2.x.
We need to choose a PostgreSQL driver that works with the async session model.

Two options were evaluated:

| Option | Driver | Notes |
|--------|--------|-------|
| **Async (asyncpg)** | `postgresql+asyncpg://` | Native async; fastest throughput; no thread pool overhead |
| **Sync (psycopg2)** | `postgresql+psycopg2://` | Mature; wide tooling support; requires `run_sync` wrappers in async context |

---

## Decision

**Use `asyncpg` with SQLAlchemy's `AsyncSession` and `create_async_engine`.**

```python
# app/core/database.py
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

engine = create_async_engine(
    settings.DATABASE_URL,          # postgresql+asyncpg://...
    echo=settings.DB_ECHO,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

AsyncSessionFactory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)
```

**Alembic** runs migrations synchronously using `run_sync` inside `asyncpg`:

```python
# migrations/env.py
async def run_async_migrations():
    engine = async_engine_from_config(...)
    async with engine.begin() as conn:
        await conn.run_sync(do_run_migrations)
```

---

## Consequences

**Positive:**
- No thread pool overhead — async I/O from request to DB
- `asyncpg` is the fastest PostgreSQL driver for Python
- Consistent async programming model throughout the stack
- `pool_pre_ping=True` handles stale connections gracefully

**Negative:**
- `asyncpg` uses its own type system — requires `asyncpg` codec awareness for custom PostgreSQL types
- `alembic` requires async wrapping (`run_sync`) which is slightly more boilerplate
- `pytest-asyncio` required for all async test cases

**Mitigation:**
- `asyncpg` handles standard types (UUID, JSONB, arrays, INET) natively
- `pytest-asyncio` in `asyncio_mode = "auto"` minimises boilerplate
