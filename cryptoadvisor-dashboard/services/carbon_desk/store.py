"""AssetAdvisor Carbon Desk — write-behind SQLite store for the simulated exchange.

The matching engine (`services/carbon_desk/exchange.py`) stays in memory for speed.
`flush()` writes what changed since the last call, in one transaction, and is
run every second by the app (market data every `MARKET_EVERY` flushes) and once
more on shutdown. `load()` restores everything at startup. A crash can lose at
most the last second of activity.

The desk keeps its own database file (data/carbon_desk.db), separate from the
main AssetAdvisor database, so it cannot affect any other feature's data.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

import aiosqlite

from config import DATA_DIR

logger = logging.getLogger("assetadvisor.carbon_desk.store")

DB_PATH: Path = DATA_DIR / "carbon_desk.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS trading_accounts (
    owner           TEXT    PRIMARY KEY,
    cash            REAL    NOT NULL,
    fees            REAL    NOT NULL DEFAULT 0,
    start_equity    REAL    NOT NULL,
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS trading_positions (
    owner           TEXT    NOT NULL,
    symbol          TEXT    NOT NULL,
    qty             INTEGER NOT NULL,
    avg_price       REAL    NOT NULL,
    realized        REAL    NOT NULL DEFAULT 0,
    PRIMARY KEY (owner, symbol)
);
CREATE TABLE IF NOT EXISTS trading_orders (
    id              INTEGER PRIMARY KEY,
    owner           TEXT    NOT NULL,
    symbol          TEXT    NOT NULL,
    side            TEXT    NOT NULL,
    qty             INTEGER NOT NULL,
    type            TEXT    NOT NULL,
    tif             TEXT    NOT NULL,
    price           INTEGER,            -- ticks
    stop            INTEGER,            -- ticks
    filled          INTEGER NOT NULL DEFAULT 0,
    avg_fill        REAL    NOT NULL DEFAULT 0,
    status          TEXT    NOT NULL,
    reason          TEXT    NOT NULL DEFAULT '',
    created         REAL    NOT NULL,
    updated         REAL    NOT NULL
);
CREATE TABLE IF NOT EXISTS trading_fills (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    owner           TEXT    NOT NULL,
    order_id        INTEGER,
    symbol          TEXT    NOT NULL,
    side            TEXT    NOT NULL,
    qty             INTEGER NOT NULL,
    price           REAL    NOT NULL,
    fee             REAL    NOT NULL,
    liquidity       TEXT    NOT NULL,
    time            TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS trading_instruments (
    symbol          TEXT    PRIMARY KEY,
    settle          REAL,
    open            REAL,
    high            REAL,
    low             REAL,
    last            REAL,
    last_size       INTEGER NOT NULL DEFAULT 0,
    volume          INTEGER NOT NULL DEFAULT 0,
    open_interest   INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS trading_candles (
    symbol          TEXT    NOT NULL,
    t               INTEGER NOT NULL,
    o REAL NOT NULL, h REAL NOT NULL, l REAL NOT NULL, c REAL NOT NULL,
    v               INTEGER NOT NULL,
    PRIMARY KEY (symbol, t)
);
CREATE TABLE IF NOT EXISTS trading_spot (
    product         TEXT    PRIMARY KEY,
    spot            REAL    NOT NULL
);
-- Each user's CORSIA hedge target: annual CO2 emissions to be offset.
CREATE TABLE IF NOT EXISTS carbon_obligation (
    owner           TEXT    PRIMARY KEY,
    annual_co2_t    REAL    NOT NULL,
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trading_orders_owner ON trading_orders(owner, status);
CREATE INDEX IF NOT EXISTS idx_trading_fills_owner ON trading_fills(owner, id);
"""


@asynccontextmanager
async def get_db():
    db = await aiosqlite.connect(str(DB_PATH))
    try:
        db.row_factory = aiosqlite.Row
        yield db
    finally:
        await db.close()


