"""Tests for RateLimiter middleware — S2-003."""

import time
import pytest
import unittest.mock as mock
from unittest.mock import AsyncMock, MagicMock


def _make_request(path: str = "/api/test", ip: str = "1.2.3.4"):
    """Build a minimal mock request."""
    req = MagicMock()
    req.url.path = path
    req.client = MagicMock()
    req.client.host = ip
    return req


async def _dummy_call_next(request):
    resp = MagicMock()
    resp.status_code = 200
    return resp


def _make_limiter(max_requests: int = 100, window_seconds: int = 60):
    from middleware.rate_limiter import RateLimiter
    # RateLimiter wraps an ASGI app; pass a no-op
    app = AsyncMock()
    return RateLimiter(app, max_requests=max_requests, window_seconds=window_seconds)


# ── Tests ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_stale_ip_removed_from_buckets():
    """After a window expires, an IP with no recent hits is removed from _buckets."""
    limiter = _make_limiter(max_requests=100, window_seconds=60)
    old_ip = "10.0.0.1"
    new_ip = "10.0.0.2"

    # Plant a stale entry for old_ip (timestamp > 60s ago)
    stale_time = time.time() - 120  # well outside the 60s window
    limiter._buckets[old_ip] = [stale_time]

    # Trigger a request from new_ip — this causes the limiter to process new_ip's bucket,
    # but the old_ip bucket only gets cleaned when it's visited.
    # To exercise cleanup we need to send a request from old_ip so its bucket is evaluated.
    req_old = _make_request(ip=old_ip)
    await limiter.dispatch(req_old, _dummy_call_next)

    # After dispatch, old_ip's bucket should be empty and key should be deleted
    assert old_ip not in limiter._buckets, (
        f"Stale IP {old_ip} should have been removed but found: {limiter._buckets.get(old_ip)}"
    )


@pytest.mark.asyncio
async def test_active_ip_not_removed():
    """An IP with recent hits stays in _buckets."""
    limiter = _make_limiter(max_requests=100, window_seconds=60)
    ip = "10.0.0.3"

    req = _make_request(ip=ip)
    await limiter.dispatch(req, _dummy_call_next)

    assert ip in limiter._buckets, "Active IP should remain in _buckets"
    assert len(limiter._buckets[ip]) >= 1


@pytest.mark.asyncio
async def test_rate_limit_enforced():
    """After max_requests in one window, the 101st request returns 429."""
    from starlette.responses import JSONResponse
    limiter = _make_limiter(max_requests=5, window_seconds=60)
    ip = "10.0.0.5"

    # Make max_requests successful requests
    for _ in range(5):
        req = _make_request(ip=ip)
        resp = await limiter.dispatch(req, _dummy_call_next)
        assert resp.status_code != 429

    # The 6th should be rate-limited
    req = _make_request(ip=ip)
    resp = await limiter.dispatch(req, _dummy_call_next)
    assert resp.status_code == 429
