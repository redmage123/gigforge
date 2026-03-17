"""BACSWN — Background task scheduler."""

import asyncio
import logging
from typing import Callable, Coroutine

logger = logging.getLogger("bacswn.scheduler")

_tasks: dict[str, asyncio.Task] = {}


async def _run_periodic(func: Callable[[], Coroutine], interval: int, name: str):
    """Run an async function at a fixed interval."""
    while True:
        try:
            await func()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Task {name} failed: {e}")
        await asyncio.sleep(interval)


def register_task(func: Callable[[], Coroutine], interval_seconds: int, name: str) -> None:
    """Register a periodic background task."""
    if name in _tasks:
        logger.warning(f"Task {name} already registered, skipping")
        return
    task = asyncio.create_task(_run_periodic(func, interval_seconds, name))
    _tasks[name] = task
    logger.info(f"Registered task: {name} (every {interval_seconds}s)")


def cancel_all() -> None:
    """Cancel all background tasks."""
    for name, task in _tasks.items():
        task.cancel()
        logger.info(f"Cancelled task: {name}")
    _tasks.clear()
