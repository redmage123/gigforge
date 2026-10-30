"""BACSWN — Simulation engine tests."""

import pytest
from services.simulation_engine import (
    get_scenarios,
    run_scenario,
    _baseline_node,
    _all_nodes,
    SCENARIOS,
    _SCENARIO_FUNCS,
)
from config import BAHAMAS_STATIONS, STATION_COORDS


class TestGetScenarios:
    def test_returns_six_scenarios(self):
        scenarios = get_scenarios()
        assert len(scenarios) == 6

    def test_scenarios_have_required_fields(self):
        for s in get_scenarios():
            assert "id" in s
            assert "name" in s
            assert "description" in s
            assert "icon" in s
            assert "category" in s

    def test_scenario_ids_are_unique(self):
        ids = [s["id"] for s in get_scenarios()]
        assert len(ids) == len(set(ids))

    def test_expected_scenario_ids(self):
        ids = {s["id"] for s in get_scenarios()}
        expected = {"hurricane_landfall", "squall_line", "sensor_fault",
                    "hub_failure", "ifr_event", "tropical_wave"}
        assert ids == expected


class TestBaselineNode:
    def test_returns_node_dict(self):
        node = _baseline_node("MYNN")
        assert isinstance(node, dict)

    def test_node_has_required_fields(self):
        node = _baseline_node("MYNN")
        required = {"station", "name", "lat", "lon", "status", "hub_connected",
                    "autonomous_mode", "alert_level", "pressure_hpa", "wind_kt",
                    "visibility_sm", "ceiling_ft", "temperature_c", "detection"}
        assert required.issubset(node.keys())

    def test_default_status_healthy(self):
        node = _baseline_node("MYNN")
        assert node["status"] == "healthy"
        assert node["hub_connected"] is True
        assert node["autonomous_mode"] is False
        assert node["alert_level"] == "normal"

    def test_known_station_gets_coords(self):
        node = _baseline_node("MYNN")
        info = STATION_COORDS["MYNN"]
        assert node["lat"] == info["lat"]
        assert node["lon"] == info["lon"]
        assert node["name"] == info["name"]

    def test_unknown_station_gets_defaults(self):
        node = _baseline_node("XXXX")
        assert node["station"] == "XXXX"
        assert node["lat"] == 0
        assert node["lon"] == 0

    def test_default_weather_values(self):
        node = _baseline_node("MYGF")
        assert node["pressure_hpa"] == 1013.2
        assert node["wind_kt"] == 12
        assert node["visibility_sm"] == 10
        assert node["ceiling_ft"] == 25000
        assert node["temperature_c"] == 28.0
        assert node["detection"] is None


class TestAllNodes:
    def test_returns_all_stations(self):
        nodes = _all_nodes()
        assert len(nodes) == len(BAHAMAS_STATIONS)

    def test_override_applies_to_target_station(self):
        nodes = _all_nodes(MYNN={"status": "degraded", "wind_kt": 80})
        mynn = next(n for n in nodes if n["station"] == "MYNN")
        assert mynn["status"] == "degraded"
        assert mynn["wind_kt"] == 80

    def test_override_does_not_affect_other_stations(self):
        nodes = _all_nodes(MYNN={"status": "degraded"})
        others = [n for n in nodes if n["station"] != "MYNN"]
        for n in others:
            assert n["status"] == "healthy"

    def test_multiple_overrides(self):
        nodes = _all_nodes(
            MYNN={"alert_level": "emergency"},
            MYGF={"alert_level": "warning"},
        )
        mynn = next(n for n in nodes if n["station"] == "MYNN")
        mygf = next(n for n in nodes if n["station"] == "MYGF")
        assert mynn["alert_level"] == "emergency"
        assert mygf["alert_level"] == "warning"

    def test_no_overrides_all_healthy(self):
        nodes = _all_nodes()
        for n in nodes:
            assert n["status"] == "healthy"
            assert n["alert_level"] == "normal"


