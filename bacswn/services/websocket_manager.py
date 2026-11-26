"""BACSWN — WebSocket connection manager for live feeds.

What: ``WebSocketManager`` keeps the open sockets per channel (``flights``, ``weather``,
``agents``, ``alerts``, ``sigmets``) and broadcasts JSON messages to them; ``ws_manager``
is the shared instance.

Why: producers (broadcast loops, agents, the simulation) should not track sockets
themselves; they publish to a channel name and the manager fans the message out.

How: ``connect`` accepts the socket and adds it to its channel list. ``broadcast``
serialises once, sends to every socket and drops any whose send fails (a closed
client). Nothing is sent while the demo is paused so every screen freezes together.
"""

import json
import logging
from fastapi import WebSocket

from services import demo_pause

logger = logging.getLogger("bacswn.ws")


class WebSocketManager:
    """Manages WebSocket connections and broadcasts."""

    def __init__(self):
        """Start with no connections."""
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, channel: str = "general"):
        """Accept ``websocket`` and subscribe it to ``channel``."""
        await websocket.accept()
        self._connections.setdefault(channel, []).append(websocket)
        logger.info(f"WS connected to {channel} ({len(self._connections[channel])} clients)")

    def disconnect(self, websocket: WebSocket, channel: str = "general"):
        """Unsubscribe ``websocket`` from ``channel`` (no-op if it is not subscribed)."""
        conns = self._connections.get(channel, [])
        if websocket in conns:
            conns.remove(websocket)

    async def broadcast(self, channel: str, data: dict):
        """Send data to all connected clients on a channel (nothing while the demo is paused)."""
        if demo_pause.is_paused():
            return
        conns = self._connections.get(channel, [])
        dead = []
        message = json.dumps(data)
        for ws in conns:
            try:
                await ws.send_text(message)
            except Exception:  # any send failure means the client is gone; drop it below
                dead.append(ws)
        for ws in dead:
            conns.remove(ws)

    @property
    def connection_count(self) -> dict[str, int]:
        """Number of open sockets per channel, omitting empty channels."""
        return {ch: len(conns) for ch, conns in self._connections.items() if conns}


ws_manager = WebSocketManager()
