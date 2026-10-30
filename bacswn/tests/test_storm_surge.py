"""BACSWN — Storm surge service tests."""

import pytest
import math
from services.storm_surge import (
    get_storm_surge_zones,
    _generate_flood_polygon,
    SURGE_BY_CATEGORY,
    COASTAL_ZONES,
)


class TestGenerateFloodPolygon:
    def test_returns_25_points(self):
        """24 perimeter points + 1 closing point."""
        poly = _generate_flood_polygon(25.0, -77.0, 0.1)
        assert len(poly) == 25

    def test_polygon_is_closed(self):
        poly = _generate_flood_polygon(25.0, -77.0, 0.1)
        assert poly[0] == poly[-1]

    def test_points_are_coordinate_pairs(self):
        poly = _generate_flood_polygon(25.0, -77.0, 0.05)
        for pt in poly:
            assert len(pt) == 2
            lat, lon = pt
            assert isinstance(lat, float)
            assert isinstance(lon, float)

    def test_polygon_centered_near_origin(self):
        lat, lon, radius = 25.0, -77.0, 0.1
        poly = _generate_flood_polygon(lat, lon, radius)
        lats = [p[0] for p in poly]
        lons = [p[1] for p in poly]
        assert min(lats) < lat < max(lats)
        assert min(lons) < lon < max(lons)

    def test_larger_radius_gives_larger_polygon(self):
        small = _generate_flood_polygon(25.0, -77.0, 0.05)
        large = _generate_flood_polygon(25.0, -77.0, 0.5)
        small_lats = [p[0] for p in small]
        large_lats = [p[0] for p in large]
        assert (max(large_lats) - min(large_lats)) > (max(small_lats) - min(small_lats))


class TestGetStormSurgeZones:
    def test_returns_all_coastal_zones(self):
        result = get_storm_surge_zones(3)
        assert len(result["zones"]) == len(COASTAL_ZONES)

    def test_result_has_summary_fields(self):
        result = get_storm_surge_zones(2)
        assert "category" in result
        assert "surge_range_ft" in result
        assert "total_population_at_risk" in result
        assert "total_critical_infrastructure" in result
        assert "zones" in result

    def test_category_stored_in_result(self):
        for cat in range(1, 6):
            result = get_storm_surge_zones(cat)
            assert result["category"] == cat

    def test_surge_range_matches_table(self):
        for cat in range(1, 6):
            result = get_storm_surge_zones(cat)
            expected = f"{SURGE_BY_CATEGORY[cat]['min_ft']}-{SURGE_BY_CATEGORY[cat]['max_ft']}"
            assert result["surge_range_ft"] == expected

    def test_zone_has_required_fields(self):
        result = get_storm_surge_zones(3)
        required = {"name", "lat", "lon", "exposure", "population_at_risk",
                    "critical_infrastructure", "surge_min_ft", "surge_max_ft",
                    "inland_penetration_miles", "flood_polygon", "risk_level"}
        for z in result["zones"]:
            assert required.issubset(z.keys())

    def test_flood_polygon_is_closed(self):
        result = get_storm_surge_zones(3)
        for z in result["zones"]:
            poly = z["flood_polygon"]
            assert len(poly) > 0
            assert poly[0] == poly[-1]

    def test_category_4_risk_level_extreme(self):
        result = get_storm_surge_zones(4)
        for z in result["zones"]:
            assert z["risk_level"] == "extreme"

    def test_category_3_risk_level_high(self):
        result = get_storm_surge_zones(3)
        for z in result["zones"]:
            assert z["risk_level"] == "high"

    def test_category_2_risk_level_moderate(self):
        result = get_storm_surge_zones(2)
        for z in result["zones"]:
            assert z["risk_level"] == "moderate"

    def test_category_1_risk_level_elevated(self):
        result = get_storm_surge_zones(1)
        for z in result["zones"]:
            assert z["risk_level"] == "elevated"

    def test_total_population_sum(self):
        result = get_storm_surge_zones(1)
        expected = sum(cz["population"] for cz in COASTAL_ZONES)
        assert result["total_population_at_risk"] == expected

    def test_total_infra_sum(self):
        result = get_storm_surge_zones(1)
        expected = sum(len(cz["critical_infra"]) for cz in COASTAL_ZONES)
        assert result["total_critical_infrastructure"] == expected

    def test_category_clamp_below_1(self):
        """Category < 1 is clamped to 1."""
        result = get_storm_surge_zones(0)
        assert result["category"] == 1

    def test_category_clamp_above_5(self):
        """Category > 5 is clamped to 5."""
        result = get_storm_surge_zones(6)
        assert result["category"] == 5

    def test_extreme_exposure_larger_radius(self):
        """Extreme exposure zones should have wider flood polygons than low exposure."""
        result = get_storm_surge_zones(3)
        zones_by_exposure = {z["name"]: z for z in result["zones"]}
        extreme = [z for z in result["zones"] if z["exposure"] == "extreme"]
        moderate = [z for z in result["zones"] if z["exposure"] == "moderate"]
        if extreme and moderate:
            # Extreme zones have bigger polygons (more points spread wider)
            def poly_spread(z):
                lats = [p[0] for p in z["flood_polygon"]]
                return max(lats) - min(lats)
            avg_extreme = sum(poly_spread(z) for z in extreme) / len(extreme)
            avg_moderate = sum(poly_spread(z) for z in moderate) / len(moderate)
            assert avg_extreme > avg_moderate

    def test_higher_category_bigger_surge(self):
        assert SURGE_BY_CATEGORY[5]["max_ft"] > SURGE_BY_CATEGORY[1]["max_ft"]
        assert SURGE_BY_CATEGORY[5]["inland_miles"] > SURGE_BY_CATEGORY[1]["inland_miles"]

    def test_with_storm_coords(self):
        """Function accepts optional storm_lat/storm_lon without crashing."""
        result = get_storm_surge_zones(3, storm_lat=25.0, storm_lon=-77.0)
        assert "zones" in result
        assert len(result["zones"]) == len(COASTAL_ZONES)
