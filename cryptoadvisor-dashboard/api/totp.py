"""Two-factor authentication (TOTP) endpoints."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()


class TOTPVerify(BaseModel):
    code: str


class TOTPDisable(BaseModel):
    code: str


@router.post("/enable")
async def enable_totp(request: Request):
    try:
        username = request.state.user.get("sub", "")
        # Placeholder: generate TOTP secret and provisioning URI
        return {
            "secret": "",
            "provisioning_uri": "",
            "message": "Scan the QR code with your authenticator app, then verify with /verify",
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/verify")
async def verify_totp(request: Request, body: TOTPVerify):
    try:
        username = request.state.user.get("sub", "")
        # Placeholder: verify TOTP code and finalize 2FA setup
        return {
            "verified": False,
            "message": "Invalid code",
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/disable")
async def disable_totp(request: Request, body: TOTPDisable):
    try:
        username = request.state.user.get("sub", "")
        # Placeholder: verify code then disable 2FA
        return {
            "disabled": False,
            "message": "Invalid code",
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/status")
async def totp_status(request: Request):
    try:
        username = request.state.user.get("sub", "")
        # Placeholder: check if 2FA is enabled for user
        return {
            "enabled": False,
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
