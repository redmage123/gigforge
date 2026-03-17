"""Token approval management endpoints."""

from fastapi import APIRouter, Request, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()


class RevokeRequest(BaseModel):
    token_address: str
    spender: str
    chain: str = "ethereum"


@router.get("/")
async def get_approvals(
    request: Request,
    address: str = Query(..., description="Wallet address"),
    chain: str = Query("ethereum", description="Chain name"),
):
    try:
        username = request.state.user.get("sub", "")
        # Placeholder: fetch token approvals for the given address and chain
        return {
            "address": address,
            "chain": chain,
            "approvals": [],
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/revoke")
async def revoke_approval(request: Request, body: RevokeRequest):
    try:
        username = request.state.user.get("sub", "")
        # Placeholder: build unsigned revoke transaction
        return {
            "token_address": body.token_address,
            "spender": body.spender,
            "chain": body.chain,
            "transaction": {
                "to": body.token_address,
                "data": "",
                "value": "0x0",
                "gas": "0x0",
            },
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
