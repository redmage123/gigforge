"""Coastal carbon permanence replay (services/coastal_permanence.py)."""

from httpx import AsyncClient

from services import coastal_permanence as cp


def _fix(radii64=(30, 30, 20, 20), radii50=(50, 50, 40, 40), radii34=(90, 90, 60, 80)):
    return {"lat": 26.5, "lon": -77.0, "radii": {34: radii34, 50: radii50, 64: radii64}}


def test_best_track_rows_match_hurdat2():
    # Spot-check rows copied from NOAA HURDAT2 (AL052019): the Abaco landfall and a synoptic fix.
    landfall = next(r for r in cp.DORIAN if r[0] == "2019-09-01T16:40Z")
    assert landfall[1:6] == ("L", 26.5, -77.0, 160, 910)
    assert landfall[6:] == ((110, 110, 70, 90), (60, 50, 50, 50), (35, 30, 25, 25))
    row = next(r for r in cp.DORIAN if r[0] == "2019-09-03T00:00Z")
    assert row[2:6] == (26.9, -78.5, 115, 944)
    times = [r[0] for r in cp.DORIAN]
    assert times == sorted(times)


def test_category_thresholds():
    assert [cp.category(v) for v in (63, 64, 82, 83, 96, 113, 136, 137, 160)] == [0, 1, 1, 2, 3, 4, 4, 5, 5]


def test_wind_band_uses_the_quadrant_radius():
    f = _fix()
    # 25 nmi east (NE/SE boundary side: bearing 90 -> SE quadrant, 64-kt radius 30): hurricane force.
    lat, lon = cp._destination(26.5, -77.0, 100, 25)
    assert cp.wind_band(f, lat, lon) == 64
    # 25 nmi south-west: SW 64-kt radius is 20, 50-kt radius 40 -> storm force.
    lat, lon = cp._destination(26.5, -77.0, 225, 25)
    assert cp.wind_band(f, lat, lon) == 50
    # 85 nmi north-west: inside NW 34-kt radius (80)? No -> below gale.
    lat, lon = cp._destination(26.5, -77.0, 315, 85)
    assert cp.wind_band(f, lat, lon) == 0
    lat, lon = cp._destination(26.5, -77.0, 45, 85)
    assert cp.wind_band(f, lat, lon) == 34


def test_wind_field_outlines_are_closed_and_empty_when_no_radius():
    field = cp.wind_field(_fix(radii64=(0, 0, 0, 0)))
    assert field[64] == []
    assert field[34][0] == field[34][-1] and len(field[34]) == 29


def test_hourly_track_interpolates_between_fixes():
    track = cp.hourly_track()
    assert len(track) == 115  # 2019-08-30 18Z .. 2019-09-04 12Z inclusive
    at = {t["t"].strftime("%d %H"): t for t in track}
    # 01 Sep 16:40Z is the landfall fix; 17Z sits between it (160 kt) and 18Z (160 kt).
    assert at["01 17"]["vmax"] == 160
    # Halfway between 31 Aug 00Z (25.3N, 115 kt) and 06Z (25.6N, 120 kt).
    assert at["31 03"]["lat"] == 25.45 and at["31 03"]["vmax"] in (117, 118)


def test_area_is_reasonable():
    # A 0.1 x 0.1 degree box at 26.5N is about 11.1 km x 9.96 km.
    ha = cp.area_ha([[26.45, -77.05], [26.45, -76.95], [26.55, -76.95], [26.55, -77.05]])
    assert 10_500 < ha < 11_700


def test_replay_tells_the_permanence_story():
    r = cp.replay()
    by = {s["id"]: s for s in r["summary"]}
    # Projects near the stall saw many hours of hurricane-force winds; North Andros none.
    assert by["gb-north"]["hours_hurricane"] >= 24
    assert by["abaco-marls"]["peak_category"] == 5
    assert by["andros-north"]["hours_hurricane"] == 0
    assert by["andros-north"]["hours_storm"] > 0
    assert abs(sum(p["portfolio_share_pct"] for p in r["projects"]) - 100) < 0.5
    # Cumulative hours never go down and the portfolio peak is a real step.
    for pid in by:
        seq = [s["exposure"][pid]["hours_hurricane"] for s in r["steps"]]
        assert seq == sorted(seq) and seq[-1] == by[pid]["hours_hurricane"]
    assert r["portfolio"]["peak_pct_hurricane"] == max(s["portfolio_pct_hurricane"] for s in r["steps"])
    assert any("illustrative" in m.lower() for m in r["method"])
    assert "_pts" not in r["projects"][0]
    assert r["source"]["url"].startswith("https://www.nhc.noaa.gov/")


async def test_endpoint(client: AsyncClient, auth_token: str):
    resp = await client.get("/api/hurricane/coastal-replay", headers={"Authorization": f"Bearer {auth_token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["steps"]) == 115 and len(body["projects"]) == 4


async def test_endpoint_requires_login(client: AsyncClient):
    resp = await client.get("/api/hurricane/coastal-replay")
    assert resp.status_code == 401
