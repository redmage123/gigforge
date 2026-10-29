"""Tests for CircuitBreaker — S2-002."""

import time
import unittest.mock as mock
import pytest


def test_circuit_opens_after_threshold_failures():
    """After failure_threshold failures, circuit moves to 'open' state."""
    from services.opensky_client import CircuitBreaker
    cb = CircuitBreaker("test", failure_threshold=3, timeout_seconds=60)
    assert cb._state == "closed"
    cb.record_failure()
    cb.record_failure()
    assert cb._state == "closed"
    cb.record_failure()
    assert cb._state == "open", f"Expected open after 3 failures, got {cb._state}"


def test_circuit_closed_allows_calls():
    """A fresh circuit breaker is closed and is_open() returns False."""
    from services.opensky_client import CircuitBreaker
    cb = CircuitBreaker("test", failure_threshold=3, timeout_seconds=60)
    assert cb.is_open() is False


def test_circuit_open_blocks_calls():
    """After opening, is_open() returns True."""
    from services.opensky_client import CircuitBreaker
    cb = CircuitBreaker("test", failure_threshold=2, timeout_seconds=60)
    cb.record_failure()
    cb.record_failure()
    assert cb.is_open() is True


def test_circuit_half_open_after_timeout():
    """After timeout elapses, an open circuit becomes half-open and is_open() returns False."""
    from services.opensky_client import CircuitBreaker
    cb = CircuitBreaker("test", failure_threshold=2, timeout_seconds=60)
    cb.record_failure()
    cb.record_failure()
    assert cb.is_open() is True
    # Simulate timeout elapsed by patching time.time
    with mock.patch("time.time", return_value=cb._opened_at + 61):
        assert cb.is_open() is False
        assert cb._state == "half-open"


def test_record_success_resets_failure_count():
    """record_success() clears failures and closes the circuit."""
    from services.opensky_client import CircuitBreaker
    cb = CircuitBreaker("test", failure_threshold=3, timeout_seconds=60)
    cb.record_failure()
    cb.record_failure()
    cb.record_success()
    assert cb._failures == 0
    assert cb._state == "closed"
    assert cb._opened_at is None
