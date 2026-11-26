"""BACSWN — simple per-IP rate limiter middleware.

What: answers 429 ``{"error": "Rate limit exceeded"}`` once a client IP has made
``max_requests`` API calls within ``window_seconds``.

Why: the demo login is public, so the API needs a basic guard against scripted
floods without depending on the reverse proxy.

How: a sliding window of request timestamps per IP, kept in memory (per process,
lost on restart). Only ``/api/*`` is counted, and the demo-pause poll is exempt
because every open screen calls it frequently.
"""

import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


class RateLimiter(BaseHTTPMiddleware):
    """Sliding-window request limit per client IP for ``/api/*``."""

    def __init__(self, app, max_requests: int = 100, window_seconds: int = 60):
        """Wrap ``app``, allowing ``max_requests`` per IP in any ``window_seconds`` span."""
        super().__init__(app)
        self.max_requests = max_requests
        self.window = window_seconds
        self._buckets: dict[str, list[float]] = {}
        self._last_sweep = 0.0

    async def dispatch(self, request, call_next):
        """Count the request against the caller's IP and answer 429 when over the limit."""
        # The demo-pause poll is tiny and must keep working, so it is not counted.
        if not request.url.path.startswith("/api/") or request.url.path == "/api/demo/pause":
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        hits = self._buckets.get(client_ip, [])
        hits = [t for t in hits if now - t < self.window]

        if len(hits) >= self.max_requests:
            self._buckets[client_ip] = hits
            return JSONResponse(status_code=429, content={"error": "Rate limit exceeded"})

        # Every counted request is recorded (an expired window used to let one through uncounted).
        hits.append(now)
        self._buckets[client_ip] = hits
        self._evict_stale(now)
        return await call_next(request)

    def _evict_stale(self, now: float) -> None:
        """Drop IPs with no requests inside the window, at most once per window, to bound memory."""
        if now - self._last_sweep < self.window:
            return
        self._last_sweep = now
        for ip in [ip for ip, hits in self._buckets.items() if not hits or now - hits[-1] >= self.window]:
            del self._buckets[ip]
