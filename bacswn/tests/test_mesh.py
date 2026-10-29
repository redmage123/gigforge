"""Tests for mesh_network._distance_deg — S2-007 (latitude correction)."""

import math
import pytest


def test_ns_distance_unchanged():
    """Two points at same longitude, 1° latitude apart → distance ≈ 1.0."""
    from services.mesh_network import _distance_deg
    d = _distance_deg(25.0, -77.0, 26.0, -77.0)
    assert abs(d - 1.0) < 0.01, f"N-S distance should be ~1.0, got {d}"


def test_ew_distance_corrected():
    """Two points at same latitude (25°N), 1° longitude apart → distance ≈ cos(25°), NOT 1.0.

    cos(25°) ≈ 0.9063 — the raw Euclidean calculation returns 1.0 (wrong).
    """
    from services.mesh_network import _distance_deg
    expected = math.cos(math.radians(25.0))  # ~0.9063
    d = _distance_deg(25.0, -77.0, 25.0, -76.0)
    # Must be close to cos(25°), not 1.0
    assert abs(d - expected) < 0.01, (
        f"E-W distance at 25°N should be ~{expected:.4f} (cos 25°), got {d:.4f}. "
        "Raw Euclidean returns 1.0 — latitude correction missing."
    )
    # Specifically assert it's NOT close to 1.0
    assert abs(d - 1.0) > 0.05, f"E-W distance must NOT be ~1.0, got {d}"


def test_diagonal_distance_uses_correction():
    """Diagonal pair — distance must account for longitude cos correction."""
    from services.mesh_network import _distance_deg
    lat1, lon1 = 25.0, -77.0
    lat2, lon2 = 26.0, -76.0
    d = _distance_deg(lat1, lon1, lat2, lon2)

    # Manually compute expected with correction
    lat_mid = math.radians((lat1 + lat2) / 2)
    cos_lat = math.cos(lat_mid)
    dlat = lat1 - lat2
    dlon = (lon1 - lon2) * cos_lat
    expected = math.sqrt(dlat ** 2 + dlon ** 2)

    assert abs(d - expected) < 0.001, f"Diagonal distance should be {expected:.4f}, got {d:.4f}"
    # And it must differ from naive Euclidean (sqrt(1² + 1²) = 1.414...)
    naive = math.sqrt((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2)
    assert abs(d - naive) > 0.01, f"Distance {d} should differ from naive {naive}"
