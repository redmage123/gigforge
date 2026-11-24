"""Chat assistant with a persistent per-user conversation and confirmable actions.

GET    /api/assistant/history                    the conversation (last 60 messages)
DELETE /api/assistant/history                    start over
POST   /api/assistant/message  {message}         reply (+ proposed actions)
POST   /api/assistant/actions/{id}/confirm       run a proposed action
POST   /api/assistant/actions/{id}/cancel        dismiss it
"""

import asyncio
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from services import assistant_actions as actions
from services.user_data import get_username, load_user_data, save_user_data

router = APIRouter()
NAMESPACE = "assistant_chat"  # per-user file: covered by data export and account deletion
KEEP = 60


class MessageBody(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)


def _load(username: str) -> list[dict]:
    data = load_user_data(username, NAMESPACE)
    return data if isinstance(data, list) else []


def _save(username: str, msgs: list[dict]) -> None:
    save_user_data(username, NAMESPACE, msgs[-KEEP:])


def _history_for_prompt(msgs: list[dict]) -> list[dict]:
    """Recent turns, with action outcomes spelled out so the model knows what was done."""
    out = []
    for m in msgs[-8:]:
        text = m["content"]
        for a in m.get("actions", []):
            text += f"\n[proposed action: {a['summary']} — {a['status']}{': ' + a['result'] if a.get('result') else ''}]"
        out.append({"role": m["role"], "content": text})
    return out


@router.get("/history")
async def history(request: Request):
    return {"messages": _load(get_username(request))}


@router.delete("/history")
async def clear(request: Request):
    _save(get_username(request), [])
    return {"messages": []}


@router.post("/message")
async def message(request: Request, body: MessageBody):
    reply, err = await respond(get_username(request), body.message)
    if err:
        return JSONResponse(status_code=502, content={"error": err})
    return {"message": reply}


async def respond(username: str, text: str, channel: str = "app") -> tuple[dict | None, str | None]:
    """Answer one message in the user's conversation (the app and WhatsApp share it). (reply, error)."""
    from main import build_chat_prompt, _extract_and_store_facts  # shared with the legacy /api/chat
    from services.chat_prompt import SYSTEM_PROMPT
    from services.claude_cli import run_claude

    msgs = _load(username)
    prompt = await build_chat_prompt(username, text, _history_for_prompt(msgs))
    system = SYSTEM_PROMPT + "\n\n" + actions.ACTIONS_GUIDE
    if channel == "whatsapp":
        system += ("\n\nThis conversation is happening in WhatsApp: keep replies short (under 1,200 characters), "
                   "plain text with no Markdown tables or headings. Any action you propose has to be confirmed in the app.")
    result = await run_claude(prompt, system=system)
    if not result.ok:
        return None, f"The assistant is unavailable: {result.text[:200]}"
    answer, proposals = actions.split_reply(result.text)
    validated = [await actions.validate(p, username) for p in proposals]
    now = time.time()
    msgs.append({"role": "user", "content": text, "ts": now, **({"channel": channel} if channel != "app" else {})})
    reply = {"role": "assistant", "content": answer or "Here's what I can do:", "ts": now, "actions": validated,
             **({"channel": channel} if channel != "app" else {})}
    msgs.append(reply)
    _save(username, msgs)
    asyncio.create_task(_extract_and_store_facts(username, [
        {"role": "user", "content": text}, {"role": "assistant", "content": answer}]))
    return reply, None


def _find(msgs: list[dict], action_id: str):
    for m in reversed(msgs):
        for a in m.get("actions", []):
            if a["id"] == action_id:
                return a
    return None


@router.post("/actions/{action_id}/confirm")
async def confirm(request: Request, action_id: str):
    username = get_username(request)
    msgs = _load(username)
    a = _find(msgs, action_id)
    if not a:
        return JSONResponse(status_code=404, content={"error": "Action not found"})
    if a["status"] != "proposed":
        return JSONResponse(status_code=409, content={"error": f"This action is already {a['status']}"})
    if time.time() - a.get("created_at", 0) > 24 * 3600:
        a["status"] = "expired"
        _save(username, msgs)
        return JSONResponse(status_code=409, content={"error": "This proposal is more than a day old; ask again"})
    try:
        a["result"] = await actions.execute(a, username)
        a["status"] = "done"
    except ValueError as exc:
        a["status"], a["result"] = "failed", str(exc)
    a["decided_at"] = time.time()
    _save(username, msgs)
    return {"action": a}


@router.post("/actions/{action_id}/cancel")
async def cancel(request: Request, action_id: str):
    username = get_username(request)
    msgs = _load(username)
    a = _find(msgs, action_id)
    if not a:
        return JSONResponse(status_code=404, content={"error": "Action not found"})
    if a["status"] == "proposed":
        a["status"], a["decided_at"] = "cancelled", time.time()
        _save(username, msgs)
    return {"action": a}
