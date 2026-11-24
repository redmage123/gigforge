"""DCA calculator API."""

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services.dca import DcaError, backtest_dca

router = APIRouter()


class BacktestBody(BaseModel):
    coin: str = "bitcoin"
    days: int = 365
    frequency: str = "weekly"
    amount: float = 100


async def _run(coin: str, days: int, frequency: str, amount: float):
    try:
        return await backtest_dca(coin, days, frequency, amount)
    except DcaError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    except httpx.HTTPError as e:
        status = getattr(getattr(e, "response", None), "status_code", None)
        reason = "rate limited, try again in a minute" if status == 429 else e.__class__.__name__
        return JSONResponse({"error": f"Price history for {coin} is unavailable right now ({reason})"}, status_code=502)
    except (KeyError, TypeError, ValueError) as e:  # unexpected payload shape from the provider
        return JSONResponse({"error": f"Price history for {coin} could not be read ({e.__class__.__name__})"}, status_code=502)


@router.post("/backtest")
async def dca_backtest(body: BacktestBody):
    return await _run(body.coin, body.days, body.frequency, body.amount)


@router.get("/backtest")
async def dca_backtest_get(coin: str = "bitcoin", days: int = 365,
                           frequency: str = "weekly", amount: float = 100):
    return await _run(coin, days, frequency, amount)
