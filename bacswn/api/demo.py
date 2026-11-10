"""BACSWN — demo pause API (see services/demo_pause.py)."""

from fastapi import APIRouter, Request
from pydantic import BaseModel

from services import demo_pause

router = APIRouter()


class PauseRequest(BaseModel):
    paused: bool


@router.get("/pause")
async def get_pause():
    """Whether the demo is paused, and by whom since when."""
    return demo_pause.status()


@router.post("/pause")
async def set_pause(req: PauseRequest, request: Request):
    """Pause or resume the whole demo for every viewer."""
    if not req.paused:
        return demo_pause.resume()
    user = getattr(request.state, "user", None) or {}
    return demo_pause.pause(by=user.get("sub") if isinstance(user, dict) else None)
