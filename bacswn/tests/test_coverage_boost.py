"""BACSWN — Additional tests to boost overall project coverage to >=80%.

Targets modules with low coverage:
  api/training.py       (25%)
  api/hurricane.py      (31%)
  api/flights.py        (34%)
  api/agents.py         (42%)
  api/ai_analysis.py    (42%)
  api/map_data.py       (43%)
  api/weather.py        (50%)
  api/emissions.py      (53%)
  api/alerts_wx.py      (59%)
  api/sensors.py        (38%)
  services/nws_client.py           (32%)
  services/openmeteo_client.py     (25%)
  services/channel_dispatcher.py   (30%)
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient


# ─────────────────────────────────────────────────────────────────────────────
# api/training.py
# ─────────────────────────────────────────────────────────────────────────────

class TestTrainingRoster:
    async def test_get_roster_returns_all_members(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/training/roster",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "roster" in body
        assert body["total"] == 8
        assert "on_duty" in body

    async def test_get_roster_on_duty_count(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/training/roster",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        body = resp.json()
        on_duty = sum(1 for r in body["roster"] if r["status"] == "on_duty")
        assert body["on_duty"] == on_duty

    async def test_get_roster_fields(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/training/roster",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        roster = resp.json()["roster"]
        for member in roster:
            assert "id" in member
            assert "name" in member
            assert "certifications" in member
            assert "status" in member


class TestTrainingModules:
    async def test_get_modules_returns_all(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/training/modules",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "modules" in body
        assert body["total"] == 8

    async def test_modules_have_required_fields(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/training/modules",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        modules = resp.json()["modules"]
        for m in modules:
            assert "id" in m
            assert "title" in m
            assert "duration_hrs" in m
            assert "completion_rate" in m


class TestTrainingCertifications:
    async def test_certifications_endpoint(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/training/certifications",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "unique_certifications" in body
        assert "total_staff" in body
        assert "expiring_within_90_days" in body
        assert "expiring_soon" in body
        assert "certification_types" in body

    async def test_certifications_types_sorted(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/training/certifications",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        cert_types = resp.json()["certification_types"]
        assert cert_types == sorted(cert_types)

    async def test_total_staff_matches_roster(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/training/certifications",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.json()["total_staff"] == 8


class TestTrainingContact:
    async def test_get_contact_info_valid_person(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/training/contact/1",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "person" in body
        assert "channels" in body
        assert len(body["channels"]) > 0

    async def test_get_contact_info_invalid_person(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/training/contact/999",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 404

    async def test_get_contact_channels_include_radio(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/training/contact/1",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        channels = resp.json()["channels"]
        channel_ids = [c["id"] for c in channels]
        assert "radio" in channel_ids

    async def test_post_contact_email_channel(self, client: AsyncClient, auth_token: str):
        resp = await client.post(
            "/api/training/contact",
            json={"person_id": 1, "channel": "email", "message": "Test message"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "person" in body
        assert body["channel"] == "email"

    async def test_post_contact_telegram_channel(self, client: AsyncClient, auth_token: str):
        resp = await client.post(
            "/api/training/contact",
            json={"person_id": 2, "channel": "telegram", "message": "Alert: squall line"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["channel"] == "telegram"

    async def test_post_contact_whatsapp_channel(self, client: AsyncClient, auth_token: str):
        resp = await client.post(
            "/api/training/contact",
            json={"person_id": 3, "channel": "whatsapp", "message": "Urgent update"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["channel"] == "whatsapp"

    async def test_post_contact_sms_channel(self, client: AsyncClient, auth_token: str):
        resp = await client.post(
            "/api/training/contact",
            json={"person_id": 4, "channel": "sms", "message": "Standby for briefing"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["channel"] == "sms"

    async def test_post_contact_radio_channel(self, client: AsyncClient, auth_token: str):
        resp = await client.post(
            "/api/training/contact",
            json={"person_id": 5, "channel": "radio", "message": "Come in on frequency"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["channel"] == "radio"

    async def test_post_contact_invalid_person(self, client: AsyncClient, auth_token: str):
        resp = await client.post(
            "/api/training/contact",
            json={"person_id": 999, "channel": "email", "message": "Test"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 404

    async def test_get_contact_channels_email_present(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/training/contact/1",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        channels = resp.json()["channels"]
        channel_ids = [c["id"] for c in channels]
        assert "email" in channel_ids

    async def test_get_contact_channels_telegram_present(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/training/contact/1",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        channels = resp.json()["channels"]
        channel_ids = [c["id"] for c in channels]
        assert "telegram" in channel_ids

    async def test_get_contact_person_2(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/training/contact/2",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["person"]["name"] == "James Williams"


# ─────────────────────────────────────────────────────────────────────────────
# api/hurricane.py
# ─────────────────────────────────────────────────────────────────────────────

class TestHurricaneEndpoints:
    async def test_active_storms_category_3(self, client: AsyncClient, auth_token: str):
        mock_storms = [
            {"id": "AL01", "name": "Test Storm", "wind_mph": 120,
             "classification": "Hurricane", "lat": 24.0, "lon": -76.0,
             "pressure_mb": 950, "movement": "NW", "forecast_track": [], "cone_polygon": []}
        ]
        with patch("api.hurricane.fetch_hurricanes", new_callable=AsyncMock) as m:
            m.return_value = mock_storms
            resp = await client.get(
                "/api/hurricane/active",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert "storms" in body
        assert body["count"] == 1
        assert body["storms"][0]["category"] == 3

    async def test_active_storms_category_1(self, client: AsyncClient, auth_token: str):
        mock_storms = [
            {"id": "AL02", "name": "Small Storm", "wind_mph": 80,
             "classification": "Hurricane", "lat": 24.0, "lon": -76.0,
             "pressure_mb": 990, "movement": "N", "forecast_track": [], "cone_polygon": []}
        ]
        with patch("api.hurricane.fetch_hurricanes", new_callable=AsyncMock) as m:
            m.return_value = mock_storms
            resp = await client.get(
                "/api/hurricane/active",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.json()["storms"][0]["category"] == 1

    async def test_active_storms_category_2(self, client: AsyncClient, auth_token: str):
        mock_storms = [
            {"id": "AL03", "name": "Storm Cat2", "wind_mph": 100,
             "classification": "Hurricane", "lat": 24.0, "lon": -76.0,
             "pressure_mb": 970, "movement": "NW", "forecast_track": [], "cone_polygon": []}
        ]
        with patch("api.hurricane.fetch_hurricanes", new_callable=AsyncMock) as m:
            m.return_value = mock_storms
            resp = await client.get(
                "/api/hurricane/active",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.json()["storms"][0]["category"] == 2

    async def test_active_storms_category_4(self, client: AsyncClient, auth_token: str):
        mock_storms = [
            {"id": "AL04", "name": "Big Storm", "wind_mph": 140,
             "classification": "Hurricane", "lat": 24.0, "lon": -76.0,
             "pressure_mb": 930, "movement": "N", "forecast_track": [], "cone_polygon": []}
        ]
        with patch("api.hurricane.fetch_hurricanes", new_callable=AsyncMock) as m:
            m.return_value = mock_storms
            resp = await client.get(
                "/api/hurricane/active",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.json()["storms"][0]["category"] == 4

    async def test_active_storms_category_5(self, client: AsyncClient, auth_token: str):
        mock_storms = [
            {"id": "AL05", "name": "Monster", "wind_mph": 170,
             "classification": "Hurricane", "lat": 24.0, "lon": -76.0,
             "pressure_mb": 900, "movement": "N", "forecast_track": [], "cone_polygon": []}
        ]
        with patch("api.hurricane.fetch_hurricanes", new_callable=AsyncMock) as m:
            m.return_value = mock_storms
            resp = await client.get(
                "/api/hurricane/active",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.json()["storms"][0]["category"] == 5

    async def test_active_storms_category_0(self, client: AsyncClient, auth_token: str):
        mock_storms = [
            {"id": "AL06", "name": "Depression", "wind_mph": 35,
             "classification": "TD", "lat": 24.0, "lon": -76.0,
             "pressure_mb": 1005, "movement": "NW", "forecast_track": [], "cone_polygon": []}
        ]
        with patch("api.hurricane.fetch_hurricanes", new_callable=AsyncMock) as m:
            m.return_value = mock_storms
            resp = await client.get(
                "/api/hurricane/active",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.json()["storms"][0]["category"] == 0

    async def test_surge_zones_endpoint(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/hurricane/surge/3",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200

    async def test_shelters_endpoint(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/hurricane/shelters",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "shelters" in body
        assert "total_capacity" in body
        assert "total_occupancy" in body
        assert "total_available" in body
        assert "shelters_open" in body

    async def test_shelters_with_category(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/hurricane/shelters?category=4",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200

    async def test_airports_endpoint(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/hurricane/airports",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "airports" in body
        assert "operational" in body
        assert "limited" in body
        assert "closed" in body

    async def test_evacuation_routes_endpoint(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/hurricane/evacuation",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "routes" in body
        assert "total" in body

    async def test_historical_endpoint_default(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/hurricane/historical",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "storms" in body
        assert "count" in body

    async def test_historical_with_category_filter(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/hurricane/historical?min_category=3",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200

    async def test_compare_endpoint_with_active_storms(self, client: AsyncClient, auth_token: str):
        mock_storms = [
            {"id": "AL01", "name": "Danielle", "wind_mph": 90,
             "lat": 24.0, "lon": -76.0, "classification": "Hurricane",
             "pressure_mb": 970, "movement": "NW", "forecast_track": [], "cone_polygon": []}
        ]
        with patch("api.hurricane.fetch_hurricanes", new_callable=AsyncMock) as m:
            m.return_value = mock_storms
            resp = await client.get(
                "/api/hurricane/compare",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert "comparisons" in body
        assert len(body["comparisons"]) == 1
        assert body["comparisons"][0]["active_storm"] == "Danielle"

    async def test_compare_endpoint_no_storms(self, client: AsyncClient, auth_token: str):
        with patch("api.hurricane.fetch_hurricanes", new_callable=AsyncMock) as m:
            m.return_value = []
            resp = await client.get(
                "/api/hurricane/compare",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        assert resp.json()["comparisons"] == []

    async def test_escalate_new_category(self, client: AsyncClient, auth_token: str):
        with patch("api.hurricane.dispatch_to_all", new_callable=AsyncMock) as m_dispatch, \
             patch("api.hurricane.cache") as m_cache:
            m_dispatch.return_value = [{"status": "sent"} for _ in range(41)]
            m_cache.get.return_value = None
            resp = await client.post(
                "/api/hurricane/escalate?category=3&storm_name=TestStorm",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "dispatched"
        assert body["category"] == 3

    async def test_escalate_already_dispatched(self, client: AsyncClient, auth_token: str):
        with patch("api.hurricane.cache") as m_cache:
            m_cache.get.return_value = True
            resp = await client.post(
                "/api/hurricane/escalate?category=2",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "already_dispatched"

    async def test_dashboard_endpoint_with_storms(self, client: AsyncClient, auth_token: str):
        mock_storms = [
            {"id": "AL01", "name": "Test", "wind_mph": 100,
             "lat": 24.0, "lon": -76.0, "classification": "Hurricane",
             "pressure_mb": 960, "movement": "N", "forecast_track": [], "cone_polygon": []}
        ]
        with patch("api.hurricane.fetch_hurricanes", new_callable=AsyncMock) as m:
            m.return_value = mock_storms
            resp = await client.get(
                "/api/hurricane/dashboard",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert "active_storms" in body
        assert "max_category" in body
        assert "surge_zones" in body
        assert "shelters" in body
        assert "airports" in body
        assert "evacuation_routes" in body
        assert "historical_storms" in body

    async def test_dashboard_endpoint_no_storms(self, client: AsyncClient, auth_token: str):
        with patch("api.hurricane.fetch_hurricanes", new_callable=AsyncMock) as m:
            m.return_value = []
            resp = await client.get(
                "/api/hurricane/dashboard",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["max_category"] == 0


# ─────────────────────────────────────────────────────────────────────────────
# api/flights.py  (boost alt bands coverage)
# ─────────────────────────────────────────────────────────────────────────────

class TestFlightsAltitudeBands:
    async def test_all_altitude_bands_covered(self, client: AsyncClient, auth_token: str):
        mock_flights = [
            {"callsign": "A", "origin_country": "BS", "baro_altitude": 35000, "on_ground": False},
            {"callsign": "B", "origin_country": "US", "baro_altitude": None, "on_ground": True},
            {"callsign": "C", "origin_country": "BS", "baro_altitude": 2000, "on_ground": False},
            {"callsign": "D", "origin_country": "BS", "baro_altitude": 7000, "on_ground": False},
            {"callsign": "E", "origin_country": "BS", "baro_altitude": 10000, "on_ground": False},
        ]
        with patch("api.flights.fetch_flights", new_callable=AsyncMock) as m:
            m.return_value = mock_flights
            resp = await client.get(
                "/api/flights/stats",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        body = resp.json()
        assert body["altitude_bands"]["ground"] == 1
        assert body["altitude_bands"]["low"] == 1
        assert body["altitude_bands"]["medium"] == 1
        assert body["altitude_bands"]["high"] == 1
        assert body["altitude_bands"]["cruise"] == 1

    async def test_stats_no_flights(self, client: AsyncClient, auth_token: str):
        with patch("api.flights.fetch_flights", new_callable=AsyncMock) as m:
            m.return_value = []
            resp = await client.get(
                "/api/flights/stats",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        body = resp.json()
        assert body["total_flights"] == 0

    async def test_stats_by_country_sorted(self, client: AsyncClient, auth_token: str):
        mock_flights = [
            {"callsign": "A", "origin_country": "Bahamas", "baro_altitude": 35000, "on_ground": False},
            {"callsign": "B", "origin_country": "Bahamas", "baro_altitude": 30000, "on_ground": False},
            {"callsign": "C", "origin_country": "United States", "baro_altitude": 25000, "on_ground": False},
        ]
        with patch("api.flights.fetch_flights", new_callable=AsyncMock) as m:
            m.return_value = mock_flights
            resp = await client.get(
                "/api/flights/stats",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        body = resp.json()
        # Bahamas should appear first (most flights)
        countries = list(body["by_country"].keys())
        assert countries[0] == "Bahamas"


# ─────────────────────────────────────────────────────────────────────────────
# api/agents.py
# ─────────────────────────────────────────────────────────────────────────────

class TestAgentsEndpoints:
    async def test_agent_status_endpoint(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/agents/status",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "agents" in body

    async def test_trigger_agent_endpoint(self, client: AsyncClient, auth_token: str):
        with patch("api.agents.orchestrator") as m_orch:
            m_orch.trigger_agent = AsyncMock(return_value={"action": "check", "details": "done"})
            resp = await client.post(
                "/api/agents/trigger",
                json={"agent_name": "bacswn-wx-monitor"},
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert "action" in body

    async def test_trigger_agent_with_context(self, client: AsyncClient, auth_token: str):
        with patch("api.agents.orchestrator") as m_orch:
            m_orch.trigger_agent = AsyncMock(return_value={"action": "dispatch", "details": "sent"})
            resp = await client.post(
                "/api/agents/trigger",
                json={"agent_name": "bacswn-dispatch", "context": {"severity": "extreme"}},
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200

    async def test_agent_activity_endpoint(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/agents/activity",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "activities" in body
        assert "count" in body

    async def test_agent_activity_with_filter(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/agents/activity?agent_name=bacswn-wx-monitor",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200

    async def test_weather_pipeline_endpoint(self, client: AsyncClient, auth_token: str):
        with patch("api.agents.orchestrator") as m_orch:
            m_orch.trigger_agent = AsyncMock(
                return_value={"action": "check", "details": "ok", "sigmet": {}}
            )
            resp = await client.post(
                "/api/agents/pipeline/weather-event",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["pipeline"] == "weather_event"
        assert "steps" in body
        assert "results" in body


# ─────────────────────────────────────────────────────────────────────────────
# api/ai_analysis.py
# ─────────────────────────────────────────────────────────────────────────────

class TestAIAnalysisEndpoints:
    async def test_analyze_weather_vfr_conditions(self, client: AsyncClient, auth_token: str):
        mock_metars = [
            {"icaoId": "MYNN", "fltcat": "VFR"},
            {"icaoId": "MYGF", "fltcat": "VFR"},
        ]
        with patch("api.ai_analysis.fetch_metars", new_callable=AsyncMock) as m_metar, \
             patch("api.ai_analysis.parse_metar") as m_parse:
            m_metar.return_value = mock_metars
            m_parse.side_effect = lambda x: {"station_id": x["icaoId"], "flight_category": x["fltcat"]}
            resp = await client.post(
                "/api/ai/analyze",
                json={"query": "All clear?", "context_type": "weather"},
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["context_type"] == "weather"
        assert "All clear" in body["analysis"]["recommendation"]

    async def test_analyze_weather_ifr_conditions(self, client: AsyncClient, auth_token: str):
        mock_metars = [
            {"icaoId": "MYNN", "fltcat": "IFR"},
            {"icaoId": "MYGF", "fltcat": "LIFR"},
        ]
        with patch("api.ai_analysis.fetch_metars", new_callable=AsyncMock) as m_metar, \
             patch("api.ai_analysis.parse_metar") as m_parse:
            m_metar.return_value = mock_metars
            m_parse.side_effect = lambda x: {"station_id": x["icaoId"], "flight_category": x["fltcat"]}
            resp = await client.post(
                "/api/ai/analyze",
                json={"query": "IFR check", "context_type": "weather"},
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        body = resp.json()
        assert body["analysis"]["ifr_count"] == 2
        assert "Monitor" in body["analysis"]["recommendation"]

    async def test_analyze_weather_mvfr_conditions(self, client: AsyncClient, auth_token: str):
        mock_metars = [
            {"icaoId": "MYEG", "fltcat": "MVFR"},
        ]
        with patch("api.ai_analysis.fetch_metars", new_callable=AsyncMock) as m_metar, \
             patch("api.ai_analysis.parse_metar") as m_parse:
            m_metar.return_value = mock_metars
            m_parse.side_effect = lambda x: {"station_id": x["icaoId"], "flight_category": x["fltcat"]}
            resp = await client.post(
                "/api/ai/analyze",
                json={"query": "MVFR check", "context_type": "weather"},
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        body = resp.json()
        assert body["analysis"]["mvfr_count"] == 1

    async def test_analyze_flights_elevated_traffic(self, client: AsyncClient, auth_token: str):
        mock_flights = [{"callsign": f"FL{i:03d}", "on_ground": False} for i in range(60)]
        with patch("api.ai_analysis.fetch_flights", new_callable=AsyncMock) as m:
            m.return_value = mock_flights
            resp = await client.post(
                "/api/ai/analyze",
                json={"query": "Traffic status", "context_type": "flights"},
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        body = resp.json()
        assert "Elevated traffic" in body["analysis"]["recommendation"]

    async def test_analyze_flights_normal_traffic(self, client: AsyncClient, auth_token: str):
        mock_flights = [{"callsign": f"FL{i:03d}", "on_ground": False} for i in range(5)]
        with patch("api.ai_analysis.fetch_flights", new_callable=AsyncMock) as m:
            m.return_value = mock_flights
            resp = await client.post(
                "/api/ai/analyze",
                json={"query": "Traffic?", "context_type": "flights"},
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        body = resp.json()
        assert "Normal traffic" in body["analysis"]["recommendation"]

    async def test_analyze_emissions_context(self, client: AsyncClient, auth_token: str):
        mock_flights = [{"callsign": "AA01", "on_ground": False, "category": "heavy"}]
        mock_emissions = {"total_co2_tonnes": 1.5, "total_flights": 1, "total_fuel_tonnes": 0.5}
        with patch("api.ai_analysis.fetch_flights", new_callable=AsyncMock) as m_flights, \
             patch("api.ai_analysis.estimate_airspace_emissions") as m_em:
            m_flights.return_value = mock_flights
            m_em.return_value = mock_emissions
            resp = await client.post(
                "/api/ai/analyze",
                json={"query": "Emissions?", "context_type": "emissions"},
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert "CORSIA" in body["analysis"]["recommendation"]

    async def test_analyze_unknown_context(self, client: AsyncClient, auth_token: str):
        resp = await client.post(
            "/api/ai/analyze",
            json={"query": "test", "context_type": "unknown_type"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "Unknown context type" in body["analysis"]["summary"]


# ─────────────────────────────────────────────────────────────────────────────
# api/alerts_wx.py  — boost coverage of nws/sigmets routes
# ─────────────────────────────────────────────────────────────────────────────

class TestAlertsWxBoost:
    async def test_active_alerts_with_data(self, client: AsyncClient, auth_token: str):
        with patch("api.alerts_wx.fetch_alerts", new_callable=AsyncMock) as m_alerts, \
             patch("api.alerts_wx.fetch_sigmets", new_callable=AsyncMock) as m_sigmets:
            m_alerts.return_value = [{"event": "Tropical Storm Warning"}]
            m_sigmets.return_value = [{"hazard": "TS"}]
            resp = await client.get(
                "/api/alerts/active",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total_nws"] == 1
        assert body["total_sigmets"] == 1

    async def test_nws_only_endpoint(self, client: AsyncClient, auth_token: str):
        with patch("api.alerts_wx.fetch_alerts", new_callable=AsyncMock) as m:
            m.return_value = [{"event": "Hurricane Watch", "severity": "Extreme"}]
            resp = await client.get(
                "/api/alerts/nws",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert "alerts" in body
        assert body["count"] == 1

    async def test_sigmets_only_endpoint(self, client: AsyncClient, auth_token: str):
        with patch("api.alerts_wx.fetch_sigmets", new_callable=AsyncMock) as m:
            m.return_value = [{"hazard": "TS", "area": "Bahamas"}]
            resp = await client.get(
                "/api/alerts/sigmets",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert "sigmets" in body
        assert body["count"] == 1

    async def test_active_alerts_empty(self, client: AsyncClient, auth_token: str):
        with patch("api.alerts_wx.fetch_alerts", new_callable=AsyncMock) as m_alerts, \
             patch("api.alerts_wx.fetch_sigmets", new_callable=AsyncMock) as m_sigmets:
            m_alerts.return_value = []
            m_sigmets.return_value = []
            resp = await client.get(
                "/api/alerts/active",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        body = resp.json()
        assert body["total_nws"] == 0
        assert body["total_sigmets"] == 0


# ─────────────────────────────────────────────────────────────────────────────
# api/weather.py  — boost forecast endpoint coverage
# ─────────────────────────────────────────────────────────────────────────────

class TestWeatherBoost:
    async def test_forecast_known_station_mynn(self, client: AsyncClient, auth_token: str):
        mock_forecast = {"station_id": "MYNN", "hourly": {}, "current": {}}
        with patch("api.weather.fetch_forecast", new_callable=AsyncMock) as m:
            m.return_value = mock_forecast
            resp = await client.get(
                "/api/weather/forecast/MYNN",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        assert resp.json()["station_id"] == "MYNN"

    async def test_forecast_unknown_station_returns_error(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/weather/forecast/XXXX",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        assert "error" in resp.json()

    async def test_all_forecasts_endpoint(self, client: AsyncClient, auth_token: str):
        with patch("api.weather.fetch_all_station_forecasts", new_callable=AsyncMock) as m:
            m.return_value = [{"station_id": "MYNN"}, {"station_id": "MYGF"}]
            resp = await client.get(
                "/api/weather/forecasts",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert "forecasts" in body
        assert body["count"] == 2

    async def test_tafs_with_no_stations(self, client: AsyncClient, auth_token: str):
        with patch("api.weather.fetch_tafs", new_callable=AsyncMock) as m:
            m.return_value = []
            resp = await client.get(
                "/api/weather/tafs",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["count"] == 0

    async def test_metars_no_stations_param(self, client: AsyncClient, auth_token: str):
        with patch("api.weather.fetch_metars", new_callable=AsyncMock) as m:
            m.return_value = []
            resp = await client.get(
                "/api/weather/metars",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        # No stations param → should pass None to fetch_metars
        m.assert_called_once_with(None)


# ─────────────────────────────────────────────────────────────────────────────
# api/emissions.py  — summary endpoint with cat_match coverage
# ─────────────────────────────────────────────────────────────────────────────

class TestEmissionsBoost:
    async def test_calculate_light_aircraft(self, client: AsyncClient, auth_token: str):
        resp = await client.post(
            "/api/emissions/calculate",
            json={"aircraft_category": "light", "flight_time_hours": 0.5},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200

    async def test_calculate_heavy_aircraft_with_distance(self, client: AsyncClient, auth_token: str):
        resp = await client.post(
            "/api/emissions/calculate",
            json={"aircraft_category": "heavy", "flight_time_hours": 3.0, "distance_nm": 1500},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200

    async def test_emissions_summary_numeric_categories(self, client: AsyncClient, auth_token: str):
        """Test that ICAO numeric categories (5,6,7=heavy, 4=large, 3=medium, 1,2=small) work."""
        mock_flights = [
            {"callsign": "A", "category": 5, "on_ground": False},
            {"callsign": "B", "category": 6, "on_ground": False},
            {"callsign": "C", "category": 7, "on_ground": False},
            {"callsign": "D", "category": 4, "on_ground": False},
            {"callsign": "E", "category": 3, "on_ground": False},
            {"callsign": "F", "category": 1, "on_ground": False},
            {"callsign": "G", "category": 2, "on_ground": False},
        ]
        mock_emissions = {"total_co2_tonnes": 10.0, "total_flights": 7, "total_fuel_tonnes": 3.0}
        with patch("api.emissions.fetch_flights", new_callable=AsyncMock) as m_flights, \
             patch("api.emissions.estimate_airspace_emissions") as m_em:
            m_flights.return_value = mock_flights
            m_em.return_value = mock_emissions
            resp = await client.get(
                "/api/emissions/summary",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        cats = body["categories"]
        assert cats["heavy"] == 3   # category 5, 6, 7
        assert cats["large"] == 1   # category 4
        assert cats["medium"] == 1  # category 3
        assert cats["small"] == 2   # category 1, 2

    async def test_emissions_summary_string_categories(self, client: AsyncClient, auth_token: str):
        mock_flights = [
            {"callsign": "A", "category": "heavy", "on_ground": False},
            {"callsign": "B", "category": "large", "on_ground": False},
            {"callsign": "C", "category": "medium", "on_ground": False},
            {"callsign": "D", "category": "light", "on_ground": False},
        ]
        mock_emissions = {"total_co2_tonnes": 5.0, "total_flights": 4, "total_fuel_tonnes": 1.5}
        with patch("api.emissions.fetch_flights", new_callable=AsyncMock) as m_flights, \
             patch("api.emissions.estimate_airspace_emissions") as m_em:
            m_flights.return_value = mock_flights
            m_em.return_value = mock_emissions
            resp = await client.get(
                "/api/emissions/summary",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        cats = body["categories"]
        assert cats["heavy"] == 1
        assert cats["large"] == 1
        assert cats["medium"] == 1
        assert cats["small"] == 1

    async def test_emissions_history_with_limit(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/emissions/history?limit=10",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200


# ─────────────────────────────────────────────────────────────────────────────
# api/sensors.py — station detail coverage
# ─────────────────────────────────────────────────────────────────────────────

class TestSensorsBoost:
    async def test_station_detail_with_metar_data(self, client: AsyncClient, auth_token: str):
        mock_raw = [
            {"icaoId": "MYNN", "rawOb": "MYNN 271400Z 08012KT 9999 FEW030 28/22 A2992",
             "reportTime": "2026-03-27T14:00:00Z", "temp": 28, "dewp": 22,
             "wdir": 80, "wspd": 12, "wgst": None, "visib": 10.0,
             "altim": 29.92, "fltcat": "VFR", "wxString": "",
             "clouds": [], "name": "Nassau", "lat": 25.04, "lon": -77.47, "elev": 16},
        ]
        with patch("api.sensors.fetch_metars", new_callable=AsyncMock) as m:
            m.return_value = mock_raw
            resp = await client.get(
                "/api/sensors/MYNN",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert "station" in body
        assert body["station"]["icao_code"] == "MYNN"
        assert "current_metar" in body

    async def test_station_detail_no_metar(self, client: AsyncClient, auth_token: str):
        with patch("api.sensors.fetch_metars", new_callable=AsyncMock) as m:
            m.return_value = []
            resp = await client.get(
                "/api/sensors/MYGF",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["current_metar"] is None

    async def test_sensor_grid_operational_health(self, client: AsyncClient, auth_token: str):
        """Grid health_pct should be computed correctly."""
        mock_raw = [
            {"icaoId": "MYNN", "rawOb": "MYNN 271400Z", "reportTime": "2026-03-27T14:00:00Z",
             "temp": 28, "dewp": 22, "wdir": 80, "wspd": 12, "wgst": None,
             "visib": 10.0, "altim": 29.92, "fltcat": "VFR", "wxString": "",
             "clouds": [], "name": "Nassau", "lat": 25.04, "lon": -77.47, "elev": 16},
        ]
        with patch("api.sensors.fetch_metars", new_callable=AsyncMock) as m:
            m.return_value = mock_raw
            resp = await client.get(
                "/api/sensors/grid",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        body = resp.json()
        assert 0.0 <= body["health_pct"] <= 100.0


# ─────────────────────────────────────────────────────────────────────────────
# api/map_data.py
# ─────────────────────────────────────────────────────────────────────────────

class TestMapDataBoost:
    async def test_map_layers_includes_all_fields(self, client: AsyncClient, auth_token: str):
        mock_flights = [
            {"icao24": "abc", "callsign": "BAH1", "latitude": 25.0, "longitude": -77.0,
             "baro_altitude": 35000, "velocity": 250, "true_track": 180,
             "vertical_rate": 0, "on_ground": False, "origin_country": "Bahamas"},
        ]
        with patch("api.map_data.fetch_flights", new_callable=AsyncMock) as m_f, \
             patch("api.map_data.fetch_metars", new_callable=AsyncMock) as m_m, \
             patch("api.map_data.fetch_sigmets", new_callable=AsyncMock) as m_s, \
             patch("api.map_data.fetch_alerts", new_callable=AsyncMock) as m_a, \
             patch("api.map_data.fetch_hurricanes", new_callable=AsyncMock) as m_h:
            m_f.return_value = mock_flights
            m_m.return_value = []
            m_s.return_value = []
            m_a.return_value = []
            m_h.return_value = []
            resp = await client.get(
                "/api/map/layers",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert "flights" in body
        assert "stations" in body
        assert "fir_polygon" in body
        assert "bbox" in body
        assert body["flight_count"] == 1
        assert body["station_count"] > 0

    async def test_map_layers_excludes_flights_without_coords(self, client: AsyncClient, auth_token: str):
        mock_flights = [
            {"icao24": "no_coords", "callsign": "X", "latitude": None, "longitude": None,
             "baro_altitude": 10000, "velocity": 200, "true_track": 0,
             "vertical_rate": 0, "on_ground": False, "origin_country": "US"},
            {"icao24": "has_coords", "callsign": "Y", "latitude": 24.0, "longitude": -76.0,
             "baro_altitude": 20000, "velocity": 300, "true_track": 90,
             "vertical_rate": 0, "on_ground": False, "origin_country": "BS"},
        ]
        with patch("api.map_data.fetch_flights", new_callable=AsyncMock) as m_f, \
             patch("api.map_data.fetch_metars", new_callable=AsyncMock) as m_m, \
             patch("api.map_data.fetch_sigmets", new_callable=AsyncMock) as m_s, \
             patch("api.map_data.fetch_alerts", new_callable=AsyncMock) as m_a, \
             patch("api.map_data.fetch_hurricanes", new_callable=AsyncMock) as m_h:
            m_f.return_value = mock_flights
            m_m.return_value = []
            m_s.return_value = []
            m_a.return_value = []
            m_h.return_value = []
            resp = await client.get(
                "/api/map/layers",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
        body = resp.json()
        assert body["flight_count"] == 1  # Only the one with coords


# ─────────────────────────────────────────────────────────────────────────────
# services/nws_client.py
# ─────────────────────────────────────────────────────────────────────────────

class TestNWSClientDirect:
    async def test_fetch_alerts_success(self):
        from services.nws_client import fetch_alerts
        from services.cache import cache
        cache.delete("nws:alerts")

        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "features": [
                {
                    "properties": {
                        "id": "NWS-001",
                        "event": "Hurricane Watch",
                        "severity": "Extreme",
                        "certainty": "Likely",
                        "urgency": "Immediate",
                        "headline": "Hurricane Watch in effect",
                        "description": "A hurricane is possible.",
                        "instruction": "Evacuate low-lying areas.",
                        "areaDesc": "Bahamas",
                        "effective": "2026-03-27T00:00:00Z",
                        "expires": "2026-03-28T00:00:00Z",
                        "senderName": "NWS Miami",
                    }
                }
            ]
        }
        with patch("services.nws_client._client") as mock_client:
            mock_client.get = AsyncMock(return_value=mock_resp)
            alerts = await fetch_alerts()

        assert len(alerts) == 1
        assert alerts[0]["event"] == "Hurricane Watch"
        assert alerts[0]["severity"] == "Extreme"
        assert alerts[0]["sender"] == "NWS Miami"
        cache.delete("nws:alerts")

    async def test_fetch_alerts_network_error_returns_empty(self):
        from services.nws_client import fetch_alerts
        from services.cache import cache
        cache.delete("nws:alerts")

        with patch("services.nws_client._client") as mock_client:
            mock_client.get = AsyncMock(side_effect=Exception("network error"))
            alerts = await fetch_alerts()

        assert alerts == []

    async def test_fetch_alerts_uses_cache(self):
        from services.nws_client import fetch_alerts
        from services.cache import cache
        cached_data = [{"event": "Cached Alert"}]
        cache.set("nws:alerts", cached_data, 300)

        with patch("services.nws_client._client") as mock_client:
            mock_client.get = AsyncMock()
            alerts = await fetch_alerts()

        mock_client.get.assert_not_called()
        assert alerts == cached_data
        cache.delete("nws:alerts")

    def test_parse_alert_full_fields(self):
        from services.nws_client import _parse_alert
        feature = {
            "properties": {
                "id": "NWS-001",
                "event": "Tropical Storm Warning",
                "severity": "Severe",
                "certainty": "Observed",
                "urgency": "Immediate",
                "headline": "Warning issued",
                "description": "Tropical storm conditions.",
                "instruction": "Seek shelter.",
                "areaDesc": "Nassau",
                "effective": "2026-03-27T00:00:00Z",
                "expires": "2026-03-27T12:00:00Z",
                "senderName": "NWS Miami",
            }
        }
        parsed = _parse_alert(feature)
        assert parsed["id"] == "NWS-001"
        assert parsed["event"] == "Tropical Storm Warning"
        assert parsed["severity"] == "Severe"
        assert parsed["sender"] == "NWS Miami"
        assert parsed["area_desc"] == "Nassau"
        assert parsed["headline"] == "Warning issued"

    def test_parse_alert_missing_fields_defaults(self):
        from services.nws_client import _parse_alert
        parsed = _parse_alert({"properties": {}})
        assert parsed["id"] == ""
        assert parsed["event"] == ""
        assert parsed["severity"] == ""
        assert parsed["sender"] == ""

    def test_parse_alert_missing_properties_key(self):
        from services.nws_client import _parse_alert
        parsed = _parse_alert({})
        assert parsed["id"] == ""


# ─────────────────────────────────────────────────────────────────────────────
# services/openmeteo_client.py
# ─────────────────────────────────────────────────────────────────────────────

class TestOpenMeteoClientDirect:
    async def test_fetch_forecast_success(self):
        from services.openmeteo_client import fetch_forecast
        from services.cache import cache
        cache.delete("forecast:25.04,-77.47")

        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "hourly": {"temperature_2m": [28.0, 27.5]},
            "current": {"temperature_2m": 28.0},
        }
        with patch("services.openmeteo_client._client") as mock_client:
            mock_client.get = AsyncMock(return_value=mock_resp)
            result = await fetch_forecast(25.04, -77.47, "MYNN")

        assert result["station_id"] == "MYNN"
        assert "hourly" in result
        cache.delete("forecast:25.04,-77.47")

    async def test_fetch_forecast_error_returns_empty_dict(self):
        from services.openmeteo_client import fetch_forecast
        from services.cache import cache
        cache.delete("forecast:10.00,-60.00")

        with patch("services.openmeteo_client._client") as mock_client:
            mock_client.get = AsyncMock(side_effect=Exception("timeout"))
            result = await fetch_forecast(10.0, -60.0, "XXXX")

        assert result == {}

    async def test_fetch_forecast_uses_cache(self):
        from services.openmeteo_client import fetch_forecast
        from services.cache import cache
        cached = {"station_id": "MYNN", "hourly": {}}
        cache.set("forecast:25.04,-77.47", cached, 300)

        with patch("services.openmeteo_client._client") as mock_client:
            mock_client.get = AsyncMock()
            result = await fetch_forecast(25.04, -77.47, "MYNN")

        mock_client.get.assert_not_called()
        assert result == cached
        cache.delete("forecast:25.04,-77.47")

    async def test_fetch_forecast_no_station_id(self):
        from services.openmeteo_client import fetch_forecast
        from services.cache import cache
        cache.delete("forecast:20.00,-75.00")

        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"hourly": {}, "current": {}}
        with patch("services.openmeteo_client._client") as mock_client:
            mock_client.get = AsyncMock(return_value=mock_resp)
            result = await fetch_forecast(20.0, -75.0)

        assert result["station_id"] == ""
        cache.delete("forecast:20.00,-75.00")

    async def test_fetch_all_station_forecasts_success(self):
        from services.openmeteo_client import fetch_all_station_forecasts
        from services.cache import cache
        cache.delete("forecasts:all")

        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"hourly": {"temperature_2m": [28.0]}, "current": {}}

        with patch("services.openmeteo_client._client") as mock_client:
            mock_client.get = AsyncMock(return_value=mock_resp)
            results = await fetch_all_station_forecasts()

        assert isinstance(results, list)
        assert len(results) > 0
        cache.delete("forecasts:all")

    async def test_fetch_all_station_forecasts_uses_cache(self):
        from services.openmeteo_client import fetch_all_station_forecasts
        from services.cache import cache
        cached = [{"station_id": "MYNN"}, {"station_id": "MYGF"}]
        cache.set("forecasts:all", cached, 300)

        with patch("services.openmeteo_client._client") as mock_client:
            mock_client.get = AsyncMock()
            results = await fetch_all_station_forecasts()

        mock_client.get.assert_not_called()
        assert results == cached
        cache.delete("forecasts:all")

    async def test_fetch_all_station_forecasts_skips_empty(self):
        """If forecast returns {}, it should NOT be included in results."""
        from services.openmeteo_client import fetch_all_station_forecasts
        from services.cache import cache
        cache.delete("forecasts:all")

        with patch("services.openmeteo_client._client") as mock_client:
            mock_client.get = AsyncMock(side_effect=Exception("err"))
            results = await fetch_all_station_forecasts()

        assert isinstance(results, list)
        # All calls failed → empty forecasts should be excluded
        assert all(r for r in results)  # no empty dicts
        cache.delete("forecasts:all")


# ─────────────────────────────────────────────────────────────────────────────
# services/channel_dispatcher.py
# ─────────────────────────────────────────────────────────────────────────────

class TestChannelDispatcherDirect:
    async def test_dispatch_alert_returns_all_channels(self):
        from services.channel_dispatcher import dispatch_alert, CHANNELS
        results = await dispatch_alert("Test Subject", "Test body", severity="warning")
        assert isinstance(results, list)
        assert len(results) == len(CHANNELS)

    async def test_dispatch_alert_all_status_sent(self):
        from services.channel_dispatcher import dispatch_alert
        results = await dispatch_alert("Hurricane Warning", "Cat 4 approaching")
        for r in results:
            assert r["status"] == "sent"
            assert "channel_type" in r
            assert "channel_name" in r
            assert "sent_at" in r

    async def test_dispatch_alert_with_email_filter(self):
        from services.channel_dispatcher import dispatch_alert, CHANNELS
        results = await dispatch_alert("Email only", "Body", channel_types=["email"])
        for r in results:
            assert r["channel_type"] == "email"
        email_count = sum(1 for c in CHANNELS if c["type"] == "email")
        assert len(results) == email_count

    async def test_dispatch_alert_with_sms_filter(self):
        from services.channel_dispatcher import dispatch_alert, CHANNELS
        results = await dispatch_alert("SMS only", "Body", channel_types=["sms"])
        for r in results:
            assert r["channel_type"] == "sms"

    async def test_dispatch_alert_with_multi_type_filter(self):
        from services.channel_dispatcher import dispatch_alert, CHANNELS
        results = await dispatch_alert("Multi", "Body", channel_types=["email", "telegram"])
        for r in results:
            assert r["channel_type"] in ("email", "telegram")

    async def test_dispatch_to_all_covers_all_channels(self):
        from services.channel_dispatcher import dispatch_to_all, CHANNELS
        results = await dispatch_to_all("Full broadcast", "All channels alert")
        assert len(results) == len(CHANNELS)

    def test_get_channel_summary_total(self):
        from services.channel_dispatcher import get_channel_summary, CHANNELS
        summary = get_channel_summary()
        assert summary["total_channels"] == len(CHANNELS)

    def test_get_channel_summary_by_type(self):
        from services.channel_dispatcher import get_channel_summary
        summary = get_channel_summary()
        assert "by_type" in summary
        assert "email" in summary["by_type"]
        assert summary["by_type"]["email"]["count"] > 0
        assert len(summary["by_type"]["email"]["channels"]) == summary["by_type"]["email"]["count"]

    def test_get_channel_summary_all_known_types(self):
        from services.channel_dispatcher import get_channel_summary
        summary = get_channel_summary()
        types_present = set(summary["by_type"].keys())
        for t in ("whatsapp", "telegram", "slack", "email", "sms", "radio"):
            assert t in types_present

    async def test_dispatch_records_include_icon(self):
        from services.channel_dispatcher import dispatch_alert
        results = await dispatch_alert("Icon test", "Body")
        for r in results:
            assert "icon" in r
