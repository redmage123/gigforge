"""Tests for opensky_client — S2-001 (ADS-B category) and S2-006 (longitude clamp)."""

import pytest
from config import BAHAMAS_BBOX


def _make_state(adsb_category=None, baro_altitude=None):
    """Build a minimal OpenSky state vector (18+ elements)."""
    # Indices: 0=icao24, 1=callsign, 2=origin_country, 3=time_position, 4=last_contact,
    #          5=longitude, 6=latitude, 7=baro_altitude, 8=on_ground, 9=velocity,
    #          10=true_track, 11=vertical_rate, 12=sensors, 13=geo_altitude,
    #          14=squawk, 15=spi, 16=position_source, 17=category
    state = [
        "abc123",   # 0 icao24
        "TST001 ",  # 1 callsign
        "Bahamas",  # 2 origin_country
        None,       # 3
        None,       # 4
        -77.0,      # 5 longitude
        25.0,       # 6 latitude
        baro_altitude,  # 7 baro_altitude
        False,      # 8 on_ground
        200.0,      # 9 velocity
        90.0,       # 10 true_track
        0.0,        # 11 vertical_rate
        None,       # 12 sensors
        baro_altitude,  # 13 geo_altitude
        "1200",     # 14 squawk
        False,      # 15 spi
        0,          # 16 position_source
        adsb_category,  # 17 category (ADS-B)
    ]
    return state


# ── S2-001 Tests ────────────────────────────────────────────────────────


def test_parse_state_uses_adsb_category_when_available():
    """When state[17]=3, category in result must be 3, not altitude-derived."""
    from services.opensky_client import _parse_state
    state = _make_state(adsb_category=3, baro_altitude=500)  # altitude would give 2
    result = _parse_state(state)
    assert result["category"] == 3, f"Expected 3 (ADS-B), got {result['category']}"


def test_parse_state_falls_back_to_altitude_when_adsb_category_is_none():
    """When state[17]=None, category should come from altitude (12000 → 5)."""
    from services.opensky_client import _parse_state
    state = _make_state(adsb_category=None, baro_altitude=12000)
    result = _parse_state(state)
    assert result["category"] == 5, f"Expected 5 (altitude fallback), got {result['category']}"


def test_parse_state_falls_back_to_altitude_when_adsb_category_is_zero():
    """When state[17]=0, category should fall back to altitude-derived value."""
    from services.opensky_client import _parse_state
    state = _make_state(adsb_category=0, baro_altitude=12000)
    result = _parse_state(state)
    assert result["category"] == 5, f"Expected 5 (altitude fallback for zero), got {result['category']}"


def test_parse_state_handles_short_state_vector():
    """A state vector shorter than 18 elements should fall back gracefully."""
    from services.opensky_client import _parse_state
    short_state = [
        "abc123",  # 0
        "TST001",  # 1
        "Bahamas",  # 2
        None,      # 3
        None,      # 4
        -77.0,     # 5
        25.0,      # 6
        8000.0,    # 7 baro_altitude (5000-10000 → category 4)
        False,     # 8
        200.0,     # 9
    ]
    result = _parse_state(short_state)
    # Should not raise; should fall back to altitude-based category
    assert result["category"] in (0, 2, 3, 4, 5), f"Unexpected category {result['category']}"


# ── S2-006 Tests ────────────────────────────────────────────────────────


def test_simulated_flights_within_bbox():
    """The east clamp must be lomax - 0.5, not lomax + 0.5.

    We verify this by patching a flight's base_lon to be near lomax and checking
    the clamped output is <= lomax - 0.5 (+ tiny epsilon for float rounding).
    """
    import unittest.mock as mock
    from services import opensky_client
    from services.opensky_client import _generate_simulated_flights, _SIM_FLIGHTS

    # Patch base_lon of first flight to be exactly lomax (east boundary)
    # With the bug (lomax + 0.5 clamp), the flight would land at lomax (inside +0.5 range)
    # With the fix (lomax - 0.5 clamp), it would be clamped to lomax - 0.5
    east_limit = BAHAMAS_BBOX["lomax"] - 0.5 + 0.01  # lomax - 0.49 upper bound

    patched_flights = [dict(sf) for sf in _SIM_FLIGHTS]
    patched_flights[0]["base_lon"] = BAHAMAS_BBOX["lomax"]  # put it right at the east boundary

    with mock.patch.object(opensky_client, "_SIM_FLIGHTS", patched_flights):
        for _ in range(10):
            flights = _generate_simulated_flights()
            lon = flights[0]["longitude"]
            assert lon <= east_limit, (
                f"Flight longitude {lon} exceeds east limit {east_limit}. "
                f"lomax={BAHAMAS_BBOX['lomax']}. Clamp uses +0.5 instead of -0.5!"
            )
