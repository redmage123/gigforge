"""The shared demo must not wear itself out: quarantines heal, light showers raise no tickets."""

import collections
from datetime import datetime, timezone

import pytest

from services.mesh_network import MeshSimulation, PROBATION_TICKS


def _quiet(m, ticks):
    for _ in range(ticks):
        m.cells = []
        m.step()
        m.cells = []


@pytest.fixture
def sim():
    m = MeshSimulation(seed=11)
    _quiet(m, 2)
    return m


def test_quarantined_model_is_restored_after_probation(sim):
    n = sim.nodes["MYCB"]
    vista = n["precogs"]["VISTA"]
    vista["quarantined"] = True                 # e.g. after three wrong storm calls
    vista["dismissals"].extend([sim.tick] * 3)
    _quiet(sim, PROBATION_TICKS - 1)
    assert vista["quarantined"] and vista["probation"] == PROBATION_TICKS - 1
    _quiet(sim, 1)
    assert not vista["quarantined"] and not vista["dismissals"]
    assert sim.counters["restored"] == 1
    assert any(e["kind"] == "RESTORED" and e["station"] == "MYCB" for e in sim.events)


def test_corrupted_model_stays_quarantined_until_cleared(sim):
    sim.inject_fault("corrupt_precog", station="MYCB", precog="LEXIS")
    _quiet(sim, 80)
    lexis = sim.nodes["MYCB"]["precogs"]["LEXIS"]
    assert lexis["quarantined"] and lexis["probation"] == 0
    sim.inject_fault("clear", station="MYCB")
    assert not lexis["quarantined"] and not lexis["corrupted"]


def test_light_shower_disagreements_do_not_quarantine(sim):
    n = sim.nodes["MYCB"]
    vista = n["precogs"]["VISTA"]
    for i in range(4):                          # four "showers that never came"
        sim.minority_reports.appendleft({
            "id": f"MR-x{i}", "station": "MYCB", "precog": "VISTA", "minority_call": "SHOWERS",
            "majority_call": "CLEAR", "confidence": 0.7, "reason": "", "tick": sim.tick - 20,
            "time": "", "status": "OPEN", "corrupted": False})
    sim._score_minority_reports(n)
    assert all(r["status"] == "DISMISSED" for r in sim.minority_reports if r["id"].startswith("MR-x"))
    assert not vista["quarantined"] and not vista["dismissals"]


def test_rejected_showers_raise_no_maintenance_ticket(sim):
    n = sim.nodes["MYCB"]
    sim._start_consensus(n, "SHOWERS")          # no weather anywhere: neighbours disagree
    ev = sim.consensus_log[0]
    assert ev["result"] == "REJECTED" and "insufficient corroboration" in ev["detail"]
    assert n["suspect"] is None and not any(m["type"] == "MAINT" for m in sim.messages)
    sim._start_consensus(n, "IFR")              # a hazard claim nobody can see is still a suspected fault
    assert n["suspect"] and any(m["type"] == "MAINT" for m in sim.messages)


@pytest.mark.parametrize("seed", (1, 2))
def test_long_running_demo_stays_mostly_healthy(seed):
    """Regression: after ~1,250 ticks the live demo had 10 of 15 stations DEGRADED."""
    m = MeshSimulation(seed=seed)
    # The simulation clock starts at wall-clock time and the weather depends on it, so pin the
    # start: otherwise the same seed gives a different run each minute (and a rare start time
    # shows a brief, self-clearing cluster of unconfirmed hazard calls).
    m.sim_start = datetime(2026, 11, 25, 12, 0, tzinfo=timezone.utc)
    worst = 0
    for t in range(1, 1201):
        m.step()
        if t % 100 == 0:
            counts = collections.Counter(n["status"] for n in m.status()["nodes"])
            worst = max(worst, counts["degraded"])
    assert worst <= 2
