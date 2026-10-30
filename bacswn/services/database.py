"""BACSWN — SQLite database layer (aiosqlite + WAL mode)."""

import re
import aiosqlite
from contextlib import asynccontextmanager
from typing import AsyncIterator
from config import DATA_DIR, DB_PATH

# ── SQL injection guards (S1-003) ────────────────────────────────────────────
_ALLOWED_TABLES = {
    "users",
    "weather_observations",
    "flight_records",
    "emissions",
    "incidents",
    "channel_messages",
    "agent_activity",
    "stations",
    "advisories",
    "forecast_verifications",
    "carbon_operators",
    "carbon_emission_reports",
    "carbon_unit_claims",
    "carbon_claim_reviews",
    "carbon_fir_observations",
}
# Allows: column, column ASC, column DESC (case-insensitive)
_COL_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*(\s+(ASC|DESC))?$", re.IGNORECASE)


def _validate_table(table: str) -> None:
    if table not in _ALLOWED_TABLES:
        raise ValueError(f"Unknown table: {table!r}")


def _validate_column(col: str) -> None:
    if not _COL_RE.match(col.strip()):
        raise ValueError(f"Invalid column name: {col!r}")

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT    NOT NULL UNIQUE,
    password_hash   TEXT    NOT NULL,
    role            TEXT    NOT NULL DEFAULT 'user',
    first_name      TEXT    NOT NULL DEFAULT '',
    last_name       TEXT    NOT NULL DEFAULT '',
    title           TEXT    NOT NULL DEFAULT '',
    department      TEXT    NOT NULL DEFAULT '',
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS weather_observations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id      TEXT    NOT NULL,
    obs_type        TEXT    NOT NULL DEFAULT 'METAR',
    raw_text        TEXT    NOT NULL,
    temp_c          REAL,
    dewpoint_c      REAL,
    wind_dir_deg    INTEGER,
    wind_speed_kt   INTEGER,
    wind_gust_kt    INTEGER,
    visibility_sm   REAL,
    altimeter_inhg  REAL,
    flight_category TEXT,
    wx_string       TEXT,
    cloud_layers    TEXT,
    observed_at     TEXT    NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS flight_records (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    icao24          TEXT    NOT NULL,
    callsign        TEXT,
    origin_country  TEXT,
    longitude       REAL,
    latitude        REAL,
    baro_altitude   REAL,
    velocity        REAL,
    true_track      REAL,
    vertical_rate   REAL,
    on_ground       INTEGER DEFAULT 0,
    category        TEXT,
    recorded_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS emissions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    icao24          TEXT    NOT NULL,
    callsign        TEXT,
    aircraft_type   TEXT,
    fuel_burn_kg    REAL    NOT NULL DEFAULT 0,
    co2_kg          REAL    NOT NULL DEFAULT 0,
    distance_nm     REAL,
    flight_time_min REAL,
    methodology     TEXT    NOT NULL DEFAULT 'CORSIA',
    calculated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS incidents (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_type   TEXT    NOT NULL,
    severity        TEXT    NOT NULL DEFAULT 'info',
    title           TEXT    NOT NULL,
    description     TEXT,
    station_id      TEXT,
    latitude        REAL,
    longitude       REAL,
    status          TEXT    NOT NULL DEFAULT 'active',
    created_by      TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    resolved_at     TEXT
);

CREATE TABLE IF NOT EXISTS channel_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_type    TEXT    NOT NULL,
    channel_name    TEXT,
    message_type    TEXT    NOT NULL DEFAULT 'alert',
    subject         TEXT,
    body            TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'sent',
    recipient       TEXT,
    sent_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_activity (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name      TEXT    NOT NULL,
    action          TEXT    NOT NULL,
    details         TEXT,
    status          TEXT    NOT NULL DEFAULT 'completed',
    duration_ms     INTEGER,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    icao_code       TEXT    NOT NULL UNIQUE,
    name            TEXT    NOT NULL,
    latitude        REAL    NOT NULL,
    longitude       REAL    NOT NULL,
    elevation_ft    INTEGER DEFAULT 0,
    station_type    TEXT    NOT NULL DEFAULT 'aviation',
    status          TEXT    NOT NULL DEFAULT 'operational',
    last_report     TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS advisories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    advisory_type   TEXT    NOT NULL DEFAULT 'SIGMET',
    hazard_type     TEXT    NOT NULL,
    raw_text        TEXT    NOT NULL,
    severity        TEXT    NOT NULL DEFAULT 'moderate',
    area            TEXT,
    valid_from      TEXT,
    valid_to        TEXT,
    generated_by    TEXT    NOT NULL DEFAULT 'ai',
    status          TEXT    NOT NULL DEFAULT 'draft',
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS forecast_verifications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id      TEXT    NOT NULL,
    variable        TEXT    NOT NULL,
    lead_h          INTEGER NOT NULL,
    issued_at       TEXT    NOT NULL,
    valid_at        TEXT    NOT NULL,
    forecast_value  REAL,
    observed_value  REAL,
    signed_error    REAL,
    abs_error       REAL,
    forecast_cat    TEXT,
    observed_cat    TEXT,
    cat_hit         INTEGER,
    corrected_value REAL,
    corrected_signed_error REAL,
    corrected_abs_error    REAL,
    source          TEXT    NOT NULL DEFAULT 'live',
    status          TEXT    NOT NULL DEFAULT 'pending',
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- CORSIA oversight register (services/carbon_oversight.py). The state records
-- what each attributed aircraft operator reports — verified emissions and the
-- emissions units it says it cancelled — and reviews those claims. Evidence
-- tables are append-only: revisions are new rows, reviews are new decisions.
CREATE TABLE IF NOT EXISTS carbon_operators (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    icao_designator TEXT    NOT NULL UNIQUE,
    name            TEXT    NOT NULL,
    notes           TEXT    NOT NULL DEFAULT '',
    created_by      TEXT    NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carbon_emission_reports (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_id     INTEGER NOT NULL REFERENCES carbon_operators(id),
    year            INTEGER NOT NULL,
    verified_co2_t  INTEGER NOT NULL CHECK (verified_co2_t >= 0),
    growth_factor   REAL    NOT NULL CHECK (growth_factor >= 0 AND growth_factor <= 1),
    verifier        TEXT    NOT NULL DEFAULT '',
    reference       TEXT    NOT NULL DEFAULT '',
    notes           TEXT    NOT NULL DEFAULT '',
    created_by      TEXT    NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carbon_unit_claims (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_id        INTEGER NOT NULL REFERENCES carbon_operators(id),
    compliance_period  TEXT    NOT NULL,
    registry           TEXT    NOT NULL,
    serial_block       TEXT    NOT NULL DEFAULT '',
    serial_start       INTEGER,
    serial_end         INTEGER,
    quantity           INTEGER NOT NULL CHECK (quantity > 0),
    vintage            INTEGER NOT NULL,
    project_id         TEXT    NOT NULL DEFAULT '',
    project_name       TEXT    NOT NULL DEFAULT '',
    declared_eligible  INTEGER NOT NULL DEFAULT 1,
    cancelled_on       TEXT    NOT NULL,
    registry_reference TEXT    NOT NULL DEFAULT '',
    notes              TEXT    NOT NULL DEFAULT '',
    created_by         TEXT    NOT NULL,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carbon_claim_reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id    INTEGER NOT NULL REFERENCES carbon_unit_claims(id),
    decision    TEXT    NOT NULL CHECK (decision IN ('VERIFIED', 'REJECTED', 'REOPENED')),
    reason      TEXT    NOT NULL DEFAULT '',
    created_by  TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- BACSWN's own sightings: one row per continuous FIR segment of a flight.
CREATE TABLE IF NOT EXISTS carbon_fir_observations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    icao24      TEXT    NOT NULL,
    callsign    TEXT    NOT NULL,
    designator  TEXT    NOT NULL,
    category    TEXT    NOT NULL,
    simulated   INTEGER NOT NULL DEFAULT 0,
    first_seen  TEXT    NOT NULL,
    last_seen   TEXT    NOT NULL
);

CREATE TRIGGER IF NOT EXISTS carbon_reports_immutable_u BEFORE UPDATE ON carbon_emission_reports
BEGIN SELECT RAISE(ABORT, 'carbon_emission_reports is append-only'); END;
CREATE TRIGGER IF NOT EXISTS carbon_reports_immutable_d BEFORE DELETE ON carbon_emission_reports
BEGIN SELECT RAISE(ABORT, 'carbon_emission_reports is append-only'); END;
CREATE TRIGGER IF NOT EXISTS carbon_claims_immutable_u BEFORE UPDATE ON carbon_unit_claims
BEGIN SELECT RAISE(ABORT, 'carbon_unit_claims is append-only'); END;
CREATE TRIGGER IF NOT EXISTS carbon_claims_immutable_d BEFORE DELETE ON carbon_unit_claims
BEGIN SELECT RAISE(ABORT, 'carbon_unit_claims is append-only'); END;
CREATE TRIGGER IF NOT EXISTS carbon_reviews_immutable_u BEFORE UPDATE ON carbon_claim_reviews
BEGIN SELECT RAISE(ABORT, 'carbon_claim_reviews is append-only'); END;
CREATE TRIGGER IF NOT EXISTS carbon_reviews_immutable_d BEFORE DELETE ON carbon_claim_reviews
BEGIN SELECT RAISE(ABORT, 'carbon_claim_reviews is append-only'); END;
"""

# Columns added after the initial release — applied as lightweight migrations.
_MIGRATIONS = {
    "forecast_verifications": {
        "corrected_value": "REAL",
        "corrected_signed_error": "REAL",
        "corrected_abs_error": "REAL",
    },
}

_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_wx_station ON weather_observations(station_id);
CREATE INDEX IF NOT EXISTS idx_wx_observed ON weather_observations(observed_at);
CREATE INDEX IF NOT EXISTS idx_flights_icao24 ON flight_records(icao24);
CREATE INDEX IF NOT EXISTS idx_flights_recorded ON flight_records(recorded_at);
CREATE INDEX IF NOT EXISTS idx_emissions_icao24 ON emissions(icao24);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_agent_name ON agent_activity(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_created ON agent_activity(created_at);
CREATE INDEX IF NOT EXISTS idx_advisories_status ON advisories(status);
CREATE INDEX IF NOT EXISTS idx_channel_sent ON channel_messages(sent_at);
CREATE INDEX IF NOT EXISTS idx_fv_status ON forecast_verifications(status);
CREATE INDEX IF NOT EXISTS idx_fv_valid ON forecast_verifications(valid_at);
CREATE INDEX IF NOT EXISTS idx_fv_lookup ON forecast_verifications(station_id, issued_at, lead_h, variable);
CREATE INDEX IF NOT EXISTS idx_reports_op_year ON carbon_emission_reports(operator_id, year);
CREATE INDEX IF NOT EXISTS idx_claims_op_period ON carbon_unit_claims(operator_id, compliance_period);
CREATE INDEX IF NOT EXISTS idx_reviews_claim ON carbon_claim_reviews(claim_id);
CREATE INDEX IF NOT EXISTS idx_fir_obs_lookup ON carbon_fir_observations(icao24, callsign, last_seen);
CREATE INDEX IF NOT EXISTS idx_fir_obs_designator ON carbon_fir_observations(designator, first_seen);
"""


async def init_db() -> None:
    """Create database and tables — safe to call multiple times."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA foreign_keys=ON")
        await db.executescript(_SCHEMA_SQL)
        await db.executescript(_INDEX_SQL)
        # Apply additive column migrations (SQLite has no ADD COLUMN IF NOT EXISTS).
        for table, cols in _MIGRATIONS.items():
            cursor = await db.execute(f"PRAGMA table_info({table})")
            existing = {row[1] for row in await cursor.fetchall()}
            for col, decl in cols.items():
                if col not in existing:
                    await db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")
        await db.commit()


@asynccontextmanager
async def get_db() -> AsyncIterator[aiosqlite.Connection]:
    """Async context manager for database connections."""
    db = await aiosqlite.connect(str(DB_PATH))
    try:
        await db.execute("PRAGMA foreign_keys=ON")
        db.row_factory = aiosqlite.Row
        yield db
    finally:
        await db.close()


async def db_insert(table: str, data: dict) -> int:
    """Insert a row and return the new rowid."""
    _validate_table(table)
    columns = ", ".join(data.keys())
    placeholders = ", ".join("?" for _ in data)
    async with get_db() as db:
        cursor = await db.execute(
            f"INSERT INTO {table} ({columns}) VALUES ({placeholders})",
            list(data.values()),
        )
        await db.commit()
        return cursor.lastrowid


async def db_select(table: str, where: dict | None = None, order_by: str = "", limit: int = 100) -> list[dict]:
    """Select rows as list of dicts."""
    _validate_table(table)
    if order_by:
        _validate_column(order_by)
    sql = f"SELECT * FROM {table}"
    params = []
    if where:
        clauses = [f"{k} = ?" for k in where]
        sql += " WHERE " + " AND ".join(clauses)
        params = list(where.values())
    if order_by:
        sql += f" ORDER BY {order_by}"
    sql += f" LIMIT {limit}"
    async with get_db() as db:
        cursor = await db.execute(sql, params)
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def db_update(table: str, data: dict, where: dict) -> int:
    """Update rows and return affected count."""
    _validate_table(table)
    set_clause = ", ".join(f"{k} = ?" for k in data)
    where_clause = " AND ".join(f"{k} = ?" for k in where)
    params = list(data.values()) + list(where.values())
    async with get_db() as db:
        cursor = await db.execute(
            f"UPDATE {table} SET {set_clause} WHERE {where_clause}", params
        )
        await db.commit()
        return cursor.rowcount


async def db_delete(table: str, where: dict) -> int:
    """Delete rows and return affected count."""
    _validate_table(table)
    where_clause = " AND ".join(f"{k} = ?" for k in where)
    async with get_db() as db:
        cursor = await db.execute(
            f"DELETE FROM {table} WHERE {where_clause}", list(where.values())
        )
        await db.commit()
        return cursor.rowcount


async def db_execute(sql: str, params: list | None = None) -> list[dict]:
    """Execute raw SQL and return results as list of dicts."""
    async with get_db() as db:
        cursor = await db.execute(sql, params or [])
        if cursor.description:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]
        await db.commit()
        return []


_DEMO_ADVISORIES = [
    {
        "advisory_type": "SIGMET",
        "hazard_type": "TS",
        "raw_text": (
            "MYNN SIGMET 0001 VALID 150600/151200 MYNN-\n"
            "MYNN NASSAU FIR TS MOD\n"
            "OBS AT 0600Z EMBEDDED THUNDERSTORMS DEVELOPING OVER NORTHERN BAHAMAS\n"
            "FL000/350\nMOV NE 15KT\nINTSF/NC"
        ),
        "severity": "moderate",
        "area": "MYNN FIR",
        "valid_from": "2026-03-15T06:00:00+00:00",
        "valid_to": "2026-03-15T12:00:00+00:00",
        "generated_by": "bacswn-sigmet-drafter",
        "status": "active",
    },
    {
        "advisory_type": "SIGMET",
        "hazard_type": "TURB",
        "raw_text": (
            "MYNN SIGMET 0002 VALID 150800/151400 MYNN-\n"
            "MYNN NASSAU FIR TURB SEV\n"
            "OBS AT 0800Z SEVERE TURBULENCE OVER CENTRAL BAHAMAS AT FL240-FL360\n"
            "FL240/360\nMOV STNR\nINTSF/NC"
        ),
        "severity": "severe",
        "area": "MYNN FIR",
        "valid_from": "2026-03-15T08:00:00+00:00",
        "valid_to": "2026-03-15T14:00:00+00:00",
        "generated_by": "bacswn-sigmet-drafter",
        "status": "active",
    },
    {
        "advisory_type": "AIRMET",
        "hazard_type": "ICE",
        "raw_text": (
            "MYNN AIRMET 0003 VALID 150400/150900 MYNN-\n"
            "MYNN NASSAU FIR ICE LGT\n"
            "OBS AT 0400Z LIGHT ICING IN CLOUD LAYERS OVER SOUTHEAST BAHAMAS\n"
            "FL080/180\nMOV E 10KT\nWKN"
        ),
        "severity": "light",
        "area": "MYNN FIR",
        "valid_from": "2026-03-15T04:00:00+00:00",
        "valid_to": "2026-03-15T09:00:00+00:00",
        "generated_by": "bacswn-sigmet-drafter",
        "status": "expired",
    },
    {
        "advisory_type": "SIGMET",
        "hazard_type": "TC",
        "raw_text": (
            "MYNN SIGMET 0004 VALID 151000/152200 MYNN-\n"
            "MYNN NASSAU FIR TC SEV\n"
            "OBS AT 1000Z TROPICAL CYCLONE WATCH AREA SOUTHERN FIR BOUNDARY\n"
            "FL000/450\nMOV NW 08KT\nINTSF"
        ),
        "severity": "severe",
        "area": "MYNN FIR",
        "valid_from": "2026-03-15T10:00:00+00:00",
        "valid_to": "2026-03-15T22:00:00+00:00",
        "generated_by": "bacswn-sigmet-drafter",
        "status": "draft",
    },
]

_DEMO_INCIDENTS = [
    {
        "incident_type": "weather",
        "severity": "warning",
        "title": "Embedded TS Activity — Nassau FIR North",
        "description": "Embedded thunderstorm cluster moving NE at 15kt. Tops FL350. Multiple pilot reports of moderate turbulence.",
        "station_id": "MYNN",
        "latitude": 25.8,
        "longitude": -77.9,
        "status": "active",
        "created_by": "bacswn-wx-monitor",
    },
    {
        "incident_type": "airspace",
        "severity": "info",
        "title": "TFR Active — Andros Island",
        "description": "Temporary flight restriction active over Andros Island due to SAR operation. All VFR traffic deviate.",
        "station_id": "MYCB",
        "latitude": 24.2,
        "longitude": -77.8,
        "status": "active",
        "created_by": "bacswn-chief",
    },
    {
        "incident_type": "sensor",
        "severity": "info",
        "title": "Comms Degraded — San Salvador ASOS",
        "description": "Automated surface observation at MYES reporting intermittently. Manual obs requested.",
        "station_id": "MYES",
        "latitude": 24.063,
        "longitude": -74.524,
        "status": "resolved",
        "created_by": "bacswn-qc",
    },
]


async def seed_demo_data() -> None:
    """Insert demo advisories and incidents on first boot (no-op if rows already exist)."""
    async with get_db() as db:
        cursor = await db.execute("SELECT COUNT(*) FROM advisories")
        row = await cursor.fetchone()
        if row and row[0] == 0:
            _ADV_COLS = "advisory_type, hazard_type, raw_text, severity, area, valid_from, valid_to, generated_by, status"
            _ADV_PHS = "?, ?, ?, ?, ?, ?, ?, ?, ?"
            for adv in _DEMO_ADVISORIES:
                await db.execute(
                    f"INSERT INTO advisories ({_ADV_COLS}) VALUES ({_ADV_PHS})",
                    [adv[k] for k in ("advisory_type", "hazard_type", "raw_text", "severity", "area", "valid_from", "valid_to", "generated_by", "status")],
                )

        cursor = await db.execute("SELECT COUNT(*) FROM incidents")
        row = await cursor.fetchone()
        if row and row[0] == 0:
            _INC_COLS = ", ".join(_DEMO_INCIDENTS[0].keys()) if _DEMO_INCIDENTS else ""
            _INC_PHS = ", ".join("?" for _ in _DEMO_INCIDENTS[0]) if _DEMO_INCIDENTS else ""
            for inc in _DEMO_INCIDENTS:
                await db.execute(
                    "INSERT INTO incidents (" + _INC_COLS + ") VALUES (" + _INC_PHS + ")",
                    list(inc.values()),
                )

        await db.commit()
