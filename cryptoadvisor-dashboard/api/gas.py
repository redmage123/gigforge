"""Gas tracker API."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from services.gas import get_current_gas, get_gas_history, get_best_time

router = APIRouter()


@router.get("/current")
async def current_gas():
    try:
        return await get_current_gas()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/history")
async def gas_history(chain: str = "ethereum", hours: int = 24):
    return get_gas_history(chain, hours)


@router.get("/best-time")
async def best_time(chain: str = "ethereum"):
    return get_best_time(chain)
