"""Rate-limiting ASGI middleware — in-memory sliding-window counter per IP."""

import json
import time
from collections import defaultdict

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from middleware.client_ip import client_ip


class RateLimiter:
    """ASGI middleware that enforces per-IP request rate limits.

    Parameters
    ----------
    app : ASGIApp
        The wrapped ASGI application.
    default_rpm : int
        Default requests-per-minute for API paths (default 240; one page view makes 6-10 calls).
    path_limits : dict[str, int] | None
        Optional per-path-prefix overrides, e.g. {"/api/chat": 10}.
    """

    def __init__(
        self,
        app: ASGIApp,
        default_rpm: int = 240,
        path_limits: dict[str, int] | None = None,
    ) -> None:
        self.app = app
        self.default_rpm = default_rpm
        self.path_limits: dict[str, int] = path_limits or {
            "/api/chat": 10,
        }
        # {ip: [timestamps]} — auto-cleaned on access
        self._hits: dict[str, list[float]] = defaultdict(list)

    def _get_limit(self, path: str) -> tuple[str, int] | None:
        """Return (bucket, RPM limit) for a path, or None if not rate-limited."""
        # Skip static files entirely
        if path.startswith("/static/") or path.startswith("/favicon"):
            return None

        # Only rate-limit API routes
        if not path.startswith("/api/"):
            return None

        # Check specific path prefixes (longest match first)
        for prefix, limit in sorted(
            self.path_limits.items(), key=lambda kv: -len(kv[0])
        ):
            if path.startswith(prefix):
                return prefix, limit

        return "default", self.default_rpm

    def _is_allowed(self, ip: str, limit: int) -> tuple[bool, int]:
        """Check whether *ip* is under *limit* RPM.

        Returns (allowed, retry_after_seconds).
        """
        now = time.time()
        window_start = now - 60.0

        # Prune old timestamps
        timestamps = [t for t in self._hits[ip] if t > window_start]
        self._hits[ip] = timestamps

        if len(timestamps) >= limit:
            # Earliest timestamp in window determines when a slot opens
            retry_after = int(timestamps[0] - window_start) + 1
            return False, max(retry_after, 1)

        timestamps.append(now)
        return True, 0

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "/")
        rule = self._get_limit(path)

        if rule is None:
            await self.app(scope, receive, send)
            return
        bucket, limit = rule

        # Real client behind nginx/Cloudflare (otherwise every user shares the proxy's address)
        ip = client_ip(scope)

        # Separate counters per bucket: page loads must not use up the chat allowance
        allowed, retry_after = self._is_allowed(f"{ip}|{bucket}", limit)
        if not allowed:
            response = JSONResponse(
                status_code=429,
                content={
                    "error": "Rate limit exceeded",
                    "retry_after": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)
