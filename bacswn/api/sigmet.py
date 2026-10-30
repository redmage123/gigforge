"""BACSWN — SIGMET generation API router."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel
from services.sigmet_generator import generate_sigmet, HAZARD_TYPES
from services.database import db_insert, db_select

router = APIRouter()

# ICAO-defined hazard types accepted by the SIGMET endpoint (S1-002)
ICAO_HAZARD_TYPES = Literal[
    "TS", "TURB", "ICE", "MTW", "DS", "SS", "VA", "TC", "CB", "LLWS"
]


class SigmetRequest(BaseModel):
    hazard_type: ICAO_HAZARD_TYPES = "TS"
    description: str = "Embedded thunderstorms observed"
    severity: str = "moderate"
    fl_base: int = 0
    fl_top: int = 450
    movement: str = "STNR"
    valid_hours: int = 6


@router.post("/generate")
async def generate_sigmet_endpoint(req: SigmetRequest):
    """Generate an ICAO-formatted SIGMET advisory."""
    sigmet = generate_sigmet(
        hazard_type=req.hazard_type,
        description=req.description,
        severity=req.severity,
        fl_base=req.fl_base,
        fl_top=req.fl_top,
        movement=req.movement,
        valid_hours=req.valid_hours,
    )

    # Save to database
    advisory_id = await db_insert("advisories", {
        "advisory_type": sigmet["advisory_type"],
        "hazard_type": sigmet["hazard_type"],
        "raw_text": sigmet["raw_text"],
        "severity": sigmet["severity"],
        "area": sigmet["area"],
        "valid_from": sigmet["valid_from"],
        "valid_to": sigmet["valid_to"],
        "generated_by": sigmet["generated_by"],
        "status": sigmet["status"],
    })

    sigmet["id"] = advisory_id

    # Broadcast to CommandCenter map via WebSocket
    from services.websocket_manager import ws_manager
    await ws_manager.broadcast("sigmets", {
        "type": "new_sigmet",
        "sigmet": {
            "id": advisory_id,
            "hazard_type": sigmet["hazard_type"],
            "hazard_name": sigmet["hazard_name"],
            "severity": sigmet["severity"],
            "severity_code": sigmet["severity_code"],
            "raw_text": sigmet["raw_text"],
            "area": sigmet["area"],
            "fl_base": sigmet["fl_base"],
            "fl_top": sigmet["fl_top"],
            "movement": sigmet["movement"],
            "valid_from": sigmet["valid_from"],
            "valid_to": sigmet["valid_to"],
            "description": sigmet["description"],
            "source": "simulation",
        }
    })

    return sigmet


@router.get("/hazard-types")
async def get_hazard_types():
    """Get available SIGMET hazard types."""
    return {"hazard_types": HAZARD_TYPES}


@router.get("/history")
async def get_sigmet_history(limit: int = 20):
    """Get previously generated SIGMETs."""
    advisories = await db_select("advisories", order_by="created_at DESC", limit=limit)
    return {"advisories": advisories, "count": len(advisories)}
