"""Security headers on every response (HSTS, CSP, framing, sniffing, referrer, permissions).

The Content Security Policy lists every origin the app legitimately uses: the Plaid Link widget,
blockchain RPC endpoints the wallet pages call, and HTTPS images (coin logos). CSP_MODE=report sends
it as Content-Security-Policy-Report-Only (violations appear in the browser console) for testing
changes; the default enforces it.
"""

import os

from starlette.middleware.base import BaseHTTPMiddleware

RPC = ("https://polygon-rpc.com https://mainnet.optimism.io https://mainnet.base.org https://cloudflare-eth.com "
       "https://bsc-dataseed.binance.org https://arb1.arbitrum.io https://api.avax.network")
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' https://cdn.plaid.com",
    "style-src 'self' 'unsafe-inline'",          # React inline style attributes
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    f"connect-src 'self' https://*.plaid.com https://api.telegram.org {RPC}",
    "frame-src https://cdn.plaid.com https://*.plaid.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])
STATIC = {
    "Strict-Transport-Security": "max-age=31536000",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        for k, v in STATIC.items():
            response.headers.setdefault(k, v)
        csp_header = "Content-Security-Policy-Report-Only" if os.getenv("CSP_MODE") == "report" else "Content-Security-Policy"
        response.headers.setdefault(csp_header, CSP)
        # API responses carry personal financial data: never store them in shared or browser caches
        if request.url.path.startswith("/api/") and "cache-control" not in response.headers:
            response.headers["Cache-Control"] = "no-store"
        return response
