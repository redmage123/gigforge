"""BACSWN — JWT authentication middleware."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from services.auth import decode_token

PUBLIC_PATHS = (
    "/api/auth/login",
    "/api/auth/register",
    "/health",
    "/static/",
    "/favicon.ico",
    "/docs",
    "/openapi.json",
    "/redoc",
)


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
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
