"""BACSWN Sprint 1 — CORSIA emissions calculator tests (S1-005)."""

import pytest
from services.emissions_calculator import calculate_flight_emissions, estimate_airspace_emissions
from config import FUEL_BURN_RATES, CO2_PER_KG_FUEL


# ── Single-flight calculations ────────────────────────────────────────────────

class TestCalculateFlightEmissions:
    """S1-005: Per-flight CO2 calculation correctness."""

    def test_medium_aircraft_1h_fuel_burn(self):
        """Medium aircraft burns 1800 kg/hr per ICAO CORSIA rate card."""
        result = calculate_flight_emissions("medium", 1.0)
        assert result["fuel_burn_kg"] == pytest.approx(1800.0, abs=0.1)

    def test_heavy_aircraft_1h_fuel_burn(self):
        result = calculate_flight_emissions("heavy", 1.0)
        assert result["fuel_burn_kg"] == pytest.approx(3500.0, abs=0.1)

    def test_light_aircraft_1h_fuel_burn(self):
        result = calculate_flight_emissions("light", 1.0)
        assert result["fuel_burn_kg"] == pytest.approx(150.0, abs=0.1)

    def test_small_aircraft_1h_fuel_burn(self):
        result = calculate_flight_emissions("small", 1.0)
        assert result["fuel_burn_kg"] == pytest.approx(400.0, abs=0.1)

    def test_large_aircraft_1h_fuel_burn(self):
        result = calculate_flight_emissions("large", 1.0)
        assert result["fuel_burn_kg"] == pytest.approx(2500.0, abs=0.1)

    def test_co2_uses_icao_factor_3_16(self):
        """ICAO CORSIA emission factor: 3.16 kg CO2 per kg Jet-A fuel."""
        result = calculate_flight_emissions("medium", 1.0)
        expected_co2 = 1800.0 * CO2_PER_KG_FUEL
        assert result["co2_kg"] == pytest.approx(expected_co2, abs=0.1)
        assert CO2_PER_KG_FUEL == pytest.approx(3.16, abs=0.001)

    def test_units_are_kg_not_tonnes(self):
        """co2_kg must be in kilograms, not tonnes (common unit confusion)."""
        result = calculate_flight_emissions("medium", 1.0)
        # Medium aircraft over 1h: ~5688 kg CO2 — clearly not tonnes
        assert result["co2_kg"] > 100, "co2_kg appears to be in tonnes, not kg"
        assert result["co2_tonnes"] == pytest.approx(result["co2_kg"] / 1000, abs=0.001)

    def test_co2_tonnes_is_derived_from_co2_kg(self):
        result = calculate_flight_emissions("large", 2.0)
        assert result["co2_tonnes"] == pytest.approx(result["co2_kg"] / 1000, abs=0.001)

    def test_zero_flight_time_produces_zero_emissions(self):
        result = calculate_flight_emissions("heavy", 0.0)
        assert result["fuel_burn_kg"] == 0.0
        assert result["co2_kg"] == 0.0

    def test_distance_nm_passed_through(self):
        result = calculate_flight_emissions("medium", 1.0, distance_nm=150.0)
        assert result["distance_nm"] == 150.0

    def test_distance_nm_none_when_not_provided(self):
        result = calculate_flight_emissions("medium", 1.0)
        assert result["distance_nm"] is None

    def test_methodology_is_icao_corsia(self):
        result = calculate_flight_emissions("medium", 1.0)
        assert result["methodology"] == "ICAO CORSIA"

    def test_unknown_category_falls_back_to_medium(self):
        result = calculate_flight_emissions("jumbo", 1.0)
        medium_result = calculate_flight_emissions("medium", 1.0)
        assert result["fuel_burn_kg"] == medium_result["fuel_burn_kg"]

    @pytest.mark.parametrize("category", list(FUEL_BURN_RATES.keys()))
    def test_all_categories_produce_positive_emissions(self, category):
        result = calculate_flight_emissions(category, 1.0)
        assert result["fuel_burn_kg"] > 0
        assert result["co2_kg"] > 0

    def test_flight_time_is_rounded_to_2dp(self):
        result = calculate_flight_emissions("medium", 1.12345)
        assert result["flight_time_hours"] == pytest.approx(1.12, abs=0.005)


# ── Airspace aggregate emissions ─────────────────────────────────────────────

class TestEstimateAirspaceEmissions:
    """S1-005: Aggregate emissions for flights in airspace."""

    def test_empty_flight_list_returns_zero(self):
        result = estimate_airspace_emissions([])
        assert result["total_flights"] == 0
        assert result["total_fuel_burn_kg"] == 0.0
        assert result["total_co2_kg"] == 0.0

    def test_single_medium_flight_matches_single_calculation(self):
        # NOTE: transit_time_hours=0.5 is a known simplification (fixed constant)
        flight = {"icao24": "abc123", "callsign": "BAH001", "category": "medium"}
        result = estimate_airspace_emissions([flight], transit_time_hours=0.5)
        expected = calculate_flight_emissions("medium", 0.5)
        assert result["total_fuel_burn_kg"] == pytest.approx(expected["fuel_burn_kg"], abs=0.1)
        assert result["total_co2_kg"] == pytest.approx(expected["co2_kg"], abs=0.1)

    def test_integer_category_codes_map_to_strings(self):
        """ADS-B integer category codes must be mapped to string categories."""
        flights = [
            {"icao24": "a", "category": 7},   # heavy
            {"icao24": "b", "category": 4},   # large
            {"icao24": "c", "category": 3},   # medium
        ]
        result = estimate_airspace_emissions(flights, transit_time_hours=0.5)
        assert result["total_flights"] == 3
        assert result["total_co2_kg"] > 0

    def test_total_equals_sum_of_individual_flights(self):
        flights = [
            {"icao24": "x", "category": "heavy"},
            {"icao24": "y", "category": "light"},
        ]
        result = estimate_airspace_emissions(flights, transit_time_hours=1.0)
        expected_total = (
            calculate_flight_emissions("heavy", 1.0)["co2_kg"]
            + calculate_flight_emissions("light", 1.0)["co2_kg"]
        )
        assert result["total_co2_kg"] == pytest.approx(expected_total, abs=0.1)

    def test_total_co2_tonnes_derived_from_kg(self):
        flights = [{"icao24": "z", "category": "medium"}]
        result = estimate_airspace_emissions(flights)
        assert result["total_co2_tonnes"] == pytest.approx(
            result["total_co2_kg"] / 1000, abs=0.001
        )

    def test_per_flight_callsign_present(self):
        flights = [{"icao24": "abc", "callsign": "TEST123", "category": "medium"}]
        result = estimate_airspace_emissions(flights)
        assert result["flights"][0]["callsign"] == "TEST123"

    def test_missing_callsign_uses_na(self):
        flights = [{"icao24": "abc", "category": "medium"}]
        result = estimate_airspace_emissions(flights)
        assert result["flights"][0]["callsign"] == "N/A"
