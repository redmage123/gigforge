"""BACSWN — API endpoint coverage tests for remaining modules."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient


class TestDashboard:
    async def test_summary(self, client: AsyncClient, auth_token: str):
        with patch("api.dashboard.fetch_metars", new_callable=AsyncMock) as m_metar, \
             patch("api.dashboard.fetch_flights", new_callable=AsyncMock) as m_flights:
            m_metar.return_value = []
            m_flights.return_value = []
            resp = await client.get(
                "/api/dashboard/summary",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, dict)

    async def test_summary_unauthenticated(self, client: AsyncClient):
        resp = await client.get("/api/dashboard/summary")
        assert resp.status_code == 401


class TestAlerts:
    async def test_active_alerts(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/alerts/active",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200

    async def test_nws_alerts(self, client: AsyncClient, auth_token: str):
        with patch("api.alerts_wx.fetch_alerts", new_callable=AsyncMock) as m:
            m.return_value = []
            resp = await client.get(
                "/api/alerts/nws",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200

    async def test_sigmets(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/alerts/sigmets",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200


class TestMapData:
    async def test_map_layers(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/map/layers",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, (dict, list))


class TestWeatherEndpoints:
    async def test_metars_empty_stations(self, client: AsyncClient, auth_token: str):
        with patch("api.weather.fetch_metars", new_callable=AsyncMock) as m:
            m.return_value = []
            resp = await client.get(
                "/api/weather/metars",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200

    async def test_metars_with_stations(self, client: AsyncClient, auth_token: str):
        with patch("api.weather.fetch_metars", new_callable=AsyncMock) as m, \
             patch("api.weather.parse_metar") as p:
            m.return_value = [{"rawOb": "MYNN 271400Z"}]
            p.return_value = {"station_id": "MYNN", "raw_text": "MYNN 271400Z"}
            resp = await client.get(
                "/api/weather/metars?stations=MYNN",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200

    async def test_tafs(self, client: AsyncClient, auth_token: str):
        with patch("api.weather.fetch_tafs", new_callable=AsyncMock) as m:
            m.return_value = []
            resp = await client.get(
                "/api/weather/tafs",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200

    async def test_forecast_station(self, client: AsyncClient, auth_token: str):
        with patch("api.weather.fetch_forecast", new_callable=AsyncMock) as m:
            m.return_value = {"hourly": []}
            resp = await client.get(
                "/api/weather/forecast/MYNN",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200

    async def test_all_forecasts(self, client: AsyncClient, auth_token: str):
        with patch("api.weather.fetch_all_station_forecasts", new_callable=AsyncMock) as m:
            m.return_value = {}
            resp = await client.get(
                "/api/weather/forecasts",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200

    async def test_stations(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/weather/stations",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, (list, dict))


class TestFlightEndpoints:
    async def test_live_flights(self, client: AsyncClient, auth_token: str):
        with patch("api.flights.fetch_flights", new_callable=AsyncMock) as m:
            m.return_value = [
                {"callsign": "BAH001", "lat": 25.0, "lon": -77.0,
                 "baro_altitude": 35000, "on_ground": False,
                 "origin_country": "Bahamas", "velocity": 450}
            ]
            resp = await client.get(
                "/api/flights/live",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200

    async def test_flight_stats(self, client: AsyncClient, auth_token: str):
        with patch("api.flights.fetch_flights", new_callable=AsyncMock) as m:
            m.return_value = [
                {"callsign": "X", "baro_altitude": 30000, "on_ground": False,
                 "velocity": 400, "origin_country": "US"}
            ]
            resp = await client.get(
                "/api/flights/stats",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200

    async def test_flight_history(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/flights/history",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200


class TestSensorEndpoints:
    async def test_sensor_grid(self, client: AsyncClient, auth_token: str):
        with patch("api.sensors.fetch_metars", new_callable=AsyncMock) as m:
            m.return_value = []
            resp = await client.get(
                "/api/sensors/grid",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200

    async def test_station_detail_known(self, client: AsyncClient, auth_token: str):
        with patch("api.sensors.fetch_metars", new_callable=AsyncMock) as m, \
             patch("api.sensors.parse_metar") as p:
            m.return_value = [{"rawOb": "MYNN 271400Z"}]
            p.return_value = {"station_id": "MYNN", "raw_text": "MYNN 271400Z",
                              "temp_c": 28, "wind_speed_kt": 12}
            resp = await client.get(
                "/api/sensors/MYNN",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200

    async def test_station_detail_unknown(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/sensors/XXXX",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code in (200, 404)


class TestMeshEndpoint:
    async def test_mesh_status(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/mesh/status",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200

    async def test_mesh_nodes(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/mesh/nodes",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200

    async def test_mesh_topology(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/mesh/topology",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200


class TestEmergencyEndpoints:
    async def test_shelters(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/emergency/shelters",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200

    async def test_airports(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/emergency/airports",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200

    async def test_routes(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/emergency/routes",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200


class TestSimulationEndpoints:
    async def test_list_scenarios(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/simulation/scenarios",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 6

    async def test_run_scenario(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/simulation/run/hurricane_landfall?step=0",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "nodes" in body

    async def test_run_invalid_scenario(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/simulation/run/nonexistent?step=0",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code in (200, 404)
