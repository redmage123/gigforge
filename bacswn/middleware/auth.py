"""BACSWN — JWT authentication middleware.

What: rejects unauthenticated requests to ``/api/*`` and ``/ws/*`` with 401 and puts
the verified token claims on ``request.state.user`` for route handlers.

Why: one gate in front of every API route, so no handler can forget to check auth.

How: public paths (login, health, docs, static assets) and non-API paths (the React
SPA) pass straight through. WebSocket upgrades are passed on too, because browsers
cannot set headers on them; ``api/websocket_feeds.py`` checks their ``?token=``.
Otherwise the token comes from the ``access_token`` cookie or a ``Bearer`` header.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from services.auth import decode_token

PUBLIC_PATHS = (
    "/api/auth/login",
    "/api/live/",  # audience phones at a talk: no account (see api/live_audience.py)
    "/api/hurricane/coastal-replay",  # public NOAA track over illustrative projects (phone companion)
    "/health",
    "/static/",
    "/favicon.ico",
    "/docs",
    "/openapi.json",
    "/redoc",
)


class AuthMiddleware(BaseHTTPMiddleware):
    """Require a valid BACSWN JWT on API and WebSocket paths."""

    async def dispatch(self, request, call_next):
        """Let public, SPA and WebSocket requests through; otherwise verify the JWT or answer 401."""
        path = request.url.path

        # Allow public paths
        if any(path.startswith(p) for p in PUBLIC_PATHS):
            return await call_next(request)

        # Only protect /api/* and /ws/* — let React SPA routes through
        if not path.startswith("/api/") and not path.startswith("/ws/"):
            return await call_next(request)

        # WebSocket upgrades: auth handled at the endpoint level
        if request.headers.get("upgrade", "").lower() == "websocket":
            return await call_next(request)

        # Check JWT from cookie or Authorization header
        token = request.cookies.get("access_token")
        if not token:
            auth_header = request.headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]

        if not token:
            return JSONResponse(status_code=401, content={"error": "Authentication required"})

        payload = decode_token(token)
        if not payload:
            return JSONResponse(status_code=401, content={"error": "Invalid or expired token"})

        request.state.user = payload
        return await call_next(request)
