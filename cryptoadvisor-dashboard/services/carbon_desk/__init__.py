"""Carbon Desk: simulated carbon-offset futures (CME GEO / N-GEO / C-GEO style).

exchange     in-memory matching engine and market simulator (`venue`)
store        write-behind SQLite persistence in data/carbon_desk.db
signals      rule-based trade ideas and position review
advisor_llm  AI advisor via `claude -p`; proposes tickets, never trades
"""

import asyncio
import logging
import time

logger = logging.getLogger("assetadvisor.carbon_desk")

_tasks: list[asyncio.Task] = []


async def start() -> None:
    """Restore saved state and start the market and save loops (called from the app lifespan)."""
    from services.carbon_desk import store
    from services.carbon_desk.exchange import venue

    await store.init()
    try:
        await store.load(venue)
    except Exception as e:  # a bad save must not stop the app
        logger.error(f"Carbon Desk restore failed, starting with a fresh market: {e}")
    venue._last_step = time.time()

    async def market_loop():
        while True:
            try:
                venue.step()
            except Exception as e:
                logger.error(f"Carbon market step error: {e}")
            await asyncio.sleep(0.5)

    async def save_loop():
        n = 0
        while True:
            await asyncio.sleep(store.FLUSH_SECONDS)
            n += 1
            try:
                await store.flush(venue, market=n % store.MARKET_EVERY == 0)
            except Exception as e:
                logger.error(f"Carbon Desk save failed (will retry): {e}")

    _tasks[:] = [asyncio.create_task(market_loop()), asyncio.create_task(save_loop())]


async def stop() -> None:
    """Stop the loops and save everything one last time."""
    from services.carbon_desk import store
    from services.carbon_desk.exchange import venue

    for t in _tasks:
        t.cancel()
    _tasks.clear()
    try:
        await store.flush(venue, market=True)
    except Exception as e:
        logger.error(f"Carbon Desk final save failed: {e}")
