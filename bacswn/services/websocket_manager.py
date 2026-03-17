"""BACSWN — WebSocket connection manager for live feeds."""

import json
import logging
from fastapi import WebSocket

logger = logging.getLogger("bacswn.ws")


class WebSocketManager:
    """Manages WebSocket connections and broadcasts."""

    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, channel: str = "general"):
        await websocket.accept()
        self._connections.setdefault(channel, []).append(websocket)
        logger.info(f"WS connected to {channel} ({len(self._connections[channel])} clients)")

    def disconnect(self, websocket: WebSocket, channel: str = "general"):
        conns = self._connections.get(channel, [])
        if websocket in conns:
            conns.remove(websocket)

    async def broadcast(self, channel: str, data: dict):
        """Send data to all connected clients on a channel."""
        conns = self._connections.get(channel, [])
        dead = []
        message = json.dumps(data)
        for ws in conns:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            conns.remove(ws)

    @property
    def connection_count(self) -> dict[str, int]:
        return {ch: len(conns) for ch, conns in self._connections.items() if conns}


ws_manager = WebSocketManager()
