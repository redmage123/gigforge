"""BACSWN — Hurricane client tests."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from services.hurricane_client import (
    fetch_hurricanes,
    _generate_simulated_storms,
    _SIM_STORMS,
)
from services.cache import cache


@pytest.fixture(autouse=True)
def clear_hurricane_cache():
    cache.delete("hurricanes:active")
    yield
    cache.delete("hurricanes:active")


class TestGenerateSimulatedStorms:
    def test_returns_list(self):
        storms = _generate_simulated_storms()
        assert isinstance(storms, list)
        assert len(storms) == len(_SIM_STORMS)

    def test_storm_has_required_fields(self):
        storms = _generate_simulated_storms()
        required = {"id", "name", "classification", "wind_mph", "pressure_mb",
                    "movement", "lat", "lon", "forecast_track", "cone_polygon"}
        for s in storms:
            assert required.issubset(s.keys())

    def test_forecast_track_matches_cone_length(self):
        storms = _generate_simulated_storms()
        for s in storms:
            assert len(s["forecast_track"]) == len(_SIM_STORMS[0]["forecast_cone"])

    def test_forecast_track_structure(self):
        storms = _generate_simulated_storms()
        for s in storms:
            for pt in s["forecast_track"]:
                assert "hour" in pt
                assert "lat" in pt
                assert "lon" in pt

    def test_cone_polygon_closes(self):
        """Cone polygon should be closed (first == last point)."""
        storms = _generate_simulated_storms()
        for s in storms:
            cone = s["cone_polygon"]
            assert len(cone) > 0
            assert cone[0] == cone[-1]

    def test_lat_lon_are_floats(self):
        storms = _generate_simulated_storms()
        for s in storms:
            assert isinstance(s["lat"], float)
            assert isinstance(s["lon"], float)

    def test_known_storm_data(self):
        storms = _generate_simulated_storms()
        # First storm is Danielle
        assert storms[0]["name"] == "Tropical Storm Danielle"
        assert storms[0]["id"] == "AL042026"
        assert storms[0]["wind_mph"] == 65


class TestFetchHurricanes:
    async def test_fallback_to_simulated_on_nhc_failure(self):
        with patch("services.hurricane_client._client") as mock_client:
            mock_client.get = AsyncMock(side_effect=Exception("network error"))
            storms = await fetch_hurricanes()
        assert len(storms) > 0
        assert storms[0]["name"] == "Tropical Storm Danielle"

    async def test_uses_cache_on_second_call(self):
        with patch("services.hurricane_client._client") as mock_client:
            mock_client.get = AsyncMock(side_effect=Exception("network error"))
            first = await fetch_hurricanes()
            # Second call should use cache — no second network hit
            second = await fetch_hurricanes()
        assert first == second

    async def test_returns_live_storms_when_nhc_available(self):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "activeStorms": [
                {
                    "id": "AL052026",
                    "name": "Hurricane Earl",
                    "classification": "Hurricane",
                    "intensity": 120,
                    "pressure": 945,
                    "movement": "N at 10 mph",
                    "latitude": 24.5,
                    "longitude": -75.0,
                }
            ]
        }
        with patch("services.hurricane_client._client") as mock_client:
            mock_client.get = AsyncMock(return_value=mock_resp)
            storms = await fetch_hurricanes()
        assert len(storms) == 1
        assert storms[0]["name"] == "Hurricane Earl"
        assert storms[0]["wind_mph"] == 120
        assert storms[0]["id"] == "AL052026"

    async def test_falls_back_to_simulated_when_no_active_storms(self):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"activeStorms": []}
        with patch("services.hurricane_client._client") as mock_client:
            mock_client.get = AsyncMock(return_value=mock_resp)
            storms = await fetch_hurricanes()
        # Empty activeStorms → simulated
        assert len(storms) > 0
        assert storms[0]["name"] == "Tropical Storm Danielle"

    async def test_live_storm_has_forecast_track_and_cone(self):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "activeStorms": [{"id": "X", "name": "Test", "classification": "TS",
                               "intensity": 50, "pressure": 1000, "movement": "N",
                               "latitude": 20.0, "longitude": -75.0}]
        }
        with patch("services.hurricane_client._client") as mock_client:
            mock_client.get = AsyncMock(return_value=mock_resp)
            storms = await fetch_hurricanes()
        assert "forecast_track" in storms[0]
        assert "cone_polygon" in storms[0]
