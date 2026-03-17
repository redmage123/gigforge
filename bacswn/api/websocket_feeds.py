"""BACSWN — WebSocket feeds for real-time data (token-authenticated)."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from services.auth import decode_token
from services.websocket_manager import ws_manager

router = APIRouter()

WS_AUTH_FAIL_CODE = 4001


async def _authenticate_ws(websocket: WebSocket, token: str | None) -> bool:
    """Validate JWT token on WebSocket connect. Reject with 4001 if invalid."""
    if not token:
        await websocket.close(code=WS_AUTH_FAIL_CODE, reason="Missing authentication token")
        return False
    payload = decode_token(token)
    if not payload:
        await websocket.close(code=WS_AUTH_FAIL_CODE, reason="Invalid or expired token")
        return False
    return True


@router.websocket("/flights")
async def ws_flights(websocket: WebSocket, token: str | None = Query(default=None)):
    """WebSocket feed for live flight updates."""
    if not await _authenticate_ws(websocket, token):
        return
    await ws_manager.connect(websocket, "flights")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, "flights")


@router.websocket("/weather")
async def ws_weather(websocket: WebSocket, token: str | None = Query(default=None)):
    """WebSocket feed for weather updates."""
    if not await _authenticate_ws(websocket, token):
        return
    await ws_manager.connect(websocket, "weather")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, "weather")


@router.websocket("/agents")
async def ws_agents(websocket: WebSocket, token: str | None = Query(default=None)):
    """WebSocket feed for agent activity."""
    if not await _authenticate_ws(websocket, token):
        return
    await ws_manager.connect(websocket, "agents")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, "agents")


@router.websocket("/alerts")
async def ws_alerts(websocket: WebSocket, token: str | None = Query(default=None)):
    """WebSocket feed for emergency alerts."""
    if not await _authenticate_ws(websocket, token):
        return
    await ws_manager.connect(websocket, "alerts")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, "alerts")
