"""BACSWN — Distributed Mesh Network API router."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services.mesh_network import mesh, get_mesh_status, get_node_detail, trigger_consensus

router = APIRouter()


class FaultRequest(BaseModel):
    kind: str                     # node_down|node_up|link_down|link_up|sensor_fault|corrupt_precog|clear
    station: str | None = None
    peer: str | None = None
    precog: str | None = None     # TEMPO|VISTA|LEXIS
    sensor: str | None = None     # visibility|wind|pressure|rain


class StormRequest(BaseModel):
    kind: str = "squall"          # convective|squall|fog
    lat: float | None = None
    lon: float | None = None
    heading: float | None = None
    speed_kt: float | None = None


def _result(r: dict):
    return JSONResponse(status_code=400 if "error" in r else 200, content=r)


@router.get("/status")
async def mesh_status():
    """Full mesh state — nodes with their 3-model ensembles, links, storms, traffic, consensus."""
    return get_mesh_status()


@router.get("/node/{station_id}")
async def node_detail(station_id: str):
    """Detailed info for a single mesh node."""
    node = get_node_detail(station_id.upper())
    if not node:
        return JSONResponse(status_code=404, content={"error": "Node not found"})
    return node


@router.get("/airspace")
async def mesh_airspace():
    """Mesh weather hazards and the aircraft predicted to fly into them in the next 30 min."""
    from services.mesh_airspace import airspace
    from services.opensky_client import fetch_flights
    mesh.advance()
    return airspace(mesh, await fetch_flights())


@router.get("/node/{station_id}/live-weather")
async def node_live_weather(station_id: str):
    """Real current conditions at the station from Tomorrow.io (reference only, not simulated)."""
    from config import STATION_COORDS
    from services import tomorrow_client
    code = station_id.upper()
    info = STATION_COORDS.get(code)
    if not info:
        return JSONResponse(status_code=404, content={"error": "Node not found"})
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
                                     precog=req.precog and req.precog.upper(), sensor=req.sensor))


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
