"""BACSWN SkyWatch Bahamas — FastAPI Application Entry Point.

NextGEN Meteorological Watch Office, Flight Tracking,
Carbon Emissions Platform & Emergency Response Coordination.

Built by AI Elevate for the Bahamas Aviation, Climate and Severe Weather Network.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from config import HOST, PORT, DATA_DIR
from services.database import init_db, seed_demo_data
from services.auth import ensure_default_admin
from services.agent_orchestrator import orchestrator
from services.websocket_manager import ws_manager
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
from api.dashboard import router as dashboard_router
from api.websocket_feeds import router as ws_router
from api.ai_analysis import router as ai_router
from api.chat import router as chat_router
from api.hurricane import router as hurricane_router
from api.mesh import router as mesh_router
from api.simulation import router as simulation_router

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
    """Application startup and shutdown lifecycle."""
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

    # Start periodic agents
    await orchestrator.run_periodic_agents()
    logger.info("7 AI agents initialized")

    # ── WebSocket broadcast tasks ───────────────────────────────────────
    async def _broadcast_flights():
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

    async def _ws_flights_loop():
        while True:
            try:
                await _broadcast_flights()
            except Exception as e:
                logger.error(f"WS flights broadcast error: {e}")
            await asyncio.sleep(5)

    async def _ws_weather_loop():
        while True:
            try:
                await _broadcast_weather()
            except Exception as e:
                logger.error(f"WS weather broadcast error: {e}")
            await asyncio.sleep(30)

    asyncio.create_task(_ws_flights_loop())
    asyncio.create_task(_ws_weather_loop())
    logger.info("WebSocket broadcast tasks started (flights: 5s, weather: 30s)")

    logger.info(f"Server ready at http://{HOST}:{PORT}")
    logger.info("Frontend at http://localhost:5173 (dev) or http://localhost:8060 (built)")

    yield

    logger.info("BACSWN shutting down...")


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

# ── Static files ────────────────────────────────────────────────────────
STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(exist_ok=True)
if REACT_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# ── Register API routers ────────────────────────────────────────────────
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
app.include_router(simulation_router, prefix="/api/simulation", tags=["simulation"])


# ── React SPA catch-all ─────────────────────────────────────────────────
@app.get("/{full_path:path}")
async def serve_react(full_path: str):
    """Serve React SPA — try file first, then fallback to index.html."""
    if REACT_DIR.exists():
        file_path = REACT_DIR / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        index = REACT_DIR / "index.html"
        if index.exists():
            return FileResponse(str(index))
    return {"message": "BACSWN SkyWatch Bahamas API", "docs": "/docs", "frontend": "cd frontend && npm run dev"}


# ── Entry point ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
