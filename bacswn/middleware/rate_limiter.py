"""BACSWN — Simple rate limiter middleware."""

import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


class RateLimiter(BaseHTTPMiddleware):
    def __init__(self, app, max_requests: int = 100, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window = window_seconds
        self._buckets: dict[str, list[float]] = {}

    async def dispatch(self, request, call_next):
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        hits = self._buckets.get(client_ip, [])
        hits = [t for t in hits if now - t < self.window]

        if len(hits) >= self.max_requests:
            return JSONResponse(status_code=429, content={"error": "Rate limit exceeded"})

        hits.append(now)
        self._buckets[client_ip] = hits
        return await call_next(request)
