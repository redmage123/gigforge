# ADR-0004 — WebSocket Authentication Strategy

**Status:** Accepted
**Date:** 2026-03-15
**Deciders:** gigforge-pm, gigforge-engineer
**Story:** Story 3

## Context

`middleware/auth.py` contains an explicit bypass:

```python
# Allow WebSocket upgrades (they handle auth separately)
if request.headers.get("upgrade", "").lower() == "websocket":
    return await call_next(request)
```

However, the WebSocket endpoints in `api/websocket_feeds.py` do not handle auth separately. The result is that all WebSocket connections — live weather, flight tracking, emergency alerts — are entirely unauthenticated. Any client can connect and receive real-time operational data.

WebSocket authentication cannot use cookies reliably (browser WS API does not send cookies on the initial upgrade in some configurations). The standard pattern is to pass a token as a query parameter on the upgrade URL, or as the first message after connection.

## Decision

Use **query-parameter JWT authentication** on WebSocket upgrade:

1. Clients connect with `ws://host/ws/feeds?token=<jwt>`
2. The `AuthMiddleware` is updated: when the request is a WebSocket upgrade, it reads `?token=` from the query string instead of headers/cookies
3. If the token is absent or invalid, the middleware returns HTTP 401 before the WebSocket upgrade completes
4. The `request.state.user` is populated the same way as for HTTP requests
5. WebSocket endpoint handlers can then access `request.state.user` for role-based access

**Why query param, not first-message auth:**
- First-message auth creates a window where the connection is open but unauthenticated
- Starlette's BaseHTTPMiddleware intercepts before the upgrade, so query-param validation is cleaner
- Query params are stripped from server logs in production (configure `RequestLogger` to redact `token` param)

**Token expiry during an open WS connection:**
- Tokens are validated on connect only (standard practice for WebSockets)
- Server-side heartbeat every 60s; if the token would have expired, the connection is closed with code 4001
- This is deferred to Sprint 2; Sprint 1 establishes the auth-on-connect gate

## Consequences

**Easier:**
- WebSocket connections are authenticated on the same infrastructure as HTTP
- No separate WS session management needed
- Existing JWT tokens work without changes

**Harder:**
- Clients must include `?token=` in WS URL — requires frontend update (out of scope Sprint 1; note in handoff)
- Token in URL appears in server access logs — RequestLogger must redact it

## Alternatives Considered

**A. Keep WS unauthenticated for Sprint 1, add auth in Sprint 2.**
Rejected: The engineer review classified this as P0 (blocks external access). Cannot ship with unauthenticated emergency feeds.

**B. Custom subprotocol for auth (pass token in `Sec-WebSocket-Protocol` header).**
Rejected: Non-standard, poor browser support, complicates client implementation.

**C. Shared secret between backend and a reverse-proxy (Nginx auth_request).**
Deferred to Sprint 2 as an optional hardening layer; Nginx config is out of scope for the application layer.
