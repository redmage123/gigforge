"""BACSWN — Write-behind SQLite store for the Carbon Desk's simulated exchange.

The matching engine (`services/carbon_exchange.py`) stays in memory for speed.
`flush()` writes what changed since the last call, in one transaction, and is
run every second by the app (market data every `MARKET_EVERY` flushes) and once
more on shutdown. `load()` restores everything at startup. A crash can lose at
most the last second of activity.
"""

from __future__ import annotations

import logging

from services.database import get_db

logger = logging.getLogger("bacswn.trading_store")

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
