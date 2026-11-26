"""BACSWN — Distributed Mesh Network API router (``/api/mesh``).

What: HTTP endpoints for the mesh simulation — status and per-station detail, the
airspace picture, presenter controls (faults, storms, scenarios, chosen verdicts,
guided stories) and an AI question-answering helper for the stories.

Why: the frontend's mesh view and presenter panel drive the shared simulation
in services/mesh_network.py; this module is the only HTTP surface for it.

How: each handler first catches the simulation up to wall-clock time
(``mesh.advance()``) and then delegates. The simulation reports bad presenter
input as an ``{"error": msg}`` dict; ``_result`` raises that as a
``BacswnValidationError`` (HTTP 400) and unknown stations raise
``BacswnNotFoundError`` (404), both rendered by the global handler in main.py.
"""

import logging

from fastapi import APIRouter, Request
from pydantic import BaseModel

from services.errors import BacswnNotFoundError, BacswnValidationError

from services.mesh_network import mesh, get_mesh_status, get_node_detail, trigger_consensus

router = APIRouter()
logger = logging.getLogger("bacswn.mesh")


class FaultRequest(BaseModel):
    """Body of POST /fault: the fault kind and its target."""

    kind: str                     # node_down|node_up|link_down|link_up|sensor_fault|corrupt_precog|comms_down|comms_up|clear
    station: str | None = None
    peer: str | None = None
    precog: str | None = None     # TEMPO|VISTA|LEXIS
    sensor: str | None = None     # visibility|wind|pressure|rain
    channel: str | None = None    # wired|vhf|cellular|satellite (comms_down / comms_up)


class PresentRequest(BaseModel):
    """Body of POST /present: the verdict and voting outcome a station should show."""

    station: str
    call: str                     # CLEAR|SHOWERS|IFR|TSRA|SQUALL
    outcome: str                  # agree|dissent|split|peers_confirm|peers_reject
    model: str | None = None      # dissenting model (TEMPO|VISTA|LEXIS)


class StormRequest(BaseModel):
    """Body of POST /storm: storm kind and optional position, heading and speed."""

    kind: str = "squall"          # convective|squall|fog
    lat: float | None = None
    lon: float | None = None
    heading: float | None = None
    speed_kt: float | None = None


def _result(r: dict) -> dict:
    """Return a simulation result, or raise its ``{"error": msg}`` as an HTTP 400.

    Raises:
        BacswnValidationError: the simulation rejected the request.
    """
    if "error" in r:
        raise BacswnValidationError(r["error"])
    return r


@router.get("/status")
async def mesh_status():
    """Full mesh state — nodes with their 3-model ensembles, links, storms, traffic, consensus."""
    return get_mesh_status()


@router.get("/node/{station_id}")
async def node_detail(station_id: str):
    """Detailed info for a single mesh node."""
    node = get_node_detail(station_id.upper())
    if not node:
        raise BacswnNotFoundError("Node not found")
    return node


@router.get("/airspace")
async def mesh_airspace():
    """Mesh weather hazards and the aircraft predicted to fly into them in the next 30 min."""
    from services.mesh_airspace import airspace
    from services.opensky_client import fetch_flights
    mesh.advance()
    flights = await fetch_flights()
    result = airspace(mesh, flights)
    try:
        from services import weather_benefit
        await weather_benefit.record(result, flights)
    except Exception as e:  # deliberately broad: the ledger must never break the live picture; logged
        logger.error(f"Weather-benefit ledger error: {e}")
    return result


@router.get("/node/{station_id}/live-weather")
async def node_live_weather(station_id: str):
    """Real current conditions at the station from Tomorrow.io (reference only, not simulated)."""
    from config import STATION_COORDS
    from services import tomorrow_client
    code = station_id.upper()
    info = STATION_COORDS.get(code)
    if not info:
        raise BacswnNotFoundError("Node not found")
    return {"station": code, **await tomorrow_client.realtime(code, info["lat"], info["lon"])}


@router.post("/consensus")
async def run_consensus(station: str = "MYNN"):
    """Ask a station's peers to verify its current verdict."""
    return _result(trigger_consensus(station.upper()))


@router.post("/fault")
async def inject_fault(req: FaultRequest):
    """Inject or clear a fault (node/link outage, stuck sensor, corrupted model)."""
    mesh.advance()
    return _result(mesh.inject_fault(req.kind, station=req.station and req.station.upper(),
                                     peer=req.peer and req.peer.upper(),
                                     precog=req.precog and req.precog.upper(), sensor=req.sensor,
                                     channel=req.channel))


@router.post("/storm")
async def spawn_storm(req: StormRequest):
    """Spawn a storm cell (e.g. where the presenter clicked on the map)."""
    mesh.advance()
    return mesh.spawn_storm(req.kind, req.lat, req.lon, req.heading, req.speed_kt)


@router.post("/scenario/{name}")
async def run_scenario(name: str):
    """Canned demo scenarios: squall_line, rogue_precog, sensor_fault, partition, reset."""
    mesh.advance()
    return _result(mesh.run_scenario(name))


@router.post("/present")
async def present(req: PresentRequest):
    """Presenter control: make a station show a chosen verdict and voting outcome now."""
    mesh.advance()
    return _result(mesh.present(req.station, req.call, req.outcome, req.model))


class StoryRequest(BaseModel):
    """Body of POST /story: the story name and the beat to stage."""

    story: str                    # squall|stuck_sensor|cut_off
    beat: str                     # see MeshSimulation.STORIES


@router.post("/story")
async def story_beat(req: StoryRequest):
    """Guided story: stage one beat, then hold the mesh still until the next."""
    mesh.advance()
    return _result(mesh.story_beat(req.story, req.beat))


@router.post("/story/end")
async def story_end():
    """End a guided story: release the hold and reset the mesh."""
    return mesh.story_end()


class AskRequest(BaseModel):
    """Body of POST /ask: the question plus the story step the presenter is on."""

    question: str
    story: str | None = None
    station: str | None = None
    step_title: str | None = None
    step_caption: str | None = None


@router.post("/ask")
async def ask(req: AskRequest, request: Request):
    """AI-assisted: answer a question about the current story step from the live mesh state.

    Raises:
        AIUnavailable: the AI backend is not configured or failed (a BacswnError, so
            the global handler answers with its own status, e.g. 503).
    """
    from services import ai_assist
    user = (getattr(request.state, "user", None) or {}).get("sub", "?")
    ctx = ai_assist.story_context(mesh, req.story, req.station and req.station.upper())
    return await ai_assist.ask_about_story(user, req.question, ctx, (req.step_title or "")[:200],
                                           (req.step_caption or "")[:1500])
