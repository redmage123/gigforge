"""WhatsApp: link a number, choose what's sent there, and Meta's webhook for incoming messages.

GET    /api/whatsapp/            status, preferences
POST   /api/whatsapp/link        a one-time code to send from WhatsApp
PUT    /api/whatsapp/prefs       {alerts, in_play, briefing, briefing_hour, tz_offset_min, chat}
POST   /api/whatsapp/test        send a test message
DELETE /api/whatsapp/            unlink
GET    /api/whatsapp/webhook     Meta's one-time verification (public)
POST   /api/whatsapp/webhook     incoming messages (public; signed with the app secret)
"""

import asyncio
import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from services import audit_events, payments, whatsapp
from services.user_data import get_username

logger = logging.getLogger(__name__)
router = APIRouter()
_tasks: set[asyncio.Task] = set()


@router.get("/")
async def status(request: Request):
    return whatsapp.public_state(get_username(request))


@router.post("/link")
async def link(request: Request):
    if not whatsapp.available():
        return JSONResponse({"error": "WhatsApp isn't set up on this server yet."}, status_code=503)
    if not payments.has_whatsapp(get_username(request)):
        return JSONResponse({"error": "WhatsApp is part of the Pro plan. Subscribe under Billing first."}, status_code=402)
    return whatsapp.start_link(get_username(request))


@router.put("/prefs")
async def prefs(request: Request):
    try:
        return whatsapp.set_prefs(get_username(request), await request.json())
    except (TypeError, ValueError):
        return JSONResponse({"error": "invalid preferences"}, status_code=400)


@router.post("/test")
async def test(request: Request):
    ok, why = await whatsapp.send_to_user(get_username(request), "✅ Test from AssetAdvisor: WhatsApp is working.", "test")
    if not ok:
        return JSONResponse({"error": why}, status_code=400)
    return {"sent": True}


@router.delete("/")
async def unlink(request: Request):
    whatsapp.unlink(get_username(request))
    audit_events.from_request(request, "whatsapp.unlink")
    return whatsapp.public_state(get_username(request))


@router.get("/webhook")
async def verify(request: Request):
    q = request.query_params
    token = whatsapp.config()["verify"]
    if token and q.get("hub.mode") == "subscribe" and q.get("hub.verify_token") == token:
        return PlainTextResponse(q.get("hub.challenge", ""))
    return PlainTextResponse("forbidden", status_code=403)


@router.post("/webhook")
async def webhook(request: Request):
    raw = await request.body()
    if not whatsapp.signature_ok(raw, request.headers.get("x-hub-signature-256", "")):
        return PlainTextResponse("bad signature", status_code=403)
    try:
        payload = json.loads(raw)
    except ValueError:
        return PlainTextResponse("bad payload", status_code=400)
    # Answer Meta at once (it retries slow webhooks); the assistant replies in the background
    for message in whatsapp.inbound_messages(payload):
        task = asyncio.create_task(_reply(message))
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)
    return {"ok": True}


async def _reply(message: dict) -> None:
    try:
        text = await whatsapp.handle(message)
        if text:
            ok, why = await whatsapp.send_text(message["from"], text)
            if not ok:
                logger.warning("whatsapp reply failed: %s", why)
    except Exception:  # noqa: BLE001
        logger.exception("whatsapp message handling failed")
