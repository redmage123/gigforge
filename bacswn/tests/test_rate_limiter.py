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
    """Expired hits are dropped, the new request is counted, and idle IPs are swept away.

    The limiter used to delete an expired bucket and let that request through uncounted.
    """
    limiter = _make_limiter(max_requests=100, window_seconds=60)
    stale_time = time.time() - 120  # well outside the 60s window
    limiter._buckets["10.0.0.1"] = [stale_time]
    limiter._buckets["10.0.0.9"] = [stale_time]  # an idle IP that never returns

    await limiter.dispatch(_make_request(ip="10.0.0.1"), _dummy_call_next)

    hits = limiter._buckets["10.0.0.1"]
    assert len(hits) == 1 and hits[0] > stale_time, "the returning request must be counted"
    assert "10.0.0.9" not in limiter._buckets, "idle IPs are swept to bound memory"


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
