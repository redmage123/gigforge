"""Impermanent loss calculator endpoint."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import math

router = APIRouter()


class ILCalculation(BaseModel):
    token_a_start: float
    token_b_start: float
    token_a_end: float
    token_b_end: float
    initial_value: float


@router.post("/calculate")
async def calculate_impermanent_loss(request: Request, body: ILCalculation):
    try:
        username = request.state.user.get("sub", "")

        # Price ratio change
        price_ratio = (body.token_a_end / body.token_a_start) / (
            body.token_b_end / body.token_b_start
        )

        # IL formula: 2 * sqrt(price_ratio) / (1 + price_ratio) - 1
        il_percentage = (2 * math.sqrt(price_ratio) / (1 + price_ratio) - 1) * 100

        # Value if held vs value in pool
        hold_value = body.initial_value * (
            (body.token_a_end / body.token_a_start + body.token_b_end / body.token_b_start) / 2
        )
        pool_value = body.initial_value * (1 + il_percentage / 100) * (
            (body.token_a_end / body.token_a_start + body.token_b_end / body.token_b_start) / 2
        )
        il_value = hold_value - pool_value

        return {
            "impermanent_loss_pct": round(il_percentage, 4),
            "impermanent_loss_value": round(abs(il_value), 2),
            "hold_value": round(hold_value, 2),
            "pool_value": round(pool_value, 2),
            "price_ratio_change": round(price_ratio, 4),
        }
    except ZeroDivisionError:
        return JSONResponse({"error": "Start prices cannot be zero"}, status_code=400)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
