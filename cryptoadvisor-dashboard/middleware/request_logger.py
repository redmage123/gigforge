"""Structured request logging middleware."""

import json
import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("cryptoadvisor.access")


class RequestLogger(BaseHTTPMiddleware):
    """Log every non-static request as a structured JSON line."""

    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.time()
        response = await call_next(request)
        duration_ms = round((time.time() - start) * 1000, 2)

        # Skip static / asset paths to reduce noise
        if request.url.path.startswith("/static") or request.url.path.startswith(
            "/assets"
        ):
            return response

        user = getattr(request.state, "user", {})
        logger.info(
            json.dumps(
                {
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "duration_ms": duration_ms,
                    "user": user.get("sub", "anonymous") if isinstance(user, dict) else "anonymous",
                    "ip": request.client.host if request.client else "unknown",
                }
            )
        )
        return response
