"""Mesh: simulated Tomorrow.io satellite feed, ground sensor networks, live Tomorrow.io client."""

import httpx
import pytest
from httpx import AsyncClient

from services import tomorrow_client as tc
from services.mesh_network import MeshSimulation
from services.mesh_satellite import FRESH_TICKS, INSTRUMENTS


@pytest.fixture
def sim():
    m = MeshSimulation(seed=11)
    m.cells.clear()
    for _ in range(2):
        m.step()
    m.cells.clear()
    return m


def _quiet(m, ticks):
    for _ in range(ticks):
        m.cells = [c for c in m.cells if c["id"].startswith("keep")]
        m.step()
        m.cells = [c for c in m.cells if c["id"].startswith("keep")]


def test_passes_arrive_after_latency_and_age_out(sim):
    n = sim.nodes["MYNN"]
    _quiet(sim, INSTRUMENTS["radar"]["revisit_ticks"] + 2)
    radar = n["satellite"]["radar"]
    assert radar is not None and radar["available_tick"] == radar["tick"] + INSTRUMENTS["radar"]["latency_ticks"]
    view = sim.satellite.view(n)
    assert view["radar"]["fresh"] and view["call"] == "CLEAR" and view["simulated"]
    assert 0 < view["next_pass_min"]["radar"] <= INSTRUMENTS["radar"]["revisit_ticks"] * 5
    n["satellite"]["radar"]["tick"] = sim.tick - FRESH_TICKS - 1          # make it stale
    n["satellite"]["sounder"]["tick"] = sim.tick - FRESH_TICKS - 1
    assert sim.satellite.call_now(n) is None


def test_satellite_sees_cells_beyond_the_station_and_forecasts_arrival(sim):
    t = sim.nodes["MYAM"]
    cell = sim._spawn_cell("convective", t["lat"], t["lon"] + 0.8, 270, 30, 55, 0.3, life=90)
    cell["id"], cell["age"] = "keep-sat", 40
    _quiet(sim, INSTRUMENTS["radar"]["revisit_ticks"] + 1)
    view = sim.satellite.view(t)
    assert any(c["id"] == "keep-sat" for c in view["radar"]["cells"])
    assert any(o["id"] == "keep-sat" for o in view["outlook"])


def test_stuck_rain_gauge_flagged_by_satellite(sim):
    sim.inject_fault("sensor_fault", station="MYER", sensor="rain")
    _quiet(sim, INSTRUMENTS["radar"]["revisit_ticks"] + 3)
    n = sim.nodes["MYER"]
    rng = next(s for s in sim.sensor_net.view(n) if s["code"] == "RNG")
    assert rng["status"] == "SUSPECT" and "satellite" in rng["flag"] and rng["injected_fault"] == "rain"
    assert n["precogs"]["TEMPO"]["confidence"] < 0.62 and "satellite contradicts RNG" in n["precogs"]["TEMPO"]["reason"]
    sim.inject_fault("clear", station="MYER")
    _quiet(sim, 1)
    assert next(s for s in sim.sensor_net.view(n) if s["code"] == "RNG")["status"] == "OK"


def test_no_false_sensor_flags_in_normal_weather():
    m = MeshSimulation(seed=4)
    for _ in range(250):
        m.step()
        assert not any(n["sat_issues"] for n in m.nodes.values())


def test_satellite_breaks_an_ensemble_tie(sim):
    n = sim.nodes["MYCB"]
    for pid, call in (("TEMPO", "SHOWERS"), ("VISTA", "TSRA"), ("LEXIS", "CLEAR")):
        n["precogs"][pid]["call"] = call
    sim.satellite.call_now = lambda node, *a: "TSRA"
    sim._decide(n)
    assert n["verdict"]["call"] == "TSRA" and n["verdict"]["agreement"] == "SAT TIE-BREAK"
    assert "VISTA" in n["verdict"]["tiebreak"] and not n["verdict"]["split"]
    sim.satellite.call_now = lambda node, *a: "SQUALL"                 # matches no model: hold
    sim._decide(n)
    assert n["verdict"]["split"] and n["verdict"]["call"] == "TSRA"


def test_isolated_station_confirmed_by_satellite():
    m = MeshSimulation(seed=5)
    t = m.nodes["MYAM"]
    for p in list(m._peers("MYAM")):
        m.inject_fault("link_down", station="MYAM", peer=p)
    c = m._spawn_cell("convective", t["lat"], t["lon"], 270, 5, 56, 0.4, life=200)
    c["age"] = 60
    for _ in range(16):
        m.step()
    events = [e for e in m.consensus_log if e["station"] == "MYAM"]
    assert any(e["result"] == "CONFIRMED" and e["votes"] == {"SAT": "AGREE"} for e in events)


def test_satellite_votes_in_peer_verification(sim):
    _quiet(sim, INSTRUMENTS["radar"]["revisit_ticks"] + 1)
    n = sim.nodes["MYEG"]
    sim._start_consensus(n, "TSRA")                                   # clear skies: satellite disagrees
    ev = sim.consensus_log[0]
    assert ev["votes"]["SAT"] == "DISAGREE" and ev["result"] == "REJECTED"
    assert "satellite" in n["suspect"]


