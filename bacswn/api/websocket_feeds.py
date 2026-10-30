"""BACSWN — WebSocket feeds for real-time data (token-authenticated)."""

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from websockets.exceptions import ConnectionClosed
from services.carbon_exchange import venue
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


@router.websocket("/sigmets")
async def ws_sigmets(websocket: WebSocket, token: str | None = Query(default=None)):
    """WebSocket feed for live SIGMET updates (including simulation-generated)."""
    if not await _authenticate_ws(websocket, token):
        return
    await ws_manager.connect(websocket, "sigmets")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, "sigmets")


TRADING_PUSH_SECONDS = 0.5


@router.websocket("/trading")
async def ws_trading(websocket: WebSocket, token: str | None = Query(default=None)):
    """Per-user trading feed: market data plus that user's account, every 500 ms.

    The client may send {"focus": "<symbol>"} to choose which contract's full
    depth and time & sales are included (quotes always cover every contract).
    """
    payload = await _authenticate_ws(websocket, token)
    if not payload:
        return
    await websocket.accept()
    owner = payload["sub"]
    state = {"focus": None}

    async def _reader():
        while True:
            try:
                msg = json.loads(await websocket.receive_text())
            except (ValueError, TypeError):
                continue
            if isinstance(msg, dict) and msg.get("focus") in venue.instruments:
                state["focus"] = msg["focus"]

    reader = asyncio.create_task(_reader())
    try:
        while not reader.done():
            await websocket.send_json({
                "type": "trading_update",
                "market": venue.market_snapshot(focus=state["focus"] or next(iter(venue.instruments))),
                "account": venue.account(owner),
            })
            await asyncio.sleep(TRADING_PUSH_SECONDS)
    except (WebSocketDisconnect, ConnectionClosed, RuntimeError):
        pass  # client went away mid-send
    finally:
        reader.cancel()
