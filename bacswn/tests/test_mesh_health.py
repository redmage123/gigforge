"""Channel-health monitoring: telemetry, heartbeats with hysteresis, and failure classification (§5.5)."""

import pytest

from services import mesh_comms as comms
from services import mesh_health as health
from services.mesh_network import MeshSimulation


@pytest.fixture
def sim():
    m = MeshSimulation(seed=5)
    m.background_weather = False
    m.cells = []
    return m


def tick(m, n=1):
    for _ in range(n):
        m.cells = []
        m.step()                            # runs mesh_health.update each tick


def diag(m, cls=None):
    return [d for d in health.view(m)["diagnoses"] if cls is None or d["class"] == cls]


def test_healthy_network_has_no_diagnoses(sim):
    tick(sim, 6)
    v = health.view(sim)
    assert v["diagnoses"] == [] and v["links"] == [] or all(l["state"] == "degraded" for l in v["links"])
    bc = next(s for s in v["stations"] if s["station"] == "MYBC")
    assert bc["vhf"]["powered"] and bc["vhf"]["vswr"] < health.VSWR_WARN and "cellular" not in bc
    assert bc["satellite"]["antenna_ma"] > 50


@pytest.mark.parametrize("kind,ch,expect", [
    ("vhf_antenna", "vhf", "VSWR 3.8:1"),
    ("radio_power", "vhf", "no supply voltage"),
    ("sat_antenna", "satellite", "no antenna current"),
])
def test_station_equipment_faults_raise_one_ticket(sim, kind, ch, expect):
    tick(sim, 2)
    assert health.inject(sim, kind, "MYEG")["ok"]
    tick(sim, 2)
    assert not [m for m in sim.messages if m["type"] == "MAINT" and "MYEG" in m["detail"]]   # not yet: may self-reset
    tick(sim, health.TICKET_AFTER)
    d = [x for x in diag(sim, "equipment") if x["stations"] == ["MYEG"]]
    assert len(d) == 1 and d[0]["ticket"]
    states = [l for l in health.view(sim)["links"] if "MYEG" in (l["a"], l["b"]) and l["channel"] == ch]
    assert states and all(l["state"] == "down" and expect in (l["alarm"] or "") for l in states)
    tickets = [m for m in sim.messages if m["type"] == "MAINT" and "MYEG" in m["detail"]]
    assert len(tickets) == 1
    tick(sim, 3)
    assert len([m for m in sim.messages if m["type"] == "MAINT" and "MYEG" in m["detail"]]) == 1   # not repeated
    health.clear(sim, "MYEG")
    tick(sim, health.RECOVER_GOOD + 4)      # a stray 1 % heartbeat miss can restart the run once
    assert not [x for x in diag(sim) if "MYEG" in x["stations"]]
    assert any(d["key"].startswith("hw:MYEG") for d in health.view(sim)["resolved"])


def test_carrier_outage_is_channel_wide_without_tickets(sim):
    tick(sim, 2)
    before = len([m for m in sim.messages if m["type"] == "MAINT"])
    health.inject(sim, "carrier_outage", None)
    tick(sim, 3)
    d = diag(sim, "channel-wide")
    assert len(d) == 1 and "carrier B" in d[0]["detail"]
    for gap in health.CARRIER_B_GAPS:
        assert gap in d[0]["detail"]
    assert len([m for m in sim.messages if m["type"] == "MAINT"]) == before
    assert not diag(sim, "local") and not diag(sim, "equipment")
    cell = next(s for s in health.view(sim)["stations"] if s["station"] == "MYNN")["cellular"]
    assert cell["registered"] and cell["carrier"] == "B"
    health.clear(sim)
    tick(sim, 2)
    assert not diag(sim, "channel-wide")


def test_single_tower_outage_is_local_not_ours(sim):
    tick(sim, 2)
    comms.damage(sim, "MYNN", "cellular", "Cellular tower off the air", None)
    tick(sim, 2)
    d = diag(sim, "local")
    assert [x["stations"] for x in d] == [["MYNN"]] and d[0]["ticket"] is None


def test_interference_degrades_vhf_and_is_classified(sim):
    tick(sim, 2)
    health.inject(sim, "vhf_interference", "MYEM")
    tick(sim, 6)
    d = diag(sim, "interference")
    assert len(d) == 1 and "MYEM" in d[0]["stations"] and "URCA" in d[0]["detail"]
    bad = [l for l in health.view(sim)["links"] if l["channel"] == "vhf" and "MYEM" in (l["a"], l["b"])]
    assert bad and all(l["alarm"] is None for l in bad)          # heartbeats, not hardware, show it
    assert not diag(sim, "equipment")


def test_hysteresis_needs_a_sustained_good_run(sim):
    tick(sim, 2)
    st = health._state(sim)
    key = next(k for k in st["state"] if k[2] == "vhf")
    link = sim.links[key[:2]]
    link["up"] = False                       # presenter cuts the path
    tick(sim, health.DOWN_MISSES)
    assert st["state"][key]["state"] == "down"
    link["up"] = True
    tick(sim, health.RECOVER_GOOD - 1)
    assert st["state"][key]["state"] == "down"
    tick(sim, 2)
    assert st["state"][key]["state"] == "up"


def test_path_problem(sim):
    tick(sim, 2)
    sim.links[("MYNN", "MYBC")]["up"] = False
    tick(sim, health.DOWN_MISSES + 1)
    paths = diag(sim, "path")
    assert any(set(d["stations"]) == {"MYBC", "MYNN"} for d in paths)


def test_inject_errors(sim):
    assert "Unknown station" in health.inject(sim, "vhf_antenna", "XXXX")["error"]
    # A fault that needs a station is refused without one (this line used to end in "or True").
    assert "Unknown station" in health.inject(sim, "vhf_interference", None)["error"]
    assert "Unknown comms fault" in health.inject(sim, "bogus", "MYNN")["error"]


def test_inject_through_mesh_api_and_status(sim):
    assert sim.inject_fault("vhf_antenna", station="MYAM")["ok"]
    assert "error" in sim.inject_fault("sat_antenna", station="NOPE")
    tick(sim, 2)
    st = sim.status()["comms_health"]
    assert any(d["stations"] == ["MYAM"] and d["class"] == "equipment" for d in st["diagnoses"])
    sim.inject_fault("clear", station="MYAM")
    tick(sim, health.RECOVER_GOOD + 2)
    assert not sim.status()["comms_health"]["diagnoses"]


def test_impaired_flags_clear_after_interference_and_reset(sim):
    tick(sim, 2)
    health.inject(sim, "vhf_interference", "MYEM")
    tick(sim, 8)
    assert any(l.get("impaired", {}).get("vhf") for l in sim.links.values())
    health.clear(sim)
    tick(sim, 30)
    assert not any(any(l.get("impaired", {}).values()) for l in sim.links.values())
    sim.reset()
    assert not any(any(l.get("impaired", {}).values()) for l in sim.links.values())


def test_repaired_equipment_is_not_held_out_by_monitoring(sim):
    tick(sim, 2)
    health.inject(sim, "vhf_antenna", "MYAM")
    tick(sim, 3)
    health.clear(sim, "MYAM")
    tick(sim, 1)
    assert not any(l.get("impaired", {}).get("vhf") for l in sim.links.values() if "MYAM" in (l["a"], l["b"]))
