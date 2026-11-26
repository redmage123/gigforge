"""BACSWN — demo pause API.

What: ``GET /pause`` and ``POST /pause`` read and set the shared demo pause.

Why: a presenter must be able to freeze every screen at once to explain a step.

How: thin wrapper over ``services.demo_pause``; the pausing user's name (from the JWT
claims on ``request.state.user``) is recorded for the banner. The GET is exempt from
the rate limiter because every open screen polls it.
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel

from services import demo_pause

router = APIRouter()


class PauseRequest(BaseModel):
    """Desired pause state."""

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
