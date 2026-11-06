"""CSRF protection middleware — validates tokens for state-changing API requests."""

import secrets

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from middleware.client_ip import is_https


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        # Skip non-API routes (React SPA)
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        # Skip safe methods
        if request.method in ("GET", "HEAD", "OPTIONS"):
            response = await call_next(request)
            # Set CSRF token cookie on GET requests
            if not request.cookies.get("csrf_token"):
                token = secrets.token_hex(32)
                response.set_cookie("csrf_token", token, httponly=False, samesite="lax", secure=is_https(request.scope))
            return response

        # Skip public endpoints (login, register)
        public = ("/api/auth/login", "/api/auth/register", "/api/health")
        if any(request.url.path.startswith(p) for p in public):
            response = await call_next(request)
            # Issue the token with login/signup so the first POST after it (e.g. the setup
            # wizard) already has one; otherwise it races the first GET that would set it.
            if not request.cookies.get("csrf_token"):
                response.set_cookie("csrf_token", secrets.token_hex(32), httponly=False, samesite="lax",
                                    secure=is_https(request.scope))
            return response

        # Validate CSRF token for state-changing requests
        cookie_token = request.cookies.get("csrf_token", "")
        header_token = request.headers.get("x-csrf-token", "")

        if not cookie_token or not header_token or cookie_token != header_token:
            return JSONResponse(status_code=403, content={"error": "CSRF token missing or invalid"})

        return await call_next(request)
