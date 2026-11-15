"""Guided stories: each beat produces what its caption says, across random seeds."""

import pytest

from services import demo_pause
from services.mesh_network import HUB, MeshSimulation, STORY_HOLD_MAX

SEEDS = (1, 2, 3, 4, 5)


def _calls(n):
    return {k: v["call"] for k, v in n["precogs"].items()}


@pytest.mark.parametrize("seed", SEEDS)
def test_squall_story(seed):
    m = MeshSimulation(seed=seed)
    m.story_beat("squall", "start")                     # resets the mesh: take nodes after it
    at, am = m.nodes["MYAT"], m.nodes["MYAM"]
    assert at["verdict"]["call"] == "CLEAR" and m.story == {**m.story, "name": "squall", "beat": "start"}

    m.story_beat("squall", "vista")                      # VISTA alone sees it coming, files a minority report
    assert _calls(at) == {"TEMPO": "CLEAR", "VISTA": "SQUALL", "LEXIS": "CLEAR"}
    assert "arrival in" in at["precogs"]["VISTA"]["reason"]
    assert any(r["station"] == "MYAT" and r["precog"] == "VISTA" and r["minority_call"] == "SQUALL"
               for r in m.minority_reports)

    m.story_beat("squall", "arrive")                     # all three agree, peers confirm, alert to the hub
    assert at["verdict"]["call"] == "SQUALL" and at["verdict"]["agreement"] == "3/3"
    ev = next(e for e in m.consensus_log if e["station"] == "MYAT")
    assert ev["claim"] == "SQUALL" and ev["result"] == "CONFIRMED"
    assert any(x["type"] == "ALERT" and "MYAT" in x["detail"] and x["destination"] == HUB for x in m.messages)
    assert all(r["status"] == "VINDICATED" for r in m.minority_reports
               if r["station"] == "MYAT" and r["minority_call"] == "SQUALL")

    m.story_beat("squall", "handoff")                    # Marsh Harbour warned ahead, and believed
    assert any(p["source"] == "MYAT" and p["target"] == "MYAM" for p in m.propagation.values())
    assert am["precogs"]["LEXIS"]["call"] == "SQUALL" and am["precogs"]["TEMPO"]["call"] == "CLEAR"
    assert "Upstream warning from MYAT" in am["precogs"]["LEXIS"]["reason"]
    assert am["suspect"] is None                         # an early warning is not mistaken for a fault


@pytest.mark.parametrize("seed", SEEDS)
def test_stuck_sensor_story(seed):
    m = MeshSimulation(seed=seed)
    m.story_beat("stuck_sensor", "start")
    eg = m.nodes["MYEG"]
    assert eg["verdict"]["call"] == "CLEAR" and eg["suspect"] is None
    m.story_beat("stuck_sensor", "fault")
    assert _calls(eg) == {"TEMPO": "IFR", "VISTA": "CLEAR", "LEXIS": "IFR"}
    ev = next(e for e in m.consensus_log if e["station"] == "MYEG")
    assert ev["claim"] == "IFR" and ev["result"] == "REJECTED"
    assert eg["suspect"] and any(x["type"] == "MAINT" and "MYEG" in x["detail"] for x in m.messages)
    assert not any(x["type"] == "ALERT" and "IFR CONFIRMED at MYEG" in x["detail"] for x in m.messages)
    m.story_beat("stuck_sensor", "repair")
    assert eg["verdict"]["call"] == "CLEAR" and eg["suspect"] is None and not eg["sensor_faults"]


@pytest.mark.parametrize("seed", SEEDS)
def test_cut_off_story(seed):
    m = MeshSimulation(seed=seed)
    m.story_beat("cut_off", "start")
    ig = m.nodes["MYIG"]
    assert m.route("MYIG", HUB)
    m.story_beat("cut_off", "cut")
    assert m.route("MYIG", HUB) is None and set(m._peers("MYIG")) <= {"MYMM", "MYRD"}
    m.story_beat("cut_off", "storm")
    assert ig["verdict"]["call"] == "TSRA"
    assert any(e["station"] == "MYIG" and e["result"] == "CONFIRMED" for e in m.consensus_log)
    assert ig["queue"] and all(q["type"] == "ALERT" for q in ig["queue"])
    m.story_beat("cut_off", "restore")
    assert not ig["queue"] and m.route("MYIG", HUB)
    assert any(x["via"] == "STORE_FWD" and x["detail"].startswith("[delayed") for x in m.messages)


def test_story_holds_the_mesh_and_releases(monkeypatch):
    m = MeshSimulation(seed=1)
    m.story_beat("stuck_sensor", "start")
    tick = m.tick
    clock = demo_pause.clock()
    monkeypatch.setattr(demo_pause, "clock", lambda: clock + 30)
    m.advance()
    assert m.tick == tick                                # held between beats
    monkeypatch.setattr(demo_pause, "clock", lambda: clock + STORY_HOLD_MAX + 5)
    m.advance()
    assert m.story is None                               # abandoned story releases the mesh
    m.story_beat("stuck_sensor", "start")
    assert m.story_end() == {"ok": True} and m.story is None


def test_story_errors():
    m = MeshSimulation(seed=1)
    assert "Unknown story" in m.story_beat("nope", "start")["error"]
    assert "Unknown beat" in m.story_beat("squall", "nope")["error"]
    assert "Start the squall story first" in m.story_beat("squall", "vista")["error"]
    m.story_beat("cut_off", "start")
    assert "Start the squall story first" in m.story_beat("squall", "arrive")["error"]
    assert m.status()["story"] == {"name": "cut_off", "beat": "start"}


def test_early_warning_peer_review_uses_lookahead():
    """A hazard on its way counts as corroboration; nothing anywhere still does not."""
    m = MeshSimulation(seed=3)
    m.story_beat("squall", "start")
    am = m.nodes["MYAM"]
    m._place(m._story_cell(), "MYAM", 18, 130)          # ~20 min out
    m._start_consensus(am, "SQUALL")
    ev = m.consensus_log[0]
    assert ev["result"] == "CONFIRMED"
    assert any("arriving over MYAM" in why for why in ev["reasons"].values())
    m.cells = []
    m._start_consensus(am, "SQUALL")
    assert m.consensus_log[0]["result"] == "REJECTED"


async def test_story_api(client, auth_token):
    client.cookies.clear()
    h = {"Authorization": f"Bearer {auth_token}"}
    r = await client.post("/api/mesh/story", json={"story": "stuck_sensor", "beat": "start"}, headers=h)
    assert r.status_code == 200 and r.json()["beat"] == "start"
    r = await client.post("/api/mesh/story", json={"story": "stuck_sensor", "beat": "bogus"}, headers=h)
    assert r.status_code == 400
    assert (await client.get("/api/mesh/status", headers=h)).json()["story"]["name"] == "stuck_sensor"
    assert (await client.post("/api/mesh/story/end", headers=h)).json() == {"ok": True}
    assert (await client.get("/api/mesh/status", headers=h)).json()["story"] is None
