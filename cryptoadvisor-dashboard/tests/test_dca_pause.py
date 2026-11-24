"""DCA plan pause/resume: status transitions, executor skips paused plans, no catch-up burst on resume."""

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx  # noqa: E402
from fastapi import FastAPI, Request  # noqa: E402

from services import dca_automation as dca  # noqa: E402


def _call(method, path, **kw):
    from api.dca_plans import router
    app = FastAPI()

    @app.middleware("http")
    async def fake_auth(request: Request, call_next):
        request.state.user = {"sub": "tester"}
        return await call_next(request)

    app.include_router(router, prefix="/api/dca-plans")

    async def go():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            return await c.request(method, path, **kw)
    return asyncio.run(go())


def _plan(**over):
    plan = asyncio.run(dca.create_dca_plan("tester", {"coin": "BTC", "amount_usd": 10, "frequency": "weekly",
                                                      "start_date": "2026-01-01"}))
    plans = dca._load_plans("tester")
    plans[-1].update(over)
    dca._save_plans("tester", plans)
    return plan["plan_id"]


def test_pause_resume_api_and_errors():
    pid = _plan()
    r = _call("POST", f"/api/dca-plans/{pid}/pause")
    assert r.status_code == 200 and r.json()["status"] == "paused" and r.json()["next_execution"] is None
    again = _call("POST", f"/api/dca-plans/{pid}/pause")
    assert again.status_code == 409 and "already paused" in again.json()["error"]
    r = _call("POST", f"/api/dca-plans/{pid}/resume")
    assert r.status_code == 200 and r.json()["status"] == "active" and r.json()["next_execution"]
    assert _call("POST", "/api/dca-plans/nope/resume").status_code == 404
    assert _call("GET", "/api/dca-plans/").json()[0]["status"] == "active"


def test_executor_skips_paused_plans():
    pid = _plan()
    dca.set_plan_status("tester", pid, "paused")
    asyncio.run(dca.check_and_execute_dcas())
    plan = dca._load_plans("tester")[0]
    assert plan["execution_count"] == 0 and plan["execution_log"] == []
    dca.set_plan_status("tester", pid, "active")
    asyncio.run(dca.check_and_execute_dcas())  # never ran and start date passed: due now
    assert dca._load_plans("tester")[0]["execution_count"] == 1


def test_resume_schedules_from_now_without_catch_up():
    now = datetime.now(timezone.utc)
    last = (now - timedelta(days=30)).isoformat()  # four weekly buys missed while paused
    pid = _plan(status="paused", last_executed=last, execution_count=3)
    resumed = dca.set_plan_status("tester", pid, "active", now=now)
    assert resumed["next_execution"] == (now + timedelta(days=7)).isoformat()
    for _ in range(3):  # several hourly checks: nothing is logged right after resuming
        asyncio.run(dca.check_and_execute_dcas())
    plan = dca._load_plans("tester")[0]
    assert plan["execution_count"] == 3 and plan["last_executed"] == last
    later = now + timedelta(days=7, minutes=1)
    assert dca._is_due(plan, later) and not dca._is_due(plan, now + timedelta(days=6))


def test_short_pause_still_skips_to_one_period_after_resume():
    now = datetime(2026, 3, 10, tzinfo=timezone.utc)
    plan = {"status": "active", "start_date": "2026-03-01", "frequency": "daily",
            "last_executed": "2026-03-01T00:00:00+00:00", "resumed_at": "2026-03-09T12:00:00+00:00"}
    assert dca.next_execution(plan, now) == "2026-03-10T12:00:00+00:00"
    assert dca.next_execution({**plan, "resumed_at": None}, now) == now.isoformat()  # overdue, no resume: due now
