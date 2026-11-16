"""Risk metrics API."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from services.risk import calculate_risk_metrics
from services.user_data import get_username
from api.portfolios import scope_of

router = APIRouter()


@router.get("/metrics")
async def risk_metrics(request: Request, days: int = 90):
    try:
        scope = scope_of(request)
        return await calculate_risk_metrics(scope.owner, days, scope.portfolio_ids)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)
