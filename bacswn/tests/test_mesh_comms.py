"""Mesh communications: channels per station and link, weather damage, failover with hysteresis."""

import pytest

from services import mesh_comms as comms
from services.mesh_network import HUB, MeshSimulation


def _link(m, a, b):
    return m.links.get((a, b)) or m.links[(b, a)]


@pytest.fixture
def sim():
    m = MeshSimulation(seed=1)
    m.background_weather = False
    m.cells = []
    return m


def test_station_equipment_follows_the_plan(sim):
    assert set(sim.nodes["MYNN"]["comms"]) == {"wired", "vhf", "cellular", "satellite"}
    assert set(sim.nodes["MYBC"]["comms"]) == {"vhf", "satellite"}            # no cell, no wired (§5.3)
    assert set(sim.nodes["MYAT"]["comms"]) == {"vhf", "cellular", "satellite"}
    for code in ("MYIG", "MYMM", "MYRD"):
        assert "cellular" not in sim.nodes[code]["comms"] and "wired" not in sim.nodes[code]["comms"]


def test_link_channels_and_preference(sim):
    assert _link(sim, "MYAT", "MYAM")["channels"] == ["vhf", "cellular", "satellite"]   # 22 nm
    assert _link(sim, "MYNN", "MYBC")["channels"] == ["vhf", "satellite"]              # Chub Cay: no cell
    spoke = _link(sim, "MYGF", HUB)
    assert spoke["channels"][0] == "wired" and spoke["active"] == "wired"
    # Wired runs only to the hub, never station to station.
    assert all("wired" not in l["channels"] for l in sim.links.values() if HUB not in (l["a"], l["b"]))
    # A wired spoke can reach the hub beyond radio range (Long Island).
    assert _link(sim, "MYLD", HUB)["channels"][0] == "wired"


def test_failover_then_failback_after_hysteresis(sim):
    l = _link(sim, "MYAT", "MYAM")
    assert l["active"] == "vhf"
    comms.damage(sim, "MYAT", "vhf", "test", None)
    sim.step()
    assert l["active"] == "cellular" and l["latency_ms"] > comms.latency_ms("vhf", l["distance_nm"] / 60)
    comms.damage(sim, "MYAM", "cellular", "test", None)
    sim.step()
    assert l["active"] == "satellite"                                     # second fallback
    comms.repair(sim, "MYAT", "vhf")
    sim.step()
    assert l["active"] == "satellite"                                     # not straight back: hysteresis
    view = next(x for x in sim.status()["links"] if {x["a"], x["b"]} == {"MYAT", "MYAM"})
    assert view["on_backup"] and view["switch_back"]["channel"] == "vhf"
    for _ in range(comms.HYSTERESIS_TICKS + 1):
        sim.step()
    assert l["active"] == "vhf"
    kinds = [e["kind"] for e in sim.events]
    assert {"FAILOVER", "FAILBACK", "COMMS_DOWN", "COMMS_UP"} <= set(kinds)


def test_flapping_channel_resets_the_wait(sim):
    l = _link(sim, "MYNN", "MYBC")
    comms.damage(sim, "MYBC", "vhf", "test", None)
    sim.step()
    comms.repair(sim, "MYBC", "vhf")
    for _ in range(comms.HYSTERESIS_TICKS - 2):
        sim.step()
    comms.damage(sim, "MYBC", "vhf", "flicker", None)                     # drops again before it is trusted
    sim.step()
    comms.repair(sim, "MYBC", "vhf")
    for _ in range(comms.HYSTERESIS_TICKS - 2):
        sim.step()
    assert l["active"] == "satellite"
    for _ in range(4):
        sim.step()
    assert l["active"] == "vhf"


def test_link_lost_only_when_every_channel_fails(sim):
    l = _link(sim, "MYNN", "MYBC")
    comms.damage(sim, "MYBC", "vhf", "test", None)
    comms.damage(sim, "MYBC", "satellite", "test", None)
    sim.step()
    assert l["active"] is None and "MYBC" not in sim._peers("MYNN")
    assert sim.route("MYBC", HUB) is None
    view = next(x for x in sim.status()["links"] if {x["a"], x["b"]} == {"MYNN", "MYBC"})
    assert view["up"] is False and all(not c["ok"] for c in view["channels"])


