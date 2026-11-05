"""The real client IP behind nginx and Cloudflare.

Requests that reach the app from a private address came through our nginx (docker bridge or
loopback). For those, the client is Cloudflare's CF-Connecting-IP, else nginx's X-Real-IP, else the
first X-Forwarded-For hop. Requests straight from a public address use that address: forwarded
headers from the internet are never trusted.
"""

import ipaddress


def _is_private(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return False
    return ip.is_private or ip.is_loopback


def client_ip(scope: dict) -> str:
    peer = (scope.get("client") or ("unknown", 0))[0] or "unknown"
    if not _is_private(peer):
        return peer
    headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers") or []}
    for name in ("cf-connecting-ip", "x-real-ip"):
        value = headers.get(name, "").strip()
        if value:
            return value
    xff = headers.get("x-forwarded-for", "")
    return xff.split(",")[0].strip() or peer
