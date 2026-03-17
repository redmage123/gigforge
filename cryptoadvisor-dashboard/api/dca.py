"""DCA calculator API."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from services.dca import backtest_dca

router = APIRouter()


@router.get("/backtest")
async def dca_backtest(coin: str = "bitcoin", days: int = 365,
                       frequency: str = "weekly", amount: float = 100):
    try:
        return await backtest_dca(coin, days, frequency, amount)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)
