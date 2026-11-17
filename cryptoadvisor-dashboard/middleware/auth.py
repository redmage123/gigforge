"""Authentication middleware — protects /api/* routes except /api/auth/login."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from services.auth import verify_session_token

# API paths that don't require authentication
PUBLIC_PATHS = (
    "/api/auth/login",
    "/api/auth/register",
    "/api/sso/providers",
    "/api/sso/firm-login",
    "/api/sso/oidc/",
    "/api/sso/saml/",
    "/api/firms/invite-info",
    "/api/share/view/",
    "/health",
    "/api/health",
    "/static/",
    "/favicon.ico",
)


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path

        # Allow public paths through
        if any(path.startswith(p) for p in PUBLIC_PATHS):
            return await call_next(request)

        # Only protect /api/* routes — let everything else through (React SPA)
        if not path.startswith("/api/"):
            return await call_next(request)

        # Check for JWT in cookie or Authorization header
        token = request.cookies.get("access_token")
        if not token:
            # Also check Authorization: Bearer <token> header
            auth_header = request.headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]

        if not token:
            return JSONResponse(
                status_code=401,
                content={"error": "Authentication required"},
            )

        payload = verify_session_token(token)
        if not payload:
            return JSONResponse(
                status_code=401,
                content={"error": "Your session has ended. Please sign in again."},
            )

        # Attach user info to request state
        request.state.user = payload
        return await call_next(request)
