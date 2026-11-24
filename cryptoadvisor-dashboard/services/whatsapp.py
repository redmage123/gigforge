"""WhatsApp through Meta's WhatsApp Business Cloud API: linking a phone, sending, and the inbound webhook.

Configuration (environment):
  WHATSAPP_TOKEN            permanent access token of the system user
  WHATSAPP_PHONE_NUMBER_ID  the business phone number's id (not the number itself)
  WHATSAPP_DISPLAY_NUMBER   the business number people message, digits with country code (e.g. 353861234567)
  WHATSAPP_APP_SECRET       app secret: every webhook call is checked against its signature
  WHATSAPP_VERIFY_TOKEN     any string; Meta echoes it once when the webhook is registered
  WHATSAPP_ALERT_TEMPLATE   optional: approved template with one body variable, used for alerts sent more
                            than 24 hours after the user last wrote (Meta only allows templates then)
  WHATSAPP_TEMPLATE_LANG    the template's language code (default en_US)
  WHATSAPP_API_VERSION      Graph API version (default v21.0)

Linking needs no paid message: the user sends "LINK 123456" from their own WhatsApp (a wa.me link fills
it in), which proves they own the number and opens the 24-hour window in which replies are free.
"""

import hashlib
import hmac
import logging
import os
import re
import secrets
import time

import httpx

from services import store

logger = logging.getLogger(__name__)

NAMESPACE = "whatsapp"          # per user: {phone, linked_at, prefs, last_inbound_at, ...}
LINKS = "whatsapp_links"        # shared: {phone: {"username": ...}}
CODES = "whatsapp_codes"        # shared: {code: {"username", "expires"}}
CODE_TTL = 15 * 60
WINDOW = 24 * 3600              # Meta's customer-service window after the user's last message
MAX_TEXT = 4000                 # WhatsApp allows 4096
DEFAULT_PREFS = {"alerts": True, "in_play": True, "briefing": False, "briefing_hour": 8, "tz_offset_min": 0, "chat": True}


def config() -> dict:
    return {
        "token": os.environ.get("WHATSAPP_TOKEN", ""),
        "phone_id": os.environ.get("WHATSAPP_PHONE_NUMBER_ID", ""),
        "display": re.sub(r"\D", "", os.environ.get("WHATSAPP_DISPLAY_NUMBER", "")),
        "secret": os.environ.get("WHATSAPP_APP_SECRET", ""),
        "verify": os.environ.get("WHATSAPP_VERIFY_TOKEN", ""),
        "template": os.environ.get("WHATSAPP_ALERT_TEMPLATE", ""),
        "lang": os.environ.get("WHATSAPP_TEMPLATE_LANG", "en_US"),
        "version": os.environ.get("WHATSAPP_API_VERSION", "v21.0"),
    }


def available() -> bool:
    c = config()
    return bool(c["token"] and c["phone_id"] and c["display"] and c["secret"])


# ── Per-user state ──────────────────────────────────────────────────────────

def get_state(username: str) -> dict:
    s = store.get(NAMESPACE, username)
    s = s if isinstance(s, dict) else {}
    s["prefs"] = {**DEFAULT_PREFS, **(s.get("prefs") or {})}
    return s


def _put_state(username: str, state: dict) -> None:
    store.put(NAMESPACE, username, state)


def public_state(username: str) -> dict:
    s = get_state(username)
    c = config()
    phone = s.get("phone")
    return {
        "available": available(),
        "business_number": c["display"] or None,
        "linked": bool(phone),
        "phone": f"+{phone[:-4].translate(str.maketrans('0123456789', '••••••••••'))}{phone[-4:]}" if phone else None,
        "linked_at": s.get("linked_at"),
        "paused": bool(s.get("paused")),
        "prefs": s["prefs"],
        "window_open": bool(s.get("last_inbound_at") and time.time() - s["last_inbound_at"] < WINDOW),
        "can_send_anytime": bool(c["template"]),
    }


def set_prefs(username: str, prefs: dict) -> dict:
    s = get_state(username)
    clean = dict(s["prefs"])
    for k in ("alerts", "in_play", "briefing", "chat"):
        if k in prefs:
            clean[k] = bool(prefs[k])
    if "briefing_hour" in prefs:
        clean["briefing_hour"] = max(0, min(23, int(prefs["briefing_hour"])))
    if "tz_offset_min" in prefs:
        clean["tz_offset_min"] = max(-14 * 60, min(14 * 60, int(prefs["tz_offset_min"])))
    s["prefs"] = clean
    _put_state(username, s)
    return public_state(username)