def test_squall_gusts_damage_terrestrial_equipment_not_satellite(sim):
    at = sim.nodes["MYAT"]
    c = sim._spawn_cell("squall", at["lat"], at["lon"], 0, 0, 62, 0.4, 400)
    c["age"] = 150
    assert sim._field(at["lat"], at["lon"])["gust"] >= 50
    for _ in range(40):
        sim.step()
        if not at["comms"]["vhf"]["up"] and not at["comms"]["cellular"]["up"]:
            break
    assert not at["comms"]["vhf"]["up"] and "VHF mast" in at["comms"]["vhf"]["cause"]
    assert not at["comms"]["cellular"]["up"]
    assert at["comms"]["satellite"]["up"]                                 # the survivable element
    assert _link(sim, "MYAT", "MYAM")["active"] == "satellite"


def test_damage_is_repaired_after_its_delay(sim):
    comms.damage(sim, "MYAT", "cellular", "test", 3)
    for _ in range(3):
        sim.step()
    assert sim.nodes["MYAT"]["comms"]["cellular"]["up"]
    assert any(e["kind"] == "COMMS_UP" and "after 15 min" in e["detail"] for e in sim.events)


def test_presenter_comms_faults(sim):
    assert sim.inject_fault("comms_down", station="MYAT", channel="vhf")["ok"]
    assert _link(sim, "MYAT", "MYAM")["active"] == "cellular"            # immediate, no tick needed
    assert "has no wired" in sim.inject_fault("comms_down", station="MYBC", channel="wired")["error"]
    assert sim.inject_fault("comms_up", station="MYAT", channel="vhf")["ok"]
    sim.inject_fault("comms_down", station="MYAT", channel="cellular")
    sim.inject_fault("clear", station="MYAT")
    assert all(eq["up"] for eq in sim.nodes["MYAT"]["comms"].values())


@pytest.mark.parametrize("seed", (1, 2, 3, 4, 5))
def test_radio_story(seed):
    m = MeshSimulation(seed=seed)
    m.story_beat("radio", "start")
    l = _link(m, "MYNN", "MYBC")
    assert l["active"] == "vhf" and m.route("MYBC", HUB)[1] < 50
    m.story_beat("radio", "storm")
    assert not m.nodes["MYBC"]["comms"]["vhf"]["up"] and "VHF mast" in m.nodes["MYBC"]["comms"]["vhf"]["cause"]
    assert l["active"] == "satellite" and m.route("MYBC", HUB)[1] > 500      # slower, still connected
    m.story_beat("radio", "repair")
    assert m.nodes["MYBC"]["comms"]["vhf"]["up"] and l["active"] == "satellite"
    assert l["better_since"] is not None
    m.story_beat("radio", "failback")
    assert l["active"] == "vhf" and m.route("MYBC", HUB)[1] < 50
    assert any(e["kind"] == "FAILBACK" and "MYBC" in e["detail"] for e in m.events)


async def test_comms_fault_api(client, auth_token):
    client.cookies.clear()
    h = {"Authorization": f"Bearer {auth_token}"}
    r = await client.post("/api/mesh/fault", json={"kind": "comms_down", "station": "MYAT", "channel": "vhf"}, headers=h)
    assert r.status_code == 200
    st = (await client.get("/api/mesh/status", headers=h)).json()
    node = next(n for n in st["nodes"] if n["station"] == "MYAT")
    assert {"type": "vhf", "up": False, "cause": "knocked out by the presenter"} in node["comms"]
    link = next(x for x in st["links"] if {x["a"], x["b"]} == {"MYAT", "MYAM"})
    assert link["active"] == "cellular" and link["on_backup"] and link["type"] == "cellular"
    r = await client.post("/api/mesh/fault", json={"kind": "comms_down", "station": "MYBC", "channel": "wired"}, headers=h)
    assert r.status_code == 400
    await client.post("/api/mesh/fault", json={"kind": "clear", "station": "MYAT"}, headers=h)
