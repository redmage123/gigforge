"""Presenter controls: a station shows a chosen verdict and voting outcome on demand."""

import pytest

from services.mesh_network import HAZARDS, MeshSimulation


@pytest.fixture
def sim():
    m = MeshSimulation(seed=5)
    m.background_weather = False
    m.cells.clear()
    for _ in range(3):
        m.step()
    return m


def run(m, ticks):
    for _ in range(ticks):
        m.step()


@pytest.mark.parametrize("call", ["SHOWERS", "IFR", "TSRA", "SQUALL"])
def test_agree_all_three_models_agree(sim, call):
    r = sim.present("MYEG", call, "agree")
    assert r["ok"] and r["hold_seconds"] >= 60
    run(sim, 6)
    n = sim.nodes["MYEG"]
    assert n["truth"] == call
    assert n["verdict"]["call"] == call and n["verdict"]["agreement"] == "3/3"


def test_agree_holds_for_the_presentation(sim):
    sim.present("MYEG", "TSRA", "agree")
    run(sim, 80)
    assert sim.nodes["MYEG"]["verdict"]["call"] == "TSRA"


def test_dissent_one_model_files_minority_report(sim):
    sim.present("MYEG", "TSRA", "dissent", model="LEXIS")
    run(sim, 6)
    n = sim.nodes["MYEG"]
    assert n["verdict"]["call"] == "TSRA" and n["verdict"]["agreement"] == "2/3"
    assert n["precogs"]["LEXIS"]["call"] == "CLEAR"
    assert any(r["station"] == "MYEG" and r["precog"] == "LEXIS" for r in sim.minority_reports)


def test_dissent_on_clear_is_a_lone_false_alarm(sim):
    sim.present("MYEG", "CLEAR", "dissent", model="TEMPO")
    run(sim, 4)
    n = sim.nodes["MYEG"]
    assert n["verdict"]["call"] == "CLEAR" and n["precogs"]["TEMPO"]["call"] == "TSRA"


@pytest.mark.parametrize("call", ["SHOWERS", "IFR", "TSRA", "SQUALL"])
def test_split_is_decided_by_the_satellite(sim, call):
    sim.present("MYEG", call, "split")
    run(sim, 4)
    v = sim.nodes["MYEG"]["verdict"]
    assert v["agreement"] == "SAT TIE-BREAK" and v["call"] == call
    calls = {pc["call"] for pc in sim.nodes["MYEG"]["precogs"].values()}
    assert len(calls) == 3


def test_peers_confirm(sim):
    sim.present("MYEG", "TSRA", "peers_confirm")
    event = sim.consensus_log[0]
    assert event["station"] == "MYEG" and event["result"] == "CONFIRMED"


def test_peers_reject_flags_maintenance(sim):
    sim.present("MYEG", "SQUALL", "peers_reject")
    event = sim.consensus_log[0]
    assert event["station"] == "MYEG" and event["result"] == "REJECTED"
    assert sim.nodes["MYEG"]["suspect"]
    assert sim.nodes["MYEG"]["verdict"]["call"] == "SQUALL"


def test_clear_faults_removes_presenter_scenario(sim):
    sim.present("MYEG", "TSRA", "dissent", model="VISTA")
    run(sim, 3)
    sim.inject_fault("clear", station="MYEG")
    assert not any(c.get("presenter") == "MYEG" for c in sim.cells)
    assert all(pc["forced"] is None for pc in sim.nodes["MYEG"]["precogs"].values())
    run(sim, 6)
    assert sim.nodes["MYEG"]["verdict"]["call"] == "CLEAR"


@pytest.mark.parametrize("args,err", [
    (("NOPE", "TSRA", "agree"), "Unknown station"),
    (("MYEG", "HAIL", "agree"), "call must be"),
    (("MYEG", "TSRA", "maybe"), "outcome must be"),
    (("MYEG", "CLEAR", "peers_confirm"), "CLEAR"),
])
def test_invalid_requests(sim, args, err):
    assert err in sim.present(*args)["error"]


def test_offline_station_refused(sim):
    sim.inject_fault("node_down", station="MYEG")
    assert "offline" in sim.present("MYEG", "TSRA", "agree")["error"]


async def test_present_api(client, auth_token):
    client.cookies.clear()
    h = {"Authorization": f"Bearer {auth_token}"}
    r = await client.post("/api/mesh/present", json={"station": "MYEG", "call": "IFR", "outcome": "agree"}, headers=h)
    assert r.status_code == 200 and r.json()["ok"]
    r = await client.post("/api/mesh/present", json={"station": "MYEG", "call": "XX", "outcome": "agree"}, headers=h)
    assert r.status_code == 400
    assert HAZARDS[0] == "CLEAR"