def start_link(username: str) -> dict:
    """A one-time code the user sends from WhatsApp to link their number."""
    code = f"{secrets.randbelow(900000) + 100000}"
    now = time.time()

    def add(codes):
        codes = {k: v for k, v in (codes or {}).items() if v.get("expires", 0) > now and v.get("username") != username}
        codes[code] = {"username": username, "expires": now + CODE_TTL}
        return codes

    store.update(store.SHARED, CODES, add, default={})
    text = f"LINK {code}"
    display = config()["display"]
    return {"code": code, "text": text, "expires_in": CODE_TTL,
            "url": f"https://wa.me/{display}?text={text.replace(' ', '%20')}" if display else None}


def unlink(username: str) -> None:
    s = get_state(username)
    phone = s.pop("phone", None)
    s.pop("linked_at", None)
    s.pop("paused", None)
    _put_state(username, s)
    if phone:
        store.update(store.SHARED, LINKS, lambda links: {k: v for k, v in (links or {}).items() if k != phone}, default={})


def username_for(phone: str) -> str | None:
    links = store.get(store.SHARED, LINKS) or {}
    row = links.get(phone)
    return row.get("username") if isinstance(row, dict) else None


def _claim_code(code: str, phone: str) -> str | None:
    """Link `phone` to whoever owns `code`; returns that username."""
    now = time.time()
    owner = {}

    def take(codes):
        codes = dict(codes or {})
        row = codes.pop(code, None)
        if row and row.get("expires", 0) > now:
            owner["username"] = row["username"]
        return codes

    store.update(store.SHARED, CODES, take, default={})
    username = owner.get("username")
    if not username:
        return None
    previous = username_for(phone)
    if previous and previous != username:
        unlink(previous)                      # a number belongs to one account at a time
    old = get_state(username).get("phone")
    if old and old != phone:
        unlink(username)

    def link(links):
        links = dict(links or {})
        links[phone] = {"username": username}
        return links

    store.update(store.SHARED, LINKS, link, default={})
    s = get_state(username)
    s.update(phone=phone, linked_at=now, last_inbound_at=now, paused=False)
    _put_state(username, s)
    return username


# ── Sending ─────────────────────────────────────────────────────────────────

async def _post(payload: dict) -> tuple[bool, str]:
    c = config()
    url = f"https://graph.facebook.com/{c['version']}/{c['phone_id']}/messages"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(url, json={"messaging_product": "whatsapp", **payload},
                                  headers={"Authorization": f"Bearer {c['token']}"})
        if r.status_code >= 400:
            detail = (r.json().get("error") or {}).get("message", r.text[:200]) if r.headers.get("content-type", "").startswith("application/json") else r.text[:200]
            return False, f"WhatsApp API {r.status_code}: {detail}"
        return True, ""
    except httpx.HTTPError as exc:
        return False, f"WhatsApp unreachable: {exc}"


async def send_text(phone: str, text: str) -> tuple[bool, str]:
    return await _post({"to": phone, "type": "text", "text": {"body": text[:MAX_TEXT], "preview_url": False}})


async def send_to_user(username: str, text: str, kind: str) -> tuple[bool, str]:
    """Send to the user's linked number if they want `kind` ("alerts", "in_play", "briefing", "test").

    Inside the 24-hour window a normal message is free-form; outside it Meta requires the approved
    alert template, so without one the message is skipped (it is still in the app).
    """
    if not available():
        return False, "WhatsApp is not configured on this server"
    s = get_state(username)
    phone = s.get("phone")
    if not phone:
        return False, "No WhatsApp number linked"
    if s.get("paused"):
        return False, "WhatsApp messages are paused (the user sent STOP)"
    if kind != "test" and not s["prefs"].get(kind):
        return False, f"The user turned off {kind} on WhatsApp"
    in_window = s.get("last_inbound_at") and time.time() - s["last_inbound_at"] < WINDOW
    if in_window:
        return await send_text(phone, text)
    c = config()
    if not c["template"]:
        return False, "Outside WhatsApp's 24-hour window and no alert template is configured"
    # Template variables can't contain newlines or long runs of spaces
    flat = re.sub(r"\s+", " ", text).strip()[:1000]
    return await _post({"to": phone, "type": "template", "template": {
        "name": c["template"], "language": {"code": c["lang"]},
        "components": [{"type": "body", "parameters": [{"type": "text", "text": flat}]}]}})


