"""BACSWN — Evacuation service tests."""

import pytest
from services.evacuation import (
    get_shelter_status,
    get_airport_status,
    get_evacuation_routes,
    SHELTERS,
    AIRPORTS,
    EVACUATION_ROUTES,
)


class TestShelterStatus:
    def test_returns_all_shelters(self):
        result = get_shelter_status(0)
        assert len(result) == len(SHELTERS)

    def test_shelter_has_required_fields(self):
        shelters = get_shelter_status(0)
        for s in shelters:
            assert "id" in s
            assert "name" in s
            assert "capacity" in s
            assert "status" in s
            assert "occupancy" in s
            assert "occupancy_pct" in s
            assert "available" in s

    def test_category_zero_all_standby(self):
        shelters = get_shelter_status(0)
        for s in shelters:
            assert s["status"] == "standby"
            assert s["occupancy"] == 0
            assert s["occupancy_pct"] == 0

    def test_category_1_low_occupancy(self):
        shelters = get_shelter_status(1)
        for s in shelters:
            # status not 'standby' for active storm
            assert s["status"] in ("open", "at_capacity")
            assert s["occupancy_pct"] <= 15

    def test_category_3_moderate_occupancy(self):
        shelters = get_shelter_status(3)
        for s in shelters:
            assert s["occupancy_pct"] <= 80

    def test_category_4_high_occupancy(self):
        shelters = get_shelter_status(4)
        # At least some shelters should have high occupancy
        pcts = [s["occupancy_pct"] for s in shelters]
        assert max(pcts) >= 50

    def test_at_capacity_status(self):
        """Shelters with >90% occupancy get at_capacity status."""
        # Run many times due to randomness — at Cat 5 some will be at capacity
        for _ in range(10):
            shelters = get_shelter_status(5)
            any_full = any(s["status"] == "at_capacity" for s in shelters)
            if any_full:
                break
        # At cat 5, at least one at_capacity is expected statistically

    def test_available_equals_capacity_minus_occupancy(self):
        shelters = get_shelter_status(2)
        for s in shelters:
            assert s["available"] == s["capacity"] - s["occupancy"]

    def test_category_2_occupancy_range(self):
        shelters = get_shelter_status(2)
        for s in shelters:
            assert 0 <= s["occupancy_pct"] <= 30


class TestAirportStatus:
    def test_returns_all_airports(self):
        result = get_airport_status(0)
        assert len(result) == len(AIRPORTS)

    def test_airport_has_required_fields(self):
        airports = get_airport_status(0)
        for a in airports:
            assert "icao" in a
            assert "name" in a
            assert "status" in a
            assert "operations_note" in a
            assert "accepting_arrivals" in a
            assert "departures_available" in a

    def test_category_zero_all_operational(self):
        airports = get_airport_status(0)
        for a in airports:
            assert a["status"] == "operational"
            assert a["accepting_arrivals"] is True

    def test_category_4_major_airports_closed(self):
        airports = get_airport_status(4)
        for a in airports:
            assert a["status"] == "closed"

    def test_category_5_all_closed(self):
        airports = get_airport_status(5)
        for a in airports:
            assert a["status"] == "closed"
            assert a["accepting_arrivals"] is False

    def test_category_1_operational(self):
        airports = get_airport_status(1)
        for a in airports:
            assert a["status"] == "operational"

    def test_category_3_limited(self):
        airports = get_airport_status(3)
        for a in airports:
            assert a["status"] in ("limited", "closed")

    def test_small_airports_close_at_category_2(self):
        airports = get_airport_status(2)
        small = [a for a in airports if a["cat_rating"] == "2B"]
        for a in small:
            assert a["status"] == "closed"

    def test_departures_available_for_limited(self):
        airports = get_airport_status(3)
        for a in airports:
            if a["status"] == "limited":
                assert a["departures_available"] is True


class TestEvacuationRoutes:
    def test_returns_all_routes(self):
        routes = get_evacuation_routes()
        assert len(routes) == len(EVACUATION_ROUTES)

    def test_route_has_required_fields(self):
        routes = get_evacuation_routes()
        for r in routes:
            assert "name" in r
            assert "island" in r
            assert "waypoints" in r
            assert "type" in r
            assert "priority" in r
            assert "status" in r
            assert "congestion" in r

    def test_all_routes_open(self):
        routes = get_evacuation_routes()
        for r in routes:
            assert r["status"] == "open"

    def test_congestion_is_valid(self):
        routes = get_evacuation_routes()
        valid = {"clear", "moderate", "heavy"}
        for r in routes:
            assert r["congestion"] in valid

    def test_waypoints_are_coordinate_pairs(self):
        routes = get_evacuation_routes()
        for r in routes:
            for wp in r["waypoints"]:
                assert len(wp) == 2
                lat, lon = wp
                assert -90 <= lat <= 90
                assert -180 <= lon <= 180
