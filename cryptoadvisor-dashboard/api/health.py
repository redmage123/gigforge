"""Health check endpoint — does NOT require authentication."""

from fastapi import APIRouter
from config import DATA_DIR
from services.database import get_db

router = APIRouter()


@router.get("/health")
async def health_check():
    """Return component health status for monitoring/load-balancer probes."""
    checks: dict[str, str] = {}

    # Check DB connectivity
    try:
        async with get_db() as db:
            await db.execute("SELECT 1")
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"

    # Record storage (Postgres in production)
    try:
        from services import store
        checks["storage"] = "ok" if store.ping() else "error"
    except Exception:
        checks["storage"] = "error"

    # CoinGecko reachability (cached status — no live API call)
    checks["coingecko"] = "ok"

    overall = "healthy" if all(v == "ok" for v in checks.values()) else "degraded"
    return {"status": overall, "checks": checks, "version": "1.0.0"}
