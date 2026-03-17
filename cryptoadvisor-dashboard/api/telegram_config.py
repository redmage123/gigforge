"""Telegram notification configuration API."""

from fastapi import APIRouter, Request, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from services.telegram_bot import (
    get_telegram_config as svc_get_telegram_config,
    save_telegram_config as svc_save_telegram_config,
    send_telegram,
)

router = APIRouter()


class TelegramConfig(BaseModel):
    bot_token: str
    chat_id: str


@router.get("/")
async def get_telegram_config(request: Request):
    username = request.state.user.get("sub", "")
    config = svc_get_telegram_config(username)
    if not config:
        return {"configured": False}
    return config


@router.post("/")
async def save_telegram_config(request: Request, body: TelegramConfig):
    username = request.state.user.get("sub", "")
    return svc_save_telegram_config(username, body.bot_token, body.chat_id)


@router.post("/test")
async def test_telegram(request: Request):
    username = request.state.user.get("sub", "")
    config = svc_get_telegram_config(username)
    if not config or not config.get("configured"):
        return JSONResponse({"error": "Telegram not configured"}, status_code=400)
    result = send_telegram(config["chat_id"], "Test from CryptoAdvisor!", config.get("bot_token"))
    return result
