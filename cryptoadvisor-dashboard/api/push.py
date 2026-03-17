"""Push notification endpoints."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from services.push_notifications import subscribe, unsubscribe, get_subscriptions
from services.notifications import get_notifications as svc_get_notifications

router = APIRouter()


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscription(BaseModel):
    endpoint: str
    keys: PushKeys


class SubscribeRequest(BaseModel):
    subscription: PushSubscription


class UnsubscribeRequest(BaseModel):
    endpoint: str


@router.post("/subscribe")
async def subscribe_push(request: Request, body: SubscribeRequest):
    try:
        username = request.state.user.get("sub", "")
        return subscribe(username, body.subscription.dict())
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.delete("/subscribe")
async def unsubscribe_push(request: Request, body: UnsubscribeRequest):
    try:
        username = request.state.user.get("sub", "")
        return unsubscribe(username, body.endpoint)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/")
async def get_notifications(request: Request):
    try:
        username = request.state.user.get("sub", "")
        return svc_get_notifications(username)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
