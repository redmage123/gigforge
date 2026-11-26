"""BACSWN — WebSocket feeds for real-time data (token-authenticated).

What: ``/ws/flights``, ``/ws/weather``, ``/ws/agents``, ``/ws/alerts`` and ``/ws/sigmets``,
each subscribing the client to the ``ws_manager`` channel of the same name.

Why: browsers cannot send an Authorization header on a WebSocket upgrade, so the auth
middleware lets upgrades through and these endpoints authenticate them themselves.

How: the JWT arrives as ``?token=``; an invalid or missing token closes the socket with
code 4001. A valid client is subscribed and kept open until it disconnects; data is
pushed by the broadcasters, and anything the client sends is ignored.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from services.auth import decode_token
from services.websocket_manager import ws_manager

router = APIRouter()

WS_AUTH_FAIL_CODE = 4001


async def _authenticate_ws(websocket: WebSocket, token: str | None) -> dict | None:
    """Validate JWT token on WebSocket connect. Reject with 4001 if invalid.

    Returns the token payload (truthy) on success, None on failure.
    """
    if not token:
        await websocket.close(code=WS_AUTH_FAIL_CODE, reason="Missing authentication token")
        return None
    payload = decode_token(token)
    if not payload:
        await websocket.close(code=WS_AUTH_FAIL_CODE, reason="Invalid or expired token")
        return None
    return payload


async def _serve_feed(websocket: WebSocket, token: str | None, channel: str) -> None:
    """Authenticate, subscribe to ``channel`` and hold the socket open until the client leaves."""
    if not await _authenticate_ws(websocket, token):
        return
    await ws_manager.connect(websocket, channel)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, channel)


@router.websocket("/flights")
async def ws_flights(websocket: WebSocket, token: str | None = Query(default=None)):
    """WebSocket feed for live flight updates."""
    await _serve_feed(websocket, token, "flights")


@router.websocket("/weather")
async def ws_weather(websocket: WebSocket, token: str | None = Query(default=None)):
    """WebSocket feed for weather updates."""
    await _serve_feed(websocket, token, "weather")


@router.websocket("/agents")
async def ws_agents(websocket: WebSocket, token: str | None = Query(default=None)):
    """WebSocket feed for agent activity."""
    await _serve_feed(websocket, token, "agents")


@router.websocket("/alerts")
async def ws_alerts(websocket: WebSocket, token: str | None = Query(default=None)):
    """WebSocket feed for emergency alerts."""
    await _serve_feed(websocket, token, "alerts")


@router.websocket("/sigmets")
async def ws_sigmets(websocket: WebSocket, token: str | None = Query(default=None)):
    """WebSocket feed for live SIGMET updates (including simulation-generated)."""
    await _serve_feed(websocket, token, "sigmets")
