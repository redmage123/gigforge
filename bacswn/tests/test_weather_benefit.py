"""Weather-benefit ledger: dogleg geometry, crediting rules, recording, summary, API."""

from datetime import datetime, timedelta, timezone

import pytest

from services import weather_benefit as wb


def _hazard(**kw):
    base = {"id": "C1", "kind": "TSRA", "status": "confirmed", "lat": 25.0, "lon": -77.0,
            "radius_nm": 10.0, "heading": 0, "speed_kt": 0, "low_level": False}
    return {**base, **kw}


def _conflict(**kw):
    # Aircraft 60 nm south of the cell, heading north straight at it at 480 kt.
    base = {"icao24": "abc123", "callsign": "BHS201", "lat": 24.0, "lon": -77.0, "track": 0,
            "ground_speed_kt": 480, "minutes_to_entry": 7, "inside": False, "simulated": False,
            "hazard_id": "C1", "hazard": "TSRA", "hazard_status": "confirmed",
            "advice": {"turn": "right", "degrees": 20, "heading": 20, "text": "Turn right 20° to heading 020"}}
    return {**base, **kw}


def test_dogleg_geometry():
    assert wb.dogleg_extra_nm(0, 5) == 10
    assert wb.dogleg_extra_nm(25, 15) == pytest.approx(2 * (29.1548 - 25), abs=1e-3)
    assert wb.dogleg_extra_nm(80, 15) < wb.dogleg_extra_nm(25, 15)


def test_required_offset_uses_miss_distance():
    assert wb.required_offset_nm(_conflict(), _hazard()) == pytest.approx(15.0, abs=0.1)   # head-on: R + 5 nm buffer
    # Track passes 9 nm east of the centre → needs 6 nm more.
    off = wb.required_offset_nm(_conflict(lon=-77.0 + 9 / 60 / 0.9063), _hazard())
    assert off == pytest.approx(6.0, abs=0.2)
    assert wb.required_offset_nm(_conflict(lon=-76.5), _hazard()) == wb.MIN_OFFSET_NM


def test_assess_credits_early_reroute():
    e = wb.assess(_conflict(), _hazard(), {"category": 6})            # heavy
    assert e["credited"] and e["category"] == "heavy"
    lead = 480 * 7 / 60                                                # 56 nm of warning
    assert e["early_extra_nm"] == pytest.approx(wb.dogleg_extra_nm(lead, 15), abs=0.01)
    assert e["baseline_extra_nm"] == pytest.approx(wb.dogleg_extra_nm(25, 15), abs=0.01)
    saved = wb.dogleg_extra_nm(25, 15) - wb.dogleg_extra_nm(lead, 15)
    assert e["saved_fuel_kg"] == pytest.approx(saved / 480 * 3500, abs=0.1)
    assert e["saved_co2_kg"] == pytest.approx(e["saved_fuel_kg"] * 3.16, abs=0.2)


def test_assess_no_credit_cases():
    late = wb.assess(_conflict(minutes_to_entry=2), _hazard(), None)   # 16 nm: inside onboard-radar range anyway
    assert not late["credited"] and late["saved_nm"] == 0
    hold = wb.assess(_conflict(advice={"turn": None, "text": "hold or divert"}), _hazard(), None)
    assert not hold["credited"] and hold["reason"].startswith("hold")
    inside = wb.assess(_conflict(minutes_to_entry=0, inside=True,
                                 advice={"turn": "exit", "text": "exit"}), _hazard(), None)
    assert not inside["credited"] and inside["reason"] == "inside the hazard"


def test_lead_is_capped():
    far = wb.assess(_conflict(minutes_to_entry=30), _hazard(), None)
    assert far["early_extra_nm"] == pytest.approx(wb.dogleg_extra_nm(wb.MAX_LEAD_NM, 15), abs=0.01)


async def test_record_dedupes_and_summarises():
    now = datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc)
    result = {"hazards": [_hazard()], "conflicts": [_conflict(), _conflict(icao24="sim9", simulated=True),
                                                     _conflict(icao24="", callsign="?")]}
    flights = [{"icao24": "abc123", "category": 6}, {"icao24": "sim9", "category": "medium"}]
    assert await wb.record(result, flights, now) == 2
    # Same flight/hazard later, closer: still the first (earliest) warning only.
    assert await wb.record({**result, "conflicts": [_conflict(minutes_to_entry=3)]}, flights,
                           now + timedelta(minutes=1)) == 0
    s = await wb.summary(30, now + timedelta(minutes=2))
    assert (s["warnings"], s["reroutes"], s["monitored_hours"]) == (2, 2, 0.0)
    assert s["saved_co2_kg"] == pytest.approx(s["live_flight_co2_kg"] + s["simulated_flight_co2_kg"], abs=0.1)
    assert s["annualised_co2_t"] is None                               # under an hour of coverage
    assert s["by_status"]["confirmed"]["reroutes"] == 2 and s["daily"][0]["date"] == "2026-11-13"
    assert s["assumptions"]["baseline_decision_nm"] == wb.BASELINE_DECISION_NM
    # Outside the window → nothing.
    assert (await wb.summary(1, now + timedelta(days=3)))["warnings"] == 0
    text = await wb.export_csv(30, now + timedelta(minutes=2))
    assert text.startswith("recorded_at,callsign") and text.count("\n") == 3


async def test_annualised_after_an_hour():
    start = datetime(2026, 11, 13, 0, 0, tzinfo=timezone.utc)
    flights = [{"icao24": "abc123", "category": 6}]
    await wb.record({"hazards": [_hazard()], "conflicts": [_conflict()]}, flights, start)
    for m in range(1, 60):
        await wb.record({"hazards": [], "conflicts": []}, flights, start + timedelta(minutes=m))
    s = await wb.summary(30, start + timedelta(hours=2))
    assert s["monitored_hours"] == 1.0
    assert s["annualised_co2_t"] == pytest.approx(s["saved_co2_kg"] * 8760 / 1000, abs=0.1)


async def test_api(client, auth_token):
    client.cookies.clear()
    h = {"Authorization": f"Bearer {auth_token}"}
    r = await client.get("/api/emissions/weather-benefit?days=7", headers=h)
    assert r.status_code == 200 and r.json()["days"] == 7
    r = await client.get("/api/emissions/weather-benefit.csv", headers=h)
    assert r.headers["content-type"].startswith("text/csv")
    assert (await client.get("/api/emissions/weather-benefit")).status_code == 401
