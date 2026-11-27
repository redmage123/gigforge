"""BACSWN SkyWatch Bahamas — FastAPI application entry point.

What: builds the ``app`` served by uvicorn: middleware, the ``BacswnError`` handler,
every API router, the static/React SPA catch-all, and the startup/shutdown lifespan.

Why: SkyWatch (meteorological watch office, flight tracking, CORSIA carbon oversight
and emergency coordination for the Bahamas Aviation, Climate and Severe Weather
Network) is one process; this module is the single place that wires its parts together.

How: ``lifespan`` initialises and seeds the database, ensures an admin user, starts the
periodic agents, registers the forecast-verification jobs (not under ``TESTING``) and
starts the WebSocket broadcast and FIR observation loops; on shutdown it closes the
shared httpx clients. Background loops use ``services.scheduler.run_forever`` so a
failing cycle is logged and the loop keeps going.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from config import HOST, PORT, DATA_DIR, PUBLIC_DEMO
from services.database import init_db, seed_demo_data
from services.auth import ensure_default_admin
from services.agent_orchestrator import orchestrator
from services.websocket_manager import ws_manager
from services.scheduler import run_forever
from middleware.auth import AuthMiddleware
from middleware.rate_limiter import RateLimiter
from middleware.request_logger import RequestLogger

# ── API Routers ─────────────────────────────────────────────────────────
from api.auth import router as auth_router
from api.weather import router as weather_router
from api.flights import router as flights_router
from api.emissions import router as emissions_router
from api.alerts_wx import router as alerts_router
from api.emergency import router as emergency_router
from api.sensors import router as sensors_router
from api.sigmet import router as sigmet_router
from api.training import router as training_router
from api.agents import router as agents_router
from api.channels import router as channels_router
from api.map_data import router as map_router
from api.health import router as health_router
from api.demo import router as demo_router
from api.dashboard import router as dashboard_router
from api.websocket_feeds import router as ws_router
from api.ai_analysis import router as ai_router
from api.chat import router as chat_router
from api.hurricane import router as hurricane_router
from api.mesh import router as mesh_router
from api.simulation import router as simulation_router
from api.carbon_oversight import router as carbon_oversight_router
from api.verification import router as verification_router
from api.climatology import router as climatology_router
from api.live_audience import router as live_router, admin_router as live_admin_router
from services.errors import BacswnError

# ── Logging ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("bacswn")

# ── React SPA directory ─────────────────────────────────────────────────
REACT_DIR = Path(__file__).parent / "static" / "react"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start BACSWN's database, agents and background loops; close HTTP clients on shutdown."""
    logger.info("=" * 60)
    logger.info("  BACSWN SkyWatch Bahamas — Starting Up")
    logger.info("  Bahamas Aviation, Climate & Severe Weather Network")
    logger.info("=" * 60)

    # Initialize database
    await init_db()
    logger.info("Database initialized (SQLite + WAL mode)")

    # Seed demo data (no-op if rows already exist)
    await seed_demo_data()
    logger.info("Demo seed data checked")

    # Create default users
    await ensure_default_admin()

    # Public self-guided demo: its data starts empty on every restart, so load the fictional
    # CORSIA demo operators each time (the same script an operator runs by hand on prod).
    if PUBLIC_DEMO:
        try:
            from deploy.oversight_demo import seed as seed_oversight_demo
            await seed_oversight_demo()
            logger.info("Public demo: CORSIA oversight demo data seeded")
        except Exception as e:      # the rest of the demo still works without it
            logger.error(f"Public demo: seeding the CORSIA oversight demo failed: {e}")

    # Start periodic agents
    await orchestrator.run_periodic_agents()
    logger.info("7 AI agents initialized")

    # ── Forecast verification ───────────────────────────────────────────
    # Skipped under TESTING so the suite never makes live network calls or
    # spawns background tasks inside the lifespan test harness.
    if not os.getenv("TESTING"):
        from services import forecast_verification as fv
        from services import forecast_correction as fc
        from services.scheduler import register_task

        fc.load_registry()

        from services import climatology as cl

        async def _seed_verification():
            """Seed verification data, train or load correctors and build climate normals.

            Runs once in the background; any failure is logged so startup never fails.
            """
            try:
                await fv.ensure_seeded()
                # Train bias-correction models once data exists (also refreshes the
                # cached scoreboard). If models already exist, just populate the cache.
                if not fc.has_models():
                    await fc.train_correctors()
                else:
                    await fc.refresh_scoreboard()
                # Build ERA5 climate normals once (persisted; skip if present).
                await cl.ensure_built()
            except Exception as e:
                logger.error(f"Forecast verification seed/train failed: {e}")

        # Populate the scoreboard in the background so startup is never blocked.
        asyncio.create_task(_seed_verification())
        # Capture forecasts hourly; match against observations every 10 minutes;
        # retrain bias-correction models every 6 hours.
        register_task(fv.capture_forecasts, 3600, "fv-capture")
        register_task(fv.match_pending, 600, "fv-match")
        register_task(fc.train_correctors, 21600, "fv-train")
        # Hourly: fill any climate-normal stations missed due to API rate limits.
        register_task(cl.ensure_built, 3600, "climatology-fill")
        logger.info("Forecast verification engine initialized")

    # ── WebSocket broadcast tasks ───────────────────────────────────────
    async def _broadcast_flights():
        """Push the current FIR flight list to ``flights`` WebSocket subscribers."""
        from services.opensky_client import fetch_flights
        from datetime import datetime, timezone
        flights = await fetch_flights()
        await ws_manager.broadcast("flights", {
            "type": "flights_update",
            "flights": flights,
            "count": len(flights),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    async def _broadcast_weather():
        """Push freshly parsed METARs to ``weather`` WebSocket subscribers."""
        from services.awc_client import fetch_metars, parse_metar
        from datetime import datetime, timezone
        raw = await fetch_metars()
        parsed = [parse_metar(m) for m in raw]
        await ws_manager.broadcast("weather", {
            "type": "weather_update",
            "metars": parsed,
            "count": len(parsed),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    # BACSWN's own per-airline FIR sightings: independent evidence for the
    # CORSIA oversight register's cross-check of operators' reports.
    from services.opensky_client import fetch_flights
    from services.carbon_oversight import record_observations, OBSERVE_INTERVAL

    async def _record_fir_observations():
        """Record one round of FIR sightings for the CORSIA oversight cross-check."""
        await record_observations(await fetch_flights())

    # Not paused with the demo: broadcasts already go quiet while paused (ws_manager),
    # and FIR sightings are real-world evidence that must keep accumulating.
    asyncio.create_task(run_forever(_broadcast_flights, 5, "WS flights broadcast error",
                                    skip_when_paused=False, log=logger))
    asyncio.create_task(run_forever(_broadcast_weather, 30, "WS weather broadcast error",
                                    skip_when_paused=False, log=logger))
    asyncio.create_task(run_forever(_record_fir_observations, OBSERVE_INTERVAL.total_seconds(),
                                    "FIR observation error", skip_when_paused=False, log=logger))
    logger.info("WebSocket broadcast tasks started (flights: 5s, weather: 30s)")

    logger.info(f"Server ready at http://{HOST}:{PORT}")
    logger.info("Frontend at http://localhost:5173 (dev) or http://localhost:8060 (built)")

    yield

    logger.info("BACSWN shutting down...")

    # Shutdown: close any open httpx clients
    from services import opensky_client, awc_client
    if opensky_client._client is not None:
        await opensky_client._client.aclose()
    if awc_client._client is not None:
        await awc_client._client.aclose()


# ── FastAPI App ─────────────────────────────────────────────────────────
app = FastAPI(
    title="BACSWN SkyWatch Bahamas",
    description="NextGEN Meteorological Watch Office & Aviation Management Platform",
    version="1.0.0",
    lifespan=lifespan,
)

# ── Middleware (order: outermost → innermost) ───────────────────────────
app.add_middleware(RequestLogger)
app.add_middleware(AuthMiddleware)
app.add_middleware(RateLimiter, max_requests=200, window_seconds=60)


# ── Errors: any BacswnError becomes a JSON response with its own status ─
@app.exception_handler(BacswnError)
async def bacswn_error_handler(request: Request, exc: BacswnError) -> JSONResponse:
    """Render a BACSWN error as ``{"error", "detail"}`` JSON with the error's HTTP status.

    Both keys carry the same user-safe message: the frontend reads ``error`` and
    FastAPI clients conventionally read ``detail``.
    """
    return JSONResponse(status_code=exc.status, content={"error": exc.message, "detail": exc.message})

# ── Static files ────────────────────────────────────────────────────────
STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(exist_ok=True)
if REACT_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# ── Register API routers ────────────────────────────────────────────────
app.include_router(live_router, prefix="/api/live", tags=["live-audience"])
app.include_router(live_admin_router, prefix="/api/live-admin", tags=["live-audience"])
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(weather_router, prefix="/api/weather", tags=["weather"])
app.include_router(flights_router, prefix="/api/flights", tags=["flights"])
app.include_router(emissions_router, prefix="/api/emissions", tags=["emissions"])
app.include_router(alerts_router, prefix="/api/alerts", tags=["alerts"])
app.include_router(emergency_router, prefix="/api/emergency", tags=["emergency"])
app.include_router(sensors_router, prefix="/api/sensors", tags=["sensors"])
app.include_router(sigmet_router, prefix="/api/sigmet", tags=["sigmet"])
app.include_router(training_router, prefix="/api/training", tags=["training"])
app.include_router(agents_router, prefix="/api/agents", tags=["agents"])
app.include_router(channels_router, prefix="/api/channels", tags=["channels"])
app.include_router(map_router, prefix="/api/map", tags=["map"])
app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(dashboard_router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(ws_router, prefix="/ws", tags=["websocket"])
app.include_router(ai_router, prefix="/api/ai", tags=["ai"])
app.include_router(chat_router, prefix="/api/chat", tags=["chat"])
app.include_router(hurricane_router, prefix="/api/hurricane", tags=["hurricane"])
app.include_router(mesh_router, prefix="/api/mesh", tags=["mesh"])
app.include_router(demo_router, prefix="/api/demo", tags=["demo"])
app.include_router(simulation_router, prefix="/api/simulation", tags=["simulation"])
app.include_router(carbon_oversight_router, prefix="/api/carbon-oversight", tags=["carbon-oversight"])
app.include_router(verification_router, prefix="/api/verification", tags=["verification"])
app.include_router(climatology_router, prefix="/api/climatology", tags=["climatology"])


# ── React SPA catch-all ─────────────────────────────────────────────────
@app.get("/{full_path:path}")
async def serve_react(full_path: str):
    """Serve the built React SPA: the requested file if it exists, else ``index.html``.

    Without a build, returns a small JSON pointer to the API docs and the dev server.
    """
    if REACT_DIR.exists():
        root = REACT_DIR.resolve()
        file_path = (root / full_path).resolve()
        # Encoded "../" (e.g. "..%2f.env") reaches here decoded; never serve outside the build.
        if file_path.is_relative_to(root) and file_path.is_file():
            return FileResponse(str(file_path))
        index = REACT_DIR / "index.html"
        if index.exists():
            return FileResponse(str(index))
    return {"message": "BACSWN SkyWatch Bahamas API", "docs": "/docs", "frontend": "cd frontend && npm run dev"}


# ── Entry point ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