def test_sensor_network_shape_outstations_and_staleness(sim):
    n = sim.nodes["MYNN"]
    view = sim.sensor_net.view(n)
    assert len(view) == 10 and {s["code"] for s in view} >= {"WND", "BAR", "RNG", "LTG", "TID", "OS1", "OS2"}
    os1 = n["sensor_net"]["OS1"]
    cell = sim._spawn_cell("convective", os1["lat"], os1["lon"], 0, 1, 56, 0.12, life=200)
    cell["id"], cell["age"] = "keep-os", 100
    _quiet(sim, 1)
    readings = {s["code"]: s["readings"] for s in sim.sensor_net.view(n)}
    assert readings["OS1"]["rain_mm_h"] > readings["RNG"]["rain_mm_h"] + 5     # outstation sees it first
    assert readings["RNG"]["rain_mm_h"] == n["sensors"]["rain_mm_h"]           # station gauge feeds TEMPO
    assert len(next(s for s in sim.sensor_net.view(n) if s["code"] == "WND")["history"]["gust_kt"]) >= 2
    n["sensor_net"]["BAR"]["stale_until"] = sim.tick + 3
    last = dict(n["sensor_net"]["BAR"]["readings"])
    _quiet(sim, 1)
    bar = next(s for s in sim.sensor_net.view(n) if s["code"] == "BAR")
    assert bar["status"] == "STALE" and bar["readings"] == last
    sim.inject_fault("node_down", station="MYNN")
    assert {s["status"] for s in sim.sensor_net.view(n)} == {"OFFLINE"}


async def test_node_detail_api_includes_dashboard_data(client: AsyncClient, auth_token: str):
    h = {"Authorization": f"Bearer {auth_token}"}
    d = (await client.get("/api/mesh/node/MYNN", headers=h)).json()
    assert len(d["sensor_net"]) == 10 and "radar" in d["satellite_detail"] and "gust_kt" in d["metrics"]
    s = (await client.get("/api/mesh/status", headers=h)).json()
    assert "sensor_net" not in s["nodes"][0] and s["nodes"][0]["sensor_network"]["total"] == 10
    assert (await client.get("/api/mesh/node/XXXX/live-weather", headers=h)).status_code == 404


# ── live Tomorrow.io client ─────────────────────────────────────────────────

class _FakeClient:
    def __init__(self, responses):
        self.responses, self.calls = list(responses), []

    async def get(self, url, params=None):
        self.calls.append(params)
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return httpx.Response(r[0], json=r[1], request=httpx.Request("GET", url))


@pytest.fixture
def live(monkeypatch):
    monkeypatch.setattr(tc, "TOMORROW_API_KEY", "test-key")
    monkeypatch.setattr(tc, "_cache", {})
    monkeypatch.setattr(tc, "_calls", __import__("collections").deque())
    monkeypatch.setattr(tc, "_backoff_until", 0.0)
    return monkeypatch


async def test_live_not_configured(monkeypatch, client: AsyncClient, auth_token: str):
    monkeypatch.setattr(tc, "TOMORROW_API_KEY", "")
    r = (await client.get("/api/mesh/node/MYNN/live-weather", headers={"Authorization": f"Bearer {auth_token}"})).json()
    assert r["configured"] is False and r["station"] == "MYNN"


async def test_live_normalises_and_caches(live):
    body = {"data": {"time": "2026-10-31T12:00:00Z", "values": {
        "temperature": 28.4, "windSpeed": 5.0, "windGust": 9.0, "windDirection": 95, "pressureSurfaceLevel": 1013.2,
        "rainIntensity": 1.2, "visibility": 16.0, "cloudCeiling": 0.9, "humidity": 74, "weatherCode": 4200}}}
    fake = _FakeClient([(200, body)])
    live.setattr(tc, "_client", fake)
    r = await tc.realtime("MYNN", 25.04, -77.47)
    v = r["values"]
    assert r["status"] == "ok" and v["wind_kt"] == 10 and v["gust_kt"] == 17 and v["weather"] == "Light rain"
    assert v["visibility_sm"] == pytest.approx(9.9, abs=0.1) and v["ceiling_ft"] == 3000
    assert fake.calls[0]["location"] == "25.04,-77.47" and fake.calls[0]["units"] == "metric"
    again = await tc.realtime("MYNN", 25.04, -77.47)
    assert again["cached"] and len(fake.calls) == 1


async def test_live_rate_limit_backoff_budget_and_errors(live):
    live.setattr(tc, "_client", _FakeClient([(429, {}), httpx.ConnectError("down")]))
    r = await tc.realtime("MYNN", 25.0, -77.4)
    assert r["status"] == "rate_limited" and "test-key" not in str(r)
    assert (await tc.realtime("MYEG", 23.5, -75.8))["status"] == "rate_limited"     # backing off: no call
    live.setattr(tc, "_backoff_until", 0.0)
    assert (await tc.realtime("MYEG", 23.5, -75.8))["status"] == "error"
    live.setattr(tc, "HOURLY_BUDGET", 0)
    assert (await tc.realtime("MYAM", 26.5, -77.1))["status"] == "budget"
