"""Outbound messages to the user's linked messaging apps (currently WhatsApp).

Callers hand over a title and body; this decides whether the user wants that kind of message there.
Sending happens in the background so a slow messaging API never holds up the alert checker.
"""

import asyncio
import logging

logger = logging.getLogger(__name__)
_tasks: set[asyncio.Task] = set()


def _spawn(coro) -> None:
    try:
        task = asyncio.get_running_loop().create_task(coro)
    except RuntimeError:          # no event loop (called from a script): send inline
        asyncio.run(coro)
        return
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def _send(username: str, text: str, kind: str) -> None:
    from services import whatsapp

    ok, why = await whatsapp.send_to_user(username, text, kind)
    if not ok and not any(s in why for s in ("not configured", "No WhatsApp", "turned off", "Pro plan")):
        logger.info("whatsapp %s to %s not sent: %s", kind, username, why)


def send_alert(username: str, title: str, body: str) -> None:
    """A fired alert (price, RSI, Stochastic RSI)."""
    _spawn(_send(username, f"\U0001F514 {title}\n{body}", "alerts"))


def send_in_play(username: str, title: str, body: str) -> None:
    _spawn(_send(username, f"\U0001F680 {title}\n{body}", "in_play"))


async def send_briefings() -> None:
    """Scheduler (hourly): the daily AI briefing to users who asked for it, at their chosen local hour."""
    import time

    from services import payments, store, whatsapp

    if not whatsapp.available():
        return
    now = time.time()
    due = []
    for username in store.keys(whatsapp.NAMESPACE):
        s = whatsapp.get_state(username)
        p = s["prefs"]
        if not s.get("phone") or s.get("paused") or not p.get("briefing") or not payments.has_whatsapp(username):
            continue
        local = now + p.get("tz_offset_min", 0) * 60
        day = int(local // 86400)
        if int(local % 86400 // 3600) == p.get("briefing_hour", 8) and s.get("briefing_day") != day:
            due.append((username, day))
    if not due:
        return
    text = await _briefing_text()
    if not text:
        return
    for username, day in due:
        ok, why = await whatsapp.send_to_user(username, f"\U0001F4F0 Your AssetAdvisor briefing\n\n{text}", "briefing")
        s = whatsapp.get_state(username)
        s["briefing_day"] = day          # once a day even if sending failed, so it never repeats hourly
        store.put(whatsapp.NAMESPACE, username, s)
        if not ok:
            logger.info("briefing to %s not sent: %s", username, why)


_briefing_cache: dict = {}


async def _briefing_text() -> str:
    """Today's market briefing (the same one as AI Briefing in the app), generated at most every 3 hours."""
    import time

    if _briefing_cache.get("at", 0) > time.time() - 3 * 3600:
        return _briefing_cache["text"]
    try:
        from services import news as news_service
        from services.ai_context import market_headlines, market_snapshot
        from services.ai_news_briefing import generate_daily_briefing

        prices = await market_snapshot()
        try:
            articles = await news_service.get_news(limit=6)
        except Exception:  # noqa: BLE001
            articles = []
        articles = (await market_headlines(8)) + articles
        text = await generate_daily_briefing(prices, articles, {"market_mood": "neutral"})
        text = text if isinstance(text, str) else str(text)
    except Exception as exc:  # noqa: BLE001
        logger.warning("briefing for WhatsApp failed: %s", exc)
        return ""
    _briefing_cache.update(at=time.time(), text=text[:3500])
    return _briefing_cache["text"]
