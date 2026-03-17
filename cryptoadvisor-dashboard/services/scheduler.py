"""Lightweight asyncio background task scheduler."""

import asyncio
from typing import Callable, Awaitable

_tasks: list[asyncio.Task] = []


async def _run_periodic(fn: Callable[[], Awaitable], interval_seconds: int, name: str):
    """Run an async function periodically."""
    while True:
        try:
            await fn()
        except Exception as e:
            print(f"[scheduler] {name} error: {e}")
        await asyncio.sleep(interval_seconds)


def register_task(fn: Callable[[], Awaitable], interval_seconds: int, name: str = ""):
    """Register a periodic background task. Call after event loop is running."""
    task_name = name or fn.__name__
    task = asyncio.create_task(_run_periodic(fn, interval_seconds, task_name))
    _tasks.append(task)
    print(f"[scheduler] Registered: {task_name} (every {interval_seconds}s)")
    return task


def cancel_all():
    """Cancel all registered tasks."""
    for t in _tasks:
        t.cancel()
    _tasks.clear()