async def init() -> None:
    """Create the desk's database file and tables (idempotent)."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.executescript(_SCHEMA)
        await db.commit()


async def get_obligation(owner: str) -> float | None:
    async with get_db() as db:
        row = await (await db.execute("SELECT annual_co2_t FROM carbon_obligation WHERE owner = ?", (owner,))).fetchone()
    return row[0] if row else None


async def set_obligation(owner: str, annual_co2_t: float) -> None:
    async with get_db() as db:
        await db.execute(
            "INSERT INTO carbon_obligation (owner, annual_co2_t) VALUES (?, ?) ON CONFLICT(owner) DO UPDATE"
            " SET annual_co2_t = excluded.annual_co2_t, updated_at = datetime('now')", (owner, annual_co2_t))
        await db.commit()


FLUSH_SECONDS = 1.0
MARKET_EVERY = 15            # market data (spot, stats, bars) every 15 flushes
ORDER_HISTORY_PER_OWNER = 200
FILLS_PER_OWNER = 300
CANDLES_PER_SYMBOL = 1500


async def load(venue) -> dict:
    """Read the stored state and rebuild the venue from it."""
    async with get_db() as db:
        async def rows(sql, params=()):
            return [tuple(r) for r in await (await db.execute(sql, params)).fetchall()]

        state = {
            "spot": await rows("SELECT product, spot FROM trading_spot"),
            "instruments": await rows(
                "SELECT symbol, settle, open, high, low, last, last_size, volume, open_interest FROM trading_instruments"),
            "candles": await rows(
                "SELECT symbol, t, o, h, l, c, v FROM ("
                " SELECT *, ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY t DESC) AS n FROM trading_candles"
                ") WHERE n <= ?", (CANDLES_PER_SYMBOL,)),
            "accounts": await rows("SELECT owner, cash, fees, start_equity FROM trading_accounts"),
            "positions": await rows("SELECT owner, symbol, qty, avg_price, realized FROM trading_positions"),
            # Every open order, plus recent history for the blotter.
            "orders": await rows(
                "SELECT id, owner, symbol, side, qty, type, tif, price, stop, filled, avg_fill, status, reason,"
                " created, updated FROM ("
                " SELECT *, ROW_NUMBER() OVER (PARTITION BY owner ORDER BY id DESC) AS n FROM trading_orders"
                ") WHERE status IN ('WORKING', 'PARTIAL', 'PENDING') OR n <= ?", (ORDER_HISTORY_PER_OWNER,)),
            "fills": await rows(
                "SELECT owner, order_id, symbol, side, qty, price, fee, liquidity, time FROM ("
                " SELECT *, ROW_NUMBER() OVER (PARTITION BY owner ORDER BY id DESC) AS n FROM trading_fills"
                ") WHERE n <= ? ORDER BY owner, id DESC", (FILLS_PER_OWNER,)),
        }
    restored = venue.restore(state)
    logger.info(f"Carbon Desk state restored: {restored}")
    return restored


async def flush(venue, market: bool = False) -> int:
    """Write everything changed since the last flush. Returns rows written."""
    batch = venue.export_changes(market=market)
    if not (batch["owners"] or market):
        return 0
    try:
        async with get_db() as db:
            await db.execute("BEGIN")
            await db.executemany(
                "INSERT INTO trading_accounts (owner, cash, fees, start_equity) VALUES (?, ?, ?, ?)"
                " ON CONFLICT(owner) DO UPDATE SET cash = excluded.cash, fees = excluded.fees,"
                " start_equity = excluded.start_equity, updated_at = datetime('now')", batch["accounts"])
            for owner, positions in batch["positions"].items():
                # Replace the owner's positions so ones that went away (expiry) are removed too.
                await db.execute("DELETE FROM trading_positions WHERE owner = ?", (owner,))
                await db.executemany("INSERT INTO trading_positions VALUES (?, ?, ?, ?, ?)", positions)
            await db.executemany(
                "INSERT OR REPLACE INTO trading_orders (id, owner, symbol, side, qty, type, tif, price, stop, filled,"
                " avg_fill, status, reason, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                batch["orders"])
            await db.executemany(
                "INSERT INTO trading_fills (owner, order_id, symbol, side, qty, price, fee, liquidity, time)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", batch["fills"])
            if market:
                await db.executemany("INSERT OR REPLACE INTO trading_spot VALUES (?, ?)", batch["spot"])
                await db.executemany("INSERT OR REPLACE INTO trading_instruments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                     batch["instruments"])
                await db.executemany("INSERT OR REPLACE INTO trading_candles VALUES (?, ?, ?, ?, ?, ?, ?)",
                                     batch["candles"])
                await db.execute(
                    "DELETE FROM trading_candles WHERE t < (SELECT MAX(t) FROM trading_candles x"
                    " WHERE x.symbol = trading_candles.symbol) - ?", (CANDLES_PER_SYMBOL * 60,))
            await db.commit()
    except BaseException:
        venue.requeue(batch)
        raise
    return (len(batch["accounts"]) + len(batch["orders"]) + len(batch["fills"])
            + (len(batch.get("candles", [])) if market else 0))
