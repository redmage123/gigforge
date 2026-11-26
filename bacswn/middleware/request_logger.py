"""BACSWN — request logging middleware.

What: logs ``METHOD path → status (N ms)`` for every ``/api/*`` request.

Why: a lightweight access log with timings for operating and debugging the demo,
without logging the many static-asset and SPA requests.

How: a Starlette ``BaseHTTPMiddleware`` that times ``call_next`` and logs to the
``bacswn.http`` logger.
"""

import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("bacswn.http")


class RequestLogger(BaseHTTPMiddleware):
    """Log method, path, status and duration of API requests."""

    async def dispatch(self, request, call_next):
        """Time the downstream handler and log the result for ``/api/*`` paths."""
        start = time.time()
        response = await call_next(request)
        elapsed = (time.time() - start) * 1000
        if request.url.path.startswith("/api/"):
            logger.info(f"{request.method} {request.url.path} → {response.status_code} ({elapsed:.0f}ms)")
        return response
