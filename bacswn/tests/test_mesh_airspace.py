"""Mesh weather → air traffic: hazard areas, conflict prediction, advice, API."""

import pytest
from httpx import AsyncClient

from services import mesh_airspace as ma
from services.mesh_network import MeshSimulation


@pytest.fixture
def sim():
    m = MeshSimulation(seed=11)
    m.cells.clear()
    for _ in range(2):
        m.step()
    m.cells.clear()
    return m


def _cell(sim, kind="convective", lat=25.0, lon=-77.0, heading=90, speed=0.0, peak=55, radius=0.3):
    c = sim._spawn_cell(kind, lat, lon, heading, speed, peak, radius, life=200)
    c["age"] = 100           # mature: near peak intensity
    return c


def _flight(lat, lon, track, kt=450, alt_ft=35000, **kw):
    return {"icao24": kw.get("icao24", "abc123"), "callsign": kw.get("callsign", "TST1"), "latitude": lat,
            "longitude": lon, "true_track": track, "velocity": kt / 1.944, "baro_altitude": alt_ft / 3.281,
            "on_ground": False, **kw}


def test_hazard_core_radius_and_low_level_fog(sim):
    _cell(sim)
    weak = _cell(sim, lat=22.0, lon=-74.0, peak=35)
    fog = _cell(sim, kind="fog", lat=24.0, lon=-76.0, peak=0.9, radius=0.3)
    hz = {h["id"]: h for h in ma.hazards(sim)}
    assert weak["id"] not in hz                                # below 40 dBZ: not an aviation hazard
    core = next(h for h in hz.values() if h["kind"] in ("TSRA", "SQUALL"))
    assert 4 <= core["radius_nm"] < 0.3 * 60                    # the ≥40 dBZ core, smaller than the cell
    assert hz[fog["id"]]["kind"] == "IFR" and hz[fog["id"]]["low_level"]


def test_conflict_ahead_with_turn_advice(sim):
    _cell(sim, lat=25.0, lon=-77.0, radius=0.25)
    f = _flight(25.0, -78.5, 90)                                # heading straight at it, ~80 nm away
    cf = ma.conflicts([f], ma.hazards(sim))
    assert len(cf) == 1 and 6 <= cf[0]["minutes_to_entry"] <= 14 and not cf[0]["inside"]
    adv = cf[0]["advice"]
    assert adv["turn"] in ("left", "right") and adv["degrees"] in (20, 40, 60)
    # The advised heading really clears every hazard.
    assert not ma._first_entry(25.0, -78.5, adv["heading"], 450, 35000, ma.hazards(sim))


def test_no_conflict_when_flying_away_or_above_fog(sim):
    _cell(sim, lat=25.0, lon=-77.0)
    _cell(sim, kind="fog", lat=23.0, lon=-75.0, peak=0.9)
    away = _flight(25.0, -78.5, 270)
    over_fog = _flight(23.0, -75.6, 90, alt_ft=35000, icao24="fog1")
    low_into_fog = _flight(23.0, -75.6, 90, kt=150, alt_ft=3000, icao24="fog2")
    ids = {c["icao24"] for c in ma.conflicts([away, over_fog, low_into_fog], ma.hazards(sim))}
    assert ids == {"fog2"}


def test_inside_hazard_gets_exit_heading(sim):
    _cell(sim, lat=25.0, lon=-77.0, radius=0.4)
    f = _flight(25.05, -77.0, 0)
    c = ma.conflicts([f], ma.hazards(sim))[0]
    assert c["inside"] and c["advice"]["turn"] == "exit" and c["advice"]["heading"] in range(0, 46)


def test_moving_storm_is_projected(sim):
    # Aircraft holding still-ish across the storm's future path: only a moving storm reaches it.
    _cell(sim, lat=25.0, lon=-77.0, heading=90, speed=40, radius=0.2)
    slow = _flight(25.0, -76.6, 0, kt=5, alt_ft=3000)        # ~22 nm east of the core, barely moving
    assert ma.conflicts([slow], ma.hazards(sim))
    sim.cells[-1]["speed_kt"] = 0
    assert not ma.conflicts([slow], ma.hazards(sim))


def test_confirmed_status_from_peer_verification(sim):
    n = sim.nodes["MYNN"]
    _cell(sim, lat=n["lat"], lon=n["lon"])
    sim.consensus_log.appendleft({"id": "CV-x", "station": "MYNN", "claim": "TSRA", "tick": sim.tick,
                                  "result": "CONFIRMED", "votes": {"MYER": "AGREE", "SAT": "AGREE", "MYEM": "DISAGREE"}})
    h = ma.hazards(sim)[0]
    assert h["status"] == "confirmed" and "satellite" in h["basis"] and "MYER" in h["basis"]
    sim.consensus_log[0]["tick"] = sim.tick - ma.CONFIRM_WINDOW_TICKS - 1     # stale confirmation
    assert ma.hazards(sim)[0]["status"] != "confirmed"


def test_ground_and_unknown_flights_skipped(sim):
    _cell(sim, lat=25.0, lon=-77.0)
    assert ma.conflicts([{**_flight(25.0, -77.0, 0), "on_ground": True},
                         {"icao24": "x", "latitude": 25.0, "longitude": -77.0}], ma.hazards(sim)) == []


async def test_airspace_api(client: AsyncClient, auth_token: str):
    r = await client.get("/api/mesh/airspace", headers={"Authorization": f"Bearer {auth_token}"})
    d = r.json()
    assert r.status_code == 200 and d["horizon_min"] == 30 and isinstance(d["hazards"], list)
    assert "flights_checked" in d and "note" in d
