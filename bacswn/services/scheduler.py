"""BACSWN — background task scheduler.

What: runs async jobs forever at a fixed interval (forecast capture, verification
matching, model retraining, climatology fill), and provides the shared loop that the
agent orchestrator and the WebSocket broadcasters in ``main.py`` also use.

Why: every periodic job needs the same behaviour: log and survive a failure instead of
killing the task, skip work while the demo is paused, and stop cleanly on cancel.
Keeping that loop in one place avoids several hand-written copies drifting apart.

How: ``run_forever`` awaits the job, logs ``"<label>: <error>"`` on failure, then
sleeps for the interval. ``register_task`` wraps it in an ``asyncio.Task`` keyed by
name (duplicates are ignored) and ``cancel_all`` cancels every registered task.
"""

import asyncio
import logging
from typing import Callable, Coroutine

from services import demo_pause

logger = logging.getLogger("bacswn.scheduler")

_tasks: dict[str, asyncio.Task] = {}


async def run_forever(func: Callable[[], Coroutine], interval: float, error_label: str,
                      *, skip_when_paused: bool = True, log: logging.Logger | None = None) -> None:
    """Await ``func`` every ``interval`` seconds until the task is cancelled.

    Args:
        func: zero-argument coroutine function to run each cycle.
        interval: seconds to sleep after each cycle (also after a failure).
        error_label: prefix of the error log line, ``"<error_label>: <exception>"``.
        skip_when_paused: when True, cycles are skipped while the demo is paused.
        log: logger for failures (defaults to this module's logger).

    A failing cycle is logged and the loop carries on; cancellation ends the loop.
    """
    log = log or logger
    while True:
        try:
            if not (skip_when_paused and demo_pause.is_paused()):
                await func()
        except asyncio.CancelledError:
            break
        except Exception as e:  # keep the background job alive; the failure is logged
            log.error(f"{error_label}: {e}")
        await asyncio.sleep(interval)


async def _run_periodic(func: Callable[[], Coroutine], interval: int, name: str) -> None:
    """Run a registered task forever, logging failures as ``Task <name> failed``."""
    await run_forever(func, interval, f"Task {name} failed")


def register_task(func: Callable[[], Coroutine], interval_seconds: int, name: str) -> None:
    """Start ``func`` as a named periodic background task (ignored if the name is taken).

    Must be called from inside a running event loop.
    """
    if name in _tasks:
        logger.warning(f"Task {name} already registered, skipping")
        return
    task = asyncio.create_task(_run_periodic(func, interval_seconds, name))
    _tasks[name] = task
    logger.info(f"Registered task: {name} (every {interval_seconds}s)")


def cancel_all() -> None:
    """Cancel every registered background task and forget them."""
    for name, task in _tasks.items():
        task.cancel()
        logger.info(f"Cancelled task: {name}")
    _tasks.clear()
