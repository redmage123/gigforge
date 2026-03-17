"""WebSocket price streaming endpoint."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from services.websocket_prices import price_manager

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    price_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep alive
    except WebSocketDisconnect:
        price_manager.disconnect(websocket)
