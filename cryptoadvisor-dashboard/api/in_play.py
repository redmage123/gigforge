"""In-play coins API — per-user in-play list, rules, and phone (ntfy) alert settings."""

import asyncio
import re
import secrets
from dataclasses import asdict

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services import in_play, in_play_news, in_play_push
from services.user_data import get_username, save_user_data

router = APIRouter()

_TOPIC_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


class PhoneConfig(BaseModel):
    enabled: bool
    ntfy_topic: str
    ntfy_server: str = "https://ntfy.sh"


class RulesBody(BaseModel):
    volume_mult: float
    range_mult: float
    max_wick_pct: float
    min_body_pct: float


def _rules_payload(username: str) -> dict:
    return {
        "rules": asdict(in_play.get_rules(username)),
        "defaults": asdict(in_play.DEFAULT_RULES),
        "floors": {"volume_mult": in_play.BASE_VOLUME_MULT, "range_mult": in_play.BASE_RANGE_MULT},
        "timeframe": "1d",
        "lookback_days": in_play.LOOKBACK_DAYS,
        "retention_days": in_play.RETENTION_DAYS,
        "max_entries": in_play.MAX_ENTRIES,
    }


@router.get("/")
async def list_in_play(request: Request):
    username = get_username(request)
    state = in_play.get_scan_state()
    return {
        "entries": in_play.get_user_view(username),
        "last_scan": state.get("last_scan"),
        "symbols_scanned": state.get("symbols_scanned", 0),
        "ai_summaries": in_play_news.ai_enabled(),
        **_rules_payload(username),
    }


@router.put("/rules")
async def save_rules(request: Request, body: RulesBody):
    username = get_username(request)
    rules = in_play.Rules.from_dict(body.model_dump())
    error = rules.validate()
    if error:
        return JSONResponse({"error": error}, status_code=400)
    in_play.update_rules(username, rules)
    # Coins that just joined the list need their news looked up
    asyncio.create_task(in_play.refresh_catalysts_for(username))
    return {"status": "saved", "entries": in_play.get_user_view(username), **_rules_payload(username)}


@router.post("/scan")
async def trigger_scan(request: Request):
    if request.state.user.get("role") != "admin":
        return JSONResponse({"error": "Admin only"}, status_code=403)
    asyncio.create_task(in_play.scan_in_play())
    return {"status": "started"}


@router.get("/phone")
async def get_phone(request: Request):
    cfg = in_play_push.get_phone_config(get_username(request))
    return {
        "enabled": bool(cfg.get("enabled")),
        "ntfy_topic": cfg.get("ntfy_topic", ""),
        "ntfy_server": cfg.get("ntfy_server", "https://ntfy.sh"),
        "suggested_topic": f"cryptoadvisor-{secrets.token_urlsafe(12).replace('-', '').replace('_', '')[:16]}",
    }


@router.put("/phone")
async def save_phone(request: Request, body: PhoneConfig):
    if body.enabled and not _TOPIC_RE.match(body.ntfy_topic):
        return JSONResponse({"error": "Topic must be 8-64 letters, digits, '-' or '_'"}, status_code=400)
    if not body.ntfy_server.startswith("https://"):
        return JSONResponse({"error": "ntfy server must be an https:// URL"}, status_code=400)
    save_user_data(get_username(request), in_play_push.PHONE_NAMESPACE, body.model_dump())
    return {"status": "saved"}


@router.post("/phone/test")
async def test_phone(request: Request):
    cfg = in_play_push.get_phone_config(get_username(request))
    if not cfg.get("ntfy_topic"):
        return JSONResponse({"error": "Save an ntfy topic first"}, status_code=400)
    ok = await in_play_push.send_ntfy(
        cfg, "CryptoAdvisor test", "Phone alerts are working. In-play coins will arrive here.", "white_check_mark", "default"
    )
    if not ok:
        return JSONResponse({"error": "ntfy did not accept the message"}, status_code=502)
    return {"status": "sent"}