class TestRunScenario:
    def test_unknown_scenario_returns_error(self):
        result = run_scenario("nonexistent_scenario", 0)
        assert "error" in result

    def test_all_scenarios_run_without_error(self):
        for s in SCENARIOS:
            for step in range(10):
                result = run_scenario(s["id"], step)
                assert "error" not in result, f"{s['id']} step {step} returned error"

    def test_result_has_required_fields(self):
        result = run_scenario("hurricane_landfall", 0)
        required = {"step", "total_steps", "elapsed_minutes", "narration",
                    "nodes", "active_messages", "consensus_votes",
                    "alerts_issued", "propagation_forecasts"}
        assert required.issubset(result.keys())

    def test_step_number_matches(self):
        for step in range(10):
            result = run_scenario("hurricane_landfall", step)
            assert result["step"] == step

    def test_total_steps_is_10(self):
        result = run_scenario("hurricane_landfall", 0)
        assert result["total_steps"] == 10

    def test_elapsed_minutes(self):
        result0 = run_scenario("hurricane_landfall", 0)
        result3 = run_scenario("hurricane_landfall", 3)
        # elapsed_minutes increases with each step
        assert result3["elapsed_minutes"] > result0["elapsed_minutes"]
        # step 0 should be 0 or minimal elapsed
        assert isinstance(result0["elapsed_minutes"], (int, float))

    def test_nodes_count(self):
        result = run_scenario("hurricane_landfall", 0)
        assert len(result["nodes"]) == len(BAHAMAS_STATIONS)

    def test_narration_is_string(self):
        for s in SCENARIOS:
            result = run_scenario(s["id"], 0)
            assert isinstance(result["narration"], str)
            assert len(result["narration"]) > 0

    def test_hurricane_landfall_step_0_all_normal(self):
        result = run_scenario("hurricane_landfall", 0)
        for node in result["nodes"]:
            assert node["status"] == "healthy"
            assert node["alert_level"] == "normal"

    def test_hurricane_landfall_later_steps_degraded(self):
        """By step 5-9, some stations should be in degraded or emergency state."""
        result = run_scenario("hurricane_landfall", 7)
        statuses = {n["status"] for n in result["nodes"]}
        assert len(statuses) > 1  # not all healthy

    def test_hub_failure_scenario_nodes_autonomous(self):
        """Hub failure scenario should show autonomous mode for stations."""
        result = run_scenario("hub_failure", 5)
        autonomous = [n for n in result["nodes"] if n["autonomous_mode"]]
        assert len(autonomous) > 0

    def test_sensor_fault_scenario_runs(self):
        for step in range(10):
            result = run_scenario("sensor_fault", step)
            assert "nodes" in result

    def test_squall_line_scenario_runs(self):
        for step in range(10):
            result = run_scenario("squall_line", step)
            assert "nodes" in result

    def test_ifr_event_scenario_runs(self):
        for step in range(10):
            result = run_scenario("ifr_event", step)
            assert "nodes" in result

    def test_tropical_wave_scenario_runs(self):
        for step in range(10):
            result = run_scenario("tropical_wave", step)
            assert "nodes" in result

    def test_scenario_dispatcher_keys(self):
        """All scenario IDs must be in the dispatcher."""
        for s in SCENARIOS:
            assert s["id"] in _SCENARIO_FUNCS

    def test_alerts_issued_is_list(self):
        for s in SCENARIOS:
            result = run_scenario(s["id"], 0)
            assert isinstance(result["alerts_issued"], list)

    def test_active_messages_is_list(self):
        for s in SCENARIOS:
            result = run_scenario(s["id"], 0)
            assert isinstance(result["active_messages"], list)

    def test_consensus_votes_is_list(self):
        for s in SCENARIOS:
            result = run_scenario(s["id"], 0)
            assert isinstance(result["consensus_votes"], list)
