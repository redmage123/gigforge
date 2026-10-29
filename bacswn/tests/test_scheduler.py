"""BACSWN — Scheduler service tests."""

import asyncio
import pytest
import services.scheduler as sched


@pytest.fixture(autouse=True)
def clear_tasks():
    """Ensure scheduler state is clean before and after each test."""
    sched._tasks.clear()
    yield
    for task in sched._tasks.values():
        task.cancel()
    sched._tasks.clear()


class TestRegisterTask:
    async def test_register_creates_task(self):
        call_count = []

        async def dummy():
            call_count.append(1)

        sched.register_task(dummy, 60, "test_task")
        assert "test_task" in sched._tasks
        task = sched._tasks["test_task"]
        assert isinstance(task, asyncio.Task)
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass

    async def test_register_duplicate_skips(self, caplog):
        async def noop():
            pass

        sched.register_task(noop, 60, "dup_task")
        first_task = sched._tasks["dup_task"]
        sched.register_task(noop, 60, "dup_task")
        # Still the same task, not replaced
        assert sched._tasks["dup_task"] is first_task
        assert len(sched._tasks) == 1
        first_task.cancel()
        try:
            await first_task
        except (asyncio.CancelledError, Exception):
            pass

    async def test_register_multiple_tasks(self):
        async def a():
            pass

        async def b():
            pass

        sched.register_task(a, 60, "task_a")
        sched.register_task(b, 60, "task_b")
        assert "task_a" in sched._tasks
        assert "task_b" in sched._tasks
        for t in sched._tasks.values():
            t.cancel()
        for t in list(sched._tasks.values()):
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass


class TestCancelAll:
    async def test_cancel_all_clears_tasks(self):
        async def noop():
            await asyncio.sleep(3600)

        sched.register_task(noop, 60, "t1")
        sched.register_task(noop, 60, "t2")
        assert len(sched._tasks) == 2

        sched.cancel_all()
        assert len(sched._tasks) == 0

    async def test_cancel_all_on_empty(self):
        """cancel_all on empty registry should not raise."""
        sched.cancel_all()
        assert len(sched._tasks) == 0


class TestRunPeriodic:
    async def test_periodic_task_executes(self):
        """Task function gets called within a reasonable time."""
        results = []

        async def collect():
            results.append(1)

        sched.register_task(collect, 0, "quick_task")
        await asyncio.sleep(0.05)
        assert len(results) >= 1
        sched.cancel_all()

    async def test_periodic_task_handles_exception(self, caplog):
        """Task keeps running after an exception."""
        call_count = [0]

        async def buggy():
            call_count[0] += 1
            if call_count[0] == 1:
                raise ValueError("intentional error")

        sched.register_task(buggy, 0, "buggy_task")
        await asyncio.sleep(0.05)
        assert call_count[0] >= 2
        sched.cancel_all()
