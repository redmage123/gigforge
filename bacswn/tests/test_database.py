"""BACSWN Sprint 1 — Database CRUD + SQL injection tests (S1-003 + S1-007).

All tests use the autouse `_fresh_db` fixture from conftest.py, which
redirects DB_PATH to a tmp file and runs init_db() — never touches bacswn.db.
"""

import pytest
import pytest_asyncio

from services.database import db_insert, db_select, db_update, db_delete


# ── Basic CRUD ────────────────────────────────────────────────────────────────

class TestInsert:
    @pytest.mark.anyio
    async def test_insert_returns_positive_rowid(self):
        rowid = await db_insert("stations", {
            "icao_code": "TEST",
            "name": "Test Station",
            "latitude": 25.0,
            "longitude": -77.0,
        })
        assert rowid > 0

    @pytest.mark.anyio
    async def test_insert_multiple_rows_increments_id(self):
        id1 = await db_insert("stations", {
            "icao_code": "STA1", "name": "A", "latitude": 25.0, "longitude": -77.0,
        })
        id2 = await db_insert("stations", {
            "icao_code": "STA2", "name": "B", "latitude": 26.0, "longitude": -78.0,
        })
        assert id2 > id1


class TestSelect:
    @pytest.mark.anyio
    async def test_select_all_returns_inserted_rows(self):
        await db_insert("stations", {
            "icao_code": "MYNN", "name": "Nassau", "latitude": 25.039, "longitude": -77.466,
        })
        rows = await db_select("stations")
        assert len(rows) >= 1
        names = [r["icao_code"] for r in rows]
        assert "MYNN" in names

    @pytest.mark.anyio
    async def test_select_with_where_filter(self):
        await db_insert("stations", {
            "icao_code": "MYGF", "name": "Freeport", "latitude": 26.559, "longitude": -78.696,
        })
        await db_insert("stations", {
            "icao_code": "MYEG", "name": "Exuma", "latitude": 23.562, "longitude": -75.878,
        })
        rows = await db_select("stations", where={"icao_code": "MYGF"})
        assert len(rows) == 1
        assert rows[0]["name"] == "Freeport"

    @pytest.mark.anyio
    async def test_select_with_order_by_asc(self):
        for code, name in [("CCC", "C Station"), ("AAA", "A Station"), ("BBB", "B Station")]:
            await db_insert("stations", {
                "icao_code": code, "name": name, "latitude": 25.0, "longitude": -77.0,
            })
        rows = await db_select("stations", order_by="icao_code ASC")
        codes = [r["icao_code"] for r in rows]
        assert codes == sorted(codes)

    @pytest.mark.anyio
    async def test_select_limit_restricts_rows(self):
        for i in range(5):
            await db_insert("stations", {
                "icao_code": f"LIM{i}", "name": f"Limit {i}",
                "latitude": 25.0, "longitude": -77.0,
            })
        rows = await db_select("stations", limit=2)
        assert len(rows) <= 2

    @pytest.mark.anyio
    async def test_select_where_no_match_returns_empty(self):
        rows = await db_select("stations", where={"icao_code": "ZZZZ"})
        assert rows == []


class TestUpdate:
    @pytest.mark.anyio
    async def test_update_matching_row(self):
        await db_insert("stations", {
            "icao_code": "UPDT", "name": "Old Name", "latitude": 25.0, "longitude": -77.0,
        })
        affected = await db_update(
            "stations",
            data={"name": "New Name"},
            where={"icao_code": "UPDT"},
        )
        assert affected == 1
        rows = await db_select("stations", where={"icao_code": "UPDT"})
        assert rows[0]["name"] == "New Name"

    @pytest.mark.anyio
    async def test_update_no_match_returns_zero(self):
        affected = await db_update(
            "stations",
            data={"name": "Anything"},
            where={"icao_code": "NONE"},
        )
        assert affected == 0


class TestDelete:
    @pytest.mark.anyio
    async def test_delete_row(self):
        await db_insert("stations", {
            "icao_code": "DEL1", "name": "Delete Me", "latitude": 25.0, "longitude": -77.0,
        })
        affected = await db_delete("stations", where={"icao_code": "DEL1"})
        assert affected == 1
        rows = await db_select("stations", where={"icao_code": "DEL1"})
        assert rows == []

    @pytest.mark.anyio
    async def test_delete_non_existent_returns_zero(self):
        affected = await db_delete("stations", where={"icao_code": "NONE"})
        assert affected == 0


# ── SQL injection guards (S1-003) ─────────────────────────────────────────────

class TestSQLInjectionGuards:
    """S1-003: table and order_by must be validated against allowlists."""

    # -- db_select injection --

    @pytest.mark.anyio
    async def test_db_select_rejects_injection_in_table(self):
        with pytest.raises(ValueError, match="Unknown table"):
            await db_select("users; DROP TABLE users;--")

    @pytest.mark.anyio
    async def test_db_select_rejects_unknown_table(self):
        with pytest.raises(ValueError, match="Unknown table"):
            await db_select("nonexistent_table")

    @pytest.mark.anyio
    async def test_db_select_rejects_injection_in_order_by(self):
        with pytest.raises(ValueError, match="Invalid column name"):
            await db_select("users", order_by="id; DROP TABLE users;--")

    @pytest.mark.anyio
    async def test_db_select_rejects_xss_in_order_by(self):
        with pytest.raises(ValueError, match="Invalid column name"):
            await db_select("users", order_by="<script>alert(1)</script>")

    @pytest.mark.anyio
    async def test_db_select_rejects_space_injection_in_order_by(self):
        with pytest.raises(ValueError, match="Invalid column name"):
            await db_select("users", order_by="id, (SELECT 1)")

    # -- db_insert injection --

    @pytest.mark.anyio
    async def test_db_insert_rejects_injection_in_table(self):
        with pytest.raises(ValueError, match="Unknown table"):
            await db_insert("users; INSERT INTO users --", {"name": "x"})

    @pytest.mark.anyio
    async def test_db_insert_rejects_unknown_table(self):
        with pytest.raises(ValueError, match="Unknown table"):
            await db_insert("shadow_table", {"col": "val"})

    # -- db_update injection --

    @pytest.mark.anyio
    async def test_db_update_rejects_injection_in_table(self):
        with pytest.raises(ValueError, match="Unknown table"):
            await db_update("users UNION SELECT --", {"a": "b"}, {"id": 1})

    # -- db_delete injection --

    @pytest.mark.anyio
    async def test_db_delete_rejects_injection_in_table(self):
        with pytest.raises(ValueError, match="Unknown table"):
            await db_delete("users; DROP TABLE users", {"id": 1})

    # -- Valid inputs continue to work --

    @pytest.mark.anyio
    async def test_valid_table_and_order_by_accepted(self):
        """Sanity check: valid inputs must not raise."""
        rows = await db_select("stations", order_by="created_at DESC")
        assert isinstance(rows, list)

    @pytest.mark.anyio
    async def test_valid_order_by_asc_accepted(self):
        rows = await db_select("advisories", order_by="id ASC")
        assert isinstance(rows, list)

    @pytest.mark.anyio
    async def test_all_schema_tables_are_allowed(self):
        """Every table in the schema must be in the allowlist."""
        allowed_tables = [
            "users", "weather_observations", "flight_records", "emissions",
            "incidents", "channel_messages", "agent_activity", "stations", "advisories",
        ]
        for table in allowed_tables:
            rows = await db_select(table)
            assert isinstance(rows, list), f"Table {table!r} should be selectable"
