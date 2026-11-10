"""Demo pause: one switch freezes the simulations and broadcasts for every viewer."""

import pytest

from services import demo_pause


@pytest.fixture(autouse=True)
def _fresh_pause():
    demo_pause._reset_for_tests()
    yield
    demo_pause._reset_for_tests()


def test_clock_stands_still_while_paused_and_excludes_paused_time(monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(demo_pause.time, "time", lambda: now[0])
    assert demo_pause.clock() == 1000.0
    demo_pause.pause(by="admin")
    now[0] = 1060.0
    assert demo_pause.is_paused() and demo_pause.clock() == 1000.0
    demo_pause.pause()                       # pausing twice keeps the original start
    demo_pause.resume()
    assert demo_pause.clock() == 1000.0      # resumes exactly where it stopped
    now[0] = 1070.0
    assert demo_pause.clock() == 1010.0
    demo_pause.resume()                      # resuming twice is harmless
    assert demo_pause.clock() == 1010.0


def test_status_reports_who_paused():
    assert demo_pause.status() == {"paused": False}
    s = demo_pause.pause(by="drazen")
    assert s["paused"] and s["by"] == "drazen" and s["since"]
    assert demo_pause.resume() == {"paused": False}


def test_mesh_simulation_does_not_advance_while_paused(monkeypatch):
    from services.mesh_network import TICK_SECONDS, MeshSimulation
    now = [5000.0]
    monkeypatch.setattr(demo_pause.time, "time", lambda: now[0])
    sim = MeshSimulation(seed=1)
    t0 = sim.tick                            # reset() runs a few warm-up ticks
    now[0] += TICK_SECONDS * 3
    sim.advance()
    assert sim.tick == t0 + 3
    demo_pause.pause()
    now[0] += TICK_SECONDS * 50
    sim.advance()
    assert sim.tick == t0 + 3
    demo_pause.resume()
    sim.advance()
    assert sim.tick == t0 + 3                # no catch-up for the paused time
    now[0] += TICK_SECONDS * 2
    sim.advance()
    assert sim.tick == t0 + 5


def test_simulated_flights_hold_position_while_paused():
    from services import opensky_client
    first = opensky_client._generate_simulated_flights()
    demo_pause.pause()
    frozen = opensky_client._generate_simulated_flights()
    assert frozen == opensky_client._generate_simulated_flights()
    assert [f["icao24"] for f in frozen] == [f["icao24"] for f in first]


async def test_broadcast_is_suppressed_while_paused():
    from services.websocket_manager import WebSocketManager

    class FakeWS:
        def __init__(self):
            self.sent = []

        async def send_text(self, m):
            self.sent.append(m)

    mgr = WebSocketManager()
    ws = FakeWS()
    mgr._connections["alerts"] = [ws]
    demo_pause.pause()
    await mgr.broadcast("alerts", {"x": 1})
    assert ws.sent == []
    demo_pause.resume()
    await mgr.broadcast("alerts", {"x": 1})
    assert len(ws.sent) == 1


async def test_periodic_task_skips_work_while_paused(monkeypatch):
    from services import scheduler
    calls = []

    async def work():
        calls.append(1)

    async def fake_sleep(_):
        raise scheduler.asyncio.CancelledError

    monkeypatch.setattr(scheduler.asyncio, "sleep", fake_sleep)
    demo_pause.pause()
    with pytest.raises(scheduler.asyncio.CancelledError):
        await scheduler._run_periodic(work, 1, "t")
    assert calls == []


async def test_pause_api_round_trip(client, auth_token):
    client.cookies.clear()
    h = {"Authorization": f"Bearer {auth_token}"}
    assert (await client.get("/api/demo/pause", headers=h)).json() == {"paused": False}
    r = await client.post("/api/demo/pause", json={"paused": True}, headers=h)
    assert r.status_code == 200 and r.json()["paused"] is True and r.json()["by"]
    assert (await client.get("/api/demo/pause", headers=h)).json()["paused"] is True
    r = await client.post("/api/demo/pause", json={"paused": False}, headers=h)
    assert r.json() == {"paused": False}


async def test_pause_api_requires_login(client):
    client.cookies.clear()
    assert (await client.get("/api/demo/pause")).status_code == 401
    assert (await client.post("/api/demo/pause", json={"paused": True})).status_code == 401
    assert not demo_pause.is_paused()


async def test_pause_poll_is_not_rate_limited():
    from unittest.mock import AsyncMock, MagicMock

    from middleware.rate_limiter import RateLimiter
    limiter = RateLimiter(AsyncMock(), max_requests=1, window_seconds=60)

    def req(path):
        r = MagicMock()
        r.url.path, r.client.host = path, "9.9.9.9"
        return r

    async def ok(_):
        return MagicMock(status_code=200)

    assert (await limiter.dispatch(req("/api/x"), ok)).status_code == 200
    assert (await limiter.dispatch(req("/api/x"), ok)).status_code == 429
    for _ in range(5):
        assert (await limiter.dispatch(req("/api/demo/pause"), ok)).status_code == 200
