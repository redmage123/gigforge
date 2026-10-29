"""BACSWN Sprint 1 — SIGMET generator tests (S1-001 + S1-004).

TDD note: S1-001 bug (valid_to == valid_from) was confirmed RED on 2026-03-19,
then fixed in sigmet_generator.py. These tests are the GREEN + REFACTOR phase.
"""

import pytest
from datetime import datetime, timezone

from services.sigmet_generator import generate_sigmet, HAZARD_TYPES


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_sigmet(**kwargs):
    defaults = {
        "hazard_type": "TS",
        "description": "Test thunderstorms over Nassau FIR",
        "valid_hours": 4,
    }
    defaults.update(kwargs)
    return generate_sigmet(**defaults)


# ── S1-001 — valid_to duration (ICAO compliance) ─────────────────────────────

class TestValidToDuration:
    """S1-001: valid_to must be strictly after valid_from."""

    def test_valid_to_is_after_valid_from(self):
        """Regression test for S1-001 bug: valid_to was set to now instead of now+hours."""
        sigmet = make_sigmet(valid_hours=4)
        vf = datetime.fromisoformat(sigmet["valid_from"])
        vt = datetime.fromisoformat(sigmet["valid_to"])
        assert vt > vf, "REGRESSION: valid_to must be strictly after valid_from"

    @pytest.mark.parametrize("hours", [1, 2, 4, 6, 12])
    def test_valid_to_equals_valid_from_plus_hours(self, hours):
        sigmet = make_sigmet(valid_hours=hours)
        vf = datetime.fromisoformat(sigmet["valid_from"])
        vt = datetime.fromisoformat(sigmet["valid_to"])
        delta_hours = (vt - vf).total_seconds() / 3600
        # Allow ±2 seconds of clock drift during test execution
        assert abs(delta_hours - hours) < (2 / 3600), \
            f"Duration should be {hours}h, got {delta_hours:.4f}h"

    def test_valid_from_and_valid_to_are_iso8601(self):
        sigmet = make_sigmet()
        # Both must parse without raising
        vf = datetime.fromisoformat(sigmet["valid_from"])
        vt = datetime.fromisoformat(sigmet["valid_to"])
        assert vf.tzinfo is not None, "valid_from must be timezone-aware"
        assert vt.tzinfo is not None, "valid_to must be timezone-aware"

    def test_valid_hours_stored_in_result(self):
        sigmet = make_sigmet(valid_hours=6)
        assert sigmet["valid_hours"] == 6


# ── S1-004 — Full sigmet_generator test suite ────────────────────────────────

class TestSigmetStructure:
    """S1-004: ICAO output structure and field presence."""

    def test_advisory_type_is_sigmet(self):
        sigmet = make_sigmet()
        assert sigmet["advisory_type"] == "SIGMET"

    def test_hazard_type_stored_uppercase(self):
        sigmet = make_sigmet(hazard_type="ts")
        assert sigmet["hazard_type"] == "TS"

    def test_raw_text_present_and_non_empty(self):
        sigmet = make_sigmet()
        assert "raw_text" in sigmet
        assert len(sigmet["raw_text"]) > 20

    def test_raw_text_contains_sigmet_header(self):
        sigmet = make_sigmet()
        assert "SIGMET" in sigmet["raw_text"]

    def test_raw_text_contains_mynn_fir(self):
        """MYNN is the ICAO identifier for Nassau FIR."""
        sigmet = make_sigmet()
        assert "MYNN" in sigmet["raw_text"]

    def test_fl_levels_in_raw_text(self):
        # Raw text uses combined format: FL{base:03d}/{top:03d}
        sigmet = make_sigmet(fl_base=50, fl_top=350)
        assert "FL050/350" in sigmet["raw_text"]

    def test_default_area_is_mynn_fir(self):
        sigmet = make_sigmet()
        assert sigmet["area"] == "MYNN FIR"

    def test_movement_in_result(self):
        sigmet = make_sigmet(movement="NE")
        assert sigmet["movement"] == "NE"
        assert "MOV NE" in sigmet["raw_text"]

    def test_status_is_draft(self):
        sigmet = make_sigmet()
        assert sigmet["status"] == "draft"

    def test_generated_by_field(self):
        sigmet = make_sigmet()
        assert sigmet["generated_by"] == "bacswn-sigmet-drafter"


class TestSigmetHazardTypes:
    """S1-004: All ICAO hazard types produce valid output."""

    @pytest.mark.parametrize("code", list(HAZARD_TYPES.keys()))
    def test_known_hazard_type_accepted(self, code):
        sigmet = make_sigmet(hazard_type=code)
        assert sigmet["hazard_type"] == code
        assert code in sigmet["raw_text"]

    def test_unknown_hazard_type_uses_code_as_name(self):
        """Unknown types are passed through — name falls back to the code itself."""
        sigmet = make_sigmet(hazard_type="CUSTOM")
        assert sigmet["hazard_type"] == "CUSTOM"
        assert sigmet["hazard_name"] == "CUSTOM"


class TestSigmetSeverity:
    """S1-004: Severity mapping."""

    @pytest.mark.parametrize("severity,expected_code", [
        ("light", "LGT"),
        ("moderate", "MOD"),
        ("severe", "SEV"),
        ("extreme", "EXTM"),
    ])
    def test_severity_code_mapping(self, severity, expected_code):
        sigmet = make_sigmet(severity=severity)
        assert sigmet["severity_code"] == expected_code
        assert expected_code in sigmet["raw_text"]

    def test_unknown_severity_defaults_to_mod(self):
        sigmet = make_sigmet(severity="catastrophic")
        assert sigmet["severity_code"] == "MOD"


class TestSigmetFlightLevels:
    """S1-004: FL base/top constraints."""

    def test_fl_base_and_top_stored(self):
        sigmet = make_sigmet(fl_base=100, fl_top=300)
        assert sigmet["fl_base"] == 100
        assert sigmet["fl_top"] == 300

    def test_fl_zero_base_formats_correctly(self):
        sigmet = make_sigmet(fl_base=0, fl_top=450)
        assert "FL000/450" in sigmet["raw_text"]
