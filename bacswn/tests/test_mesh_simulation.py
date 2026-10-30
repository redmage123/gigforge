"""Mesh simulation: 2-of-3 precog ensemble, minority reports, peer consensus, routing, faults."""

import pytest
from httpx import AsyncClient

from services.mesh_network import MeshSimulation, _classify, HUB, EVAL_TICKS


@pytest.fixture
def sim():
    m = MeshSimulation(seed=11)
    m.cells.clear()             # start from clear skies for deterministic checks
    for _ in range(2):
        m.step()
    m.cells.clear()
    return m


def _quiet(m, ticks):
    """Step while suppressing random new storms."""
    for _ in range(ticks):
        m.cells = [c for c in m.cells if c["id"].startswith("keep")]
        m.step()
        m.cells = [c for c in m.cells if c["id"].startswith("keep")]


@pytest.mark.parametrize("args,expected", [
    ((0, 12, 10, 3500), "CLEAR"),
    ((32, 15, 8, 3000), "SHOWERS"),
    ((10, 12, 1.5, 3000), "IFR"),
    ((48, 30, 4, 2000), "TSRA"),
    ((50, 40, 2, 1500, True), "SQUALL"),
])
def test_classify(args, expected):
    assert _classify(*args) == expected


def test_routing_finds_path_and_reroutes_around_outage(sim):
    path, cost = sim.route("MYIG", HUB)
    assert path[0] == "MYIG" and path[-1] == HUB and cost > 0
    relay = path[1]
    sim.inject_fault("node_down", station=relay)
    new_path, _ = sim.route("MYIG", HUB) or (None, None)
    if new_path is not None:
        assert relay not in new_path


def test_corrupted_model_is_outvoted_then_quarantined(sim):
    sim.inject_fault("corrupt_precog", station="MYCB", precog="LEXIS")
    _quiet(sim, 40)
    node = sim.nodes["MYCB"]
    assert node["verdict"]["call"] == "CLEAR"                      # 2-of-3 kept the station correct
    assert node["precogs"]["LEXIS"]["quarantined"] is True
    reports = [r for r in sim.minority_reports if r["station"] == "MYCB" and r["precog"] == "LEXIS"]
    assert reports and any(r["status"] == "DISMISSED" for r in reports)
    assert not node["precogs"]["TEMPO"]["quarantined"] and not node["precogs"]["VISTA"]["quarantined"]


def test_stuck_sensor_is_caught_by_peer_radar(sim):
    sim.inject_fault("sensor_fault", station="MYEG", sensor="visibility")
    _quiet(sim, 4)
    node = sim.nodes["MYEG"]
    assert node["verdict"]["call"] == "IFR"                        # TEMPO + LEXIS fooled by the sensor
    event = next(e for e in sim.consensus_log if e["station"] == "MYEG")
    assert event["result"] == "REJECTED"
    assert node["suspect"]
    assert any(m["type"] == "MAINT" for m in sim.messages)


def _inbound_cell(sim, code):
    """A strong cell just upwind, moving straight at the station: outside sensor
    range now, but inside VISTA's 30-minute nowcast."""
    t = sim.nodes[code]
    cell = sim._spawn_cell("convective", t["lat"], t["lon"] + 0.38, 270, 17, 56, 0.3, life=80)
    cell["id"], cell["age"] = "keep-1", 30
    return t


def test_station_warns_before_storm_arrives(sim):
    target = _inbound_cell(sim, "MYAM")
    first_verdict = first_truth = None
    for _ in range(EVAL_TICKS + 4):
        _quiet(sim, 1)
        if first_verdict is None and target["verdict"]["call"] != "CLEAR":
            first_verdict = sim.tick
        if first_truth is None and target["truth"] != "CLEAR":
            first_truth = sim.tick
    assert first_verdict is not None and first_truth is not None
    assert first_verdict < first_truth                              # the ensemble called it early
    assert not target["precogs"]["VISTA"]["quarantined"]


def test_lone_vista_dissent_is_vindicated(sim):
    # Cut Marsh Harbour off so no peer hand-off can corroborate VISTA: it dissents alone.
    for peer in list(sim._peers("MYAM")):
        sim.inject_fault("link_down", station="MYAM", peer=peer)
    target = _inbound_cell(sim, "MYAM")
    _quiet(sim, EVAL_TICKS + 2)
    vista = [r for r in sim.minority_reports if r["station"] == "MYAM" and r["precog"] == "VISTA"]
    assert vista and any(r["status"] == "VINDICATED" for r in vista)
    assert not target["precogs"]["VISTA"]["quarantined"]


def test_continuous_dissent_files_one_report(sim):
    sim.inject_fault("sensor_fault", station="MYER", sensor="rain")   # TEMPO+LEXIS see 45 mm/h
    _quiet(sim, 6)
    vista = [r for r in sim.minority_reports if r["station"] == "MYER" and r["precog"] == "VISTA"]
    assert len({r["minority_call"] for r in vista}) == len(vista)     # no duplicate per episode


def test_partition_queues_alerts_then_delivers(sim):
    sim.run_scenario("partition")
    assert sim.route("MYIG", HUB) is None
    assert sim._node_view(sim.nodes["MYIG"])["status"] in ("caution", "degraded")
    node = sim.nodes["MYIG"]
    sim._send_to_hub(node, "ALERT", "test alert")
    assert node["queue"]
    for code in ("MYIG", "MYMM", "MYRD"):
        sim.inject_fault("clear", station=code)
    sim._flush_queue(node)
    assert not node["queue"]
    assert any(m["via"] == "STORE_FWD" for m in sim.messages)


def test_status_shape(sim):
    s = sim.status()
    assert s["total_nodes"] == 15 and s["hub"] == HUB
    n = s["nodes"][0]
    assert {p["id"] for p in n["precogs"]} == {"TEMPO", "VISTA", "LEXIS"}
    assert "dismissals" not in n["precogs"][0]


def test_bad_fault_requests(sim):
    assert "error" in sim.inject_fault("node_down", station="XXXX")
    assert "error" in sim.inject_fault("corrupt_precog", station="MYNN", precog="ORACLE")
    assert "error" in sim.inject_fault("link_down", station="MYNN", peer="MYIG")
    assert "error" in sim.run_scenario("nope")


async def test_mesh_api(client: AsyncClient, auth_token: str):
    h = {"Authorization": f"Bearer {auth_token}"}
    assert (await client.get("/api/mesh/status", headers=h)).json()["total_nodes"] == 15
    assert (await client.get("/api/mesh/node/mynn", headers=h)).json()["is_hub"] is True
    assert (await client.get("/api/mesh/node/XXXX", headers=h)).status_code == 404
    assert (await client.post("/api/mesh/fault", headers=h, json={"kind": "sensor_fault", "station": "MYEG", "sensor": "wind"})).status_code == 200
    assert (await client.post("/api/mesh/fault", headers=h, json={"kind": "bogus", "station": "MYEG"})).status_code == 400
    assert (await client.post("/api/mesh/storm", headers=h, json={"kind": "fog", "lat": 25.0, "lon": -77.4})).json()["kind"] == "fog"
    assert (await client.post("/api/mesh/scenario/squall_line", headers=h)).status_code == 200
    assert (await client.post("/api/mesh/consensus?station=MYNN", headers=h)).status_code == 200
    assert (await client.post("/api/mesh/scenario/reset", headers=h)).status_code == 200
