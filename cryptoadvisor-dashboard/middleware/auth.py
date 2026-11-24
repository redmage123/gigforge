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
    "/api/whatsapp/webhook",  # Meta's servers; every call is checked against the app secret signature
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

        # A member of a firm that requires two-factor authentication, without it set up: only the
        # enrollment endpoints until they enroll (services.mfa). Refuses when the check fails.
        from services import mfa

        try:
            enroll = mfa.enrollment_required(payload)
        except Exception as exc:  # noqa: BLE001
            print(f"[auth] two-factor policy check failed: {exc}")
            return JSONResponse(status_code=503, content={"error": "Sign-in checks are unavailable. Try again shortly."})
        if enroll and not mfa.path_allowed_during_enrollment(path):
            return JSONResponse(status_code=403, content={
                "error": "Your firm requires two-factor authentication. Set it up to continue.",
                "mfa_enrollment_required": True})
        return await call_next(request)
