"""BACSWN — Request logging middleware."""

import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("bacswn.http")


class RequestLogger(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.time()
        response = await call_next(request)
        elapsed = (time.time() - start) * 1000
        if request.url.path.startswith("/api/"):
            logger.info(f"{request.method} {request.url.path} → {response.status_code} ({elapsed:.0f}ms)")
        return response
