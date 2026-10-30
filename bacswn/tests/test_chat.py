"""BACSWN — Chat API endpoint tests."""

import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient


class TestChatHelp:
    async def test_general_query_returns_help(self, client: AsyncClient, auth_token: str):
        resp = await client.post(
            "/api/chat/",
            json={"message": "hello"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["type"] == "help"
        assert "response" in body

    async def test_help_response_contains_station_codes(self, client: AsyncClient, auth_token: str):
        resp = await client.post(
            "/api/chat/",
            json={"message": "what can you do"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        assert "MYNN" in resp.json()["response"]

    async def test_unauthenticated_returns_401(self, client: AsyncClient):
        resp = await client.post("/api/chat/", json={"message": "hello"})
        assert resp.status_code == 401


class TestChatStationQuery:
    async def test_station_query_mynn(self, client: AsyncClient, auth_token: str):
        mock_metar = [{"rawOb": "MYNN 271400Z 08012KT 9999 FEW030 28/22 A2992",
                        "temp_c": 28, "wind_speed_kt": 12, "flight_category": "VFR",
                        "raw_text": "MYNN 271400Z 08012KT"}]
        mock_taf = [{"rawTAF": "MYNN 271730Z 2718/2818 08010KT 9999 FEW030"}]

        with patch("api.chat.fetch_metars", new_callable=AsyncMock) as m_metar, \
             patch("api.chat.fetch_tafs", new_callable=AsyncMock) as m_taf, \
             patch("api.chat.parse_metar") as m_parse:
            m_metar.return_value = mock_metar
            m_taf.return_value = mock_taf
            m_parse.return_value = {"raw_text": mock_metar[0]["rawOb"],
                                    "flight_category": "VFR", "temp_c": 28,
                                    "wind_speed_kt": 12}

            resp = await client.post(
                "/api/chat/",
                json={"message": "Weather at MYNN"},
                headers={"Authorization": f"Bearer {auth_token}"},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["type"] == "briefing"
        assert body["station"] == "MYNN"
        assert "MYNN" in body["response"]
        assert "VFR" in body["response"]

    async def test_station_query_case_insensitive(self, client: AsyncClient, auth_token: str):
        """Lowercase station code should still match (query is uppercased)."""
        with patch("api.chat.fetch_metars", new_callable=AsyncMock) as m_metar, \
             patch("api.chat.fetch_tafs", new_callable=AsyncMock) as m_taf, \
             patch("api.chat.parse_metar") as m_parse:
            m_metar.return_value = []
            m_taf.return_value = []
            m_parse.return_value = {}

            resp = await client.post(
                "/api/chat/",
                json={"message": "weather at mynn"},
                headers={"Authorization": f"Bearer {auth_token}"},
            )

        assert resp.status_code == 200
        assert resp.json()["type"] == "briefing"

    async def test_station_query_no_metar_available(self, client: AsyncClient, auth_token: str):
        with patch("api.chat.fetch_metars", new_callable=AsyncMock) as m_metar, \
             patch("api.chat.fetch_tafs", new_callable=AsyncMock) as m_taf, \
             patch("api.chat.parse_metar") as m_parse:
            m_metar.return_value = []
            m_taf.return_value = []
            m_parse.return_value = {}

            resp = await client.post(
                "/api/chat/",
                json={"message": "MYGF weather"},
                headers={"Authorization": f"Bearer {auth_token}"},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert "No METAR available" in body["response"] or body["type"] == "briefing"


class TestChatFlightQuery:
    async def test_flight_query_returns_traffic(self, client: AsyncClient, auth_token: str):
        mock_flights = [
            {"callsign": "BAH001", "origin_country": "Bahamas",
             "baro_altitude": 35000, "on_ground": False},
            {"callsign": "AA123", "origin_country": "United States",
             "baro_altitude": None, "on_ground": True},
        ]
        with patch("api.chat.fetch_flights", new_callable=AsyncMock) as m_flights:
            m_flights.return_value = mock_flights

            resp = await client.post(
                "/api/chat/",
                json={"message": "How many flights are in the airspace?"},
                headers={"Authorization": f"Bearer {auth_token}"},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["type"] == "traffic"
        assert "2" in body["response"]

    async def test_aircraft_keyword(self, client: AsyncClient, auth_token: str):
        with patch("api.chat.fetch_flights", new_callable=AsyncMock) as m_flights:
            m_flights.return_value = []

            resp = await client.post(
                "/api/chat/",
                json={"message": "aircraft in bahamas"},
                headers={"Authorization": f"Bearer {auth_token}"},
            )

        assert resp.status_code == 200
        assert resp.json()["type"] == "traffic"

    async def test_traffic_keyword(self, client: AsyncClient, auth_token: str):
        with patch("api.chat.fetch_flights", new_callable=AsyncMock) as m_flights:
            m_flights.return_value = []

            resp = await client.post(
                "/api/chat/",
                json={"message": "traffic report"},
                headers={"Authorization": f"Bearer {auth_token}"},
            )

        assert resp.status_code == 200
        assert resp.json()["type"] == "traffic"

    async def test_airspace_keyword(self, client: AsyncClient, auth_token: str):
        with patch("api.chat.fetch_flights", new_callable=AsyncMock) as m_flights:
            m_flights.return_value = []

            resp = await client.post(
                "/api/chat/",
                json={"message": "airspace status"},
                headers={"Authorization": f"Bearer {auth_token}"},
            )

        assert resp.status_code == 200
        assert resp.json()["type"] == "traffic"

    async def test_flight_response_shows_on_ground_count(self, client: AsyncClient, auth_token: str):
        mock_flights = [
            {"callsign": "A", "origin_country": "US", "baro_altitude": 30000, "on_ground": False},
            {"callsign": "B", "origin_country": "BS", "baro_altitude": None, "on_ground": True},
            {"callsign": "C", "origin_country": "BS", "baro_altitude": None, "on_ground": True},
        ]
        with patch("api.chat.fetch_flights", new_callable=AsyncMock) as m_flights:
            m_flights.return_value = mock_flights

            resp = await client.post(
                "/api/chat/",
                json={"message": "FLIGHT status"},
                headers={"Authorization": f"Bearer {auth_token}"},
            )

        body = resp.json()
        assert "1" in body["response"]  # airborne
        assert "2" in body["response"]  # on ground