# ── Inbound webhook ─────────────────────────────────────────────────────────

def signature_ok(raw: bytes, header: str) -> bool:
    secret = config()["secret"]
    if not secret or not header.startswith("sha256="):
        return False
    want = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, header[7:])


def inbound_messages(payload: dict) -> list[dict]:
    """[{id, from, text}] for the text messages in a webhook payload (statuses and media are ignored)."""
    out = []
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            for m in value.get("messages") or []:
                text = (m.get("text") or {}).get("body") if m.get("type") == "text" else None
                if m.get("type") == "button":
                    text = (m.get("button") or {}).get("text")
                if text and m.get("from"):
                    out.append({"id": m.get("id", ""), "from": re.sub(r"\D", "", m["from"]), "text": text.strip()})
    return out


HELP = ("AssetAdvisor on WhatsApp\n"
        "• Ask anything about markets or your portfolio, e.g. \"How is my portfolio doing?\" or \"What's the RSI on BTC?\"\n"
        "• STOP pauses all messages from AssetAdvisor, START resumes them\n"
        "• UNLINK disconnects this number\n"
        "Alerts, In-Play and the daily briefing are set up under Settings > WhatsApp in the app.")
_seen: dict[str, float] = {}            # message ids handled recently (Meta retries deliveries)
_chat_times: dict[str, list[float]] = {}
CHAT_PER_HOUR = 30


async def handle(message: dict) -> str | None:
    """Process one inbound message; returns the reply text (None: say nothing)."""
    now = time.time()
    if message["id"]:
        for k in [k for k, t in _seen.items() if now - t > 3600]:
            _seen.pop(k, None)
        if message["id"] in _seen:
            return None
        _seen[message["id"]] = now
    phone, text = message["from"], message["text"]
    word = text.upper().split()[0] if text.split() else ""

    m = re.fullmatch(r"\s*LINK\s+(\d{6})\s*", text, flags=re.I)
    if m:
        username = _claim_code(m.group(1), phone)
        if not username:
            return "That code isn't valid or has expired. Open Settings > WhatsApp in AssetAdvisor for a new one."
        return f"This number is now linked to your AssetAdvisor account ({username}).\n\n{HELP}"

    username = username_for(phone)
    if not username:
        return ("This number isn't linked to an AssetAdvisor account yet. In the app, open Settings > WhatsApp "
                "and select Link WhatsApp; it gives you a code to send here.")
    s = get_state(username)
    s["last_inbound_at"] = now
    if word == "STOP":
        s["paused"] = True
        _put_state(username, s)
        return "Paused. AssetAdvisor won't send you anything on WhatsApp until you reply START."
    if word == "START":
        s["paused"] = False
        _put_state(username, s)
        return "Resumed. Alerts and messages you turned on will come here again."
    if word == "UNLINK":
        _put_state(username, s)
        unlink(username)
        return "This number is no longer linked to AssetAdvisor."
    _put_state(username, s)
    if word in ("HELP", "?"):
        return HELP
    if not s["prefs"].get("chat"):
        return "Chat with the assistant is turned off for this number. Turn it on under Settings > WhatsApp in the app."

    recent = [t for t in _chat_times.get(username, []) if now - t < 3600]
    if len(recent) >= CHAT_PER_HOUR:
        return "You've reached the limit of questions for this hour. Please try again a little later."
    _chat_times[username] = recent + [now]

    from api.assistant import respond

    reply, err = await respond(username, text[:4000], channel="whatsapp")
    if err:
        return "Sorry, the assistant is unavailable right now. Please try again in a few minutes."
    out = reply["content"]
    pending = [a for a in reply.get("actions") or [] if a.get("status") == "proposed"]
    if pending:
        out += "\n\nTo do this, confirm it in the app (Assistant): " + "; ".join(a["summary"] for a in pending)
    return out
