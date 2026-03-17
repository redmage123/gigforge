"""SQLite database layer with async support via aiosqlite."""

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

import aiosqlite

from config import DATA_DIR

logger = logging.getLogger(__name__)

DB_PATH: Path = DATA_DIR / "cryptoadvisor.db"

# ── Schema DDL ────────────────────────────────────────────────────────────────

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT    NOT NULL UNIQUE,
    password_hash   TEXT    NOT NULL,
    role            TEXT    NOT NULL DEFAULT 'user',
    totp_secret     TEXT,
    totp_enabled    INTEGER NOT NULL DEFAULT 0,
    currency        TEXT    NOT NULL DEFAULT 'usd',
    theme           TEXT    NOT NULL DEFAULT 'dark',
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wallets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address     TEXT    NOT NULL,
    label       TEXT,
    chain_type  TEXT    NOT NULL DEFAULT 'ethereum',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trades (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coin        TEXT    NOT NULL,
    type        TEXT    NOT NULL CHECK(type IN ('buy', 'sell')),
    amount      REAL    NOT NULL,
    price       REAL    NOT NULL,
    date        TEXT    NOT NULL,
    notes       TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coin          TEXT    NOT NULL,
    condition     TEXT    NOT NULL CHECK(condition IN ('above', 'below')),
    target_price  REAL    NOT NULL,
    triggered     INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    snapshot    TEXT    NOT NULL,
    total_value REAL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action      TEXT    NOT NULL,
    details     TEXT,
    ip_address  TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT    NOT NULL,
    ip_address  TEXT,
    user_agent  TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    last_active TEXT    NOT NULL DEFAULT (datetime('now')),
    is_active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS settings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key         TEXT    NOT NULL,
    value       TEXT,
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, key)
);

CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    body        TEXT,
    read        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exchange_connections (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exchange_name   TEXT    NOT NULL,
    api_key_enc     TEXT    NOT NULL,
    api_secret_enc  TEXT    NOT NULL,
    label           TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
"""

_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_wallets_user       ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_user        ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_coin        ON trades(coin);
CREATE INDEX IF NOT EXISTS idx_alerts_user        ON alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_triggered   ON alerts(triggered);
CREATE INDEX IF NOT EXISTS idx_snapshots_user     ON portfolio_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_user         ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action       ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_sessions_user      ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active    ON sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_settings_user_key  ON settings(user_id, key);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_exchange_user      ON exchange_connections(user_id);
"""


async def init_db() -> None:
    """Create the database file and tables if they don't already exist.

    Safe to call multiple times — all DDL uses IF NOT EXISTS.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    try:
        async with aiosqlite.connect(str(DB_PATH)) as db:
            await db.execute("PRAGMA journal_mode=WAL")
            await db.execute("PRAGMA foreign_keys=ON")
            await db.executescript(_SCHEMA_SQL)
            await db.executescript(_INDEX_SQL)
            await db.commit()
        logger.info("Database initialized at %s", DB_PATH)
    except Exception as exc:
        logger.error("Failed to initialize database: %s", exc)
        raise


@asynccontextmanager
async def get_db() -> AsyncIterator[aiosqlite.Connection]:
    """Async context manager that yields an aiosqlite connection.

    Usage::

        async with get_db() as db:
            cursor = await db.execute("SELECT ...")
            rows = await cursor.fetchall()
    """
    db = await aiosqlite.connect(str(DB_PATH))
    try:
        await db.execute("PRAGMA foreign_keys=ON")
        db.row_factory = aiosqlite.Row
        yield db
    finally:
        await db.close()


# ── CRUD Helpers ──────────────────────────────────────────────────────────────


async def db_insert(table: str, data: dict) -> int:
    """Insert a row and return the new rowid.

    Usage::

        user_id = await db_insert("users", {"username": "alice", "password_hash": "..."})
    """
    columns = ", ".join(data.keys())
    placeholders = ", ".join("?" for _ in data)
    values = list(data.values())
    async with get_db() as db:
        cursor = await db.execute(
            f"INSERT INTO {table} ({columns}) VALUES ({placeholders})", values
        )
        await db.commit()
        return cursor.lastrowid  # type: ignore[return-value]


async def db_select(
    table: str, where: dict | None = None, limit: int = 100
) -> list[dict]:
    """Select rows as a list of dicts.

    Usage::

        users = await db_select("users", where={"role": "admin"}, limit=10)
    """
    query = f"SELECT * FROM {table}"
    values: list = []
    if where:
        clauses = " AND ".join(f"{k} = ?" for k in where)
        query += f" WHERE {clauses}"
        values = list(where.values())
    query += f" LIMIT {int(limit)}"
    async with get_db() as db:
        cursor = await db.execute(query, values)
        rows = await cursor.fetchall()
        # Convert aiosqlite.Row objects to plain dicts
        return [dict(row) for row in rows]


async def db_update(table: str, data: dict, where: dict) -> int:
    """Update rows matching *where* and return the number of affected rows.

    Usage::

        count = await db_update("users", {"role": "admin"}, where={"id": 1})
    """
    set_clause = ", ".join(f"{k} = ?" for k in data)
    where_clause = " AND ".join(f"{k} = ?" for k in where)
    values = list(data.values()) + list(where.values())
    async with get_db() as db:
        cursor = await db.execute(
            f"UPDATE {table} SET {set_clause} WHERE {where_clause}", values
        )
        await db.commit()
        return cursor.rowcount


async def db_delete(table: str, where: dict) -> int:
    """Delete rows matching *where* and return the number of affected rows.

    Usage::

        count = await db_delete("sessions", where={"user_id": 42})
    """
    where_clause = " AND ".join(f"{k} = ?" for k in where)
    values = list(where.values())
    async with get_db() as db:
        cursor = await db.execute(
            f"DELETE FROM {table} WHERE {where_clause}", values
        )
        await db.commit()
        return cursor.rowcount
