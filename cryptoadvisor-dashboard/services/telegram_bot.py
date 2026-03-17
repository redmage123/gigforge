"""Telegram notification service — send alerts and briefings via Telegram Bot API."""

import json
from pathlib import Path

import httpx

from config import DATA_DIR

TELEGRAM_API = "https://api.telegram.org"
CONFIG_FILE = DATA_DIR / "telegram_config.json"


def _load_config() -> dict:
    """Load the full Telegram config file."""
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_config(config: dict) -> None:
    """Persist the full Telegram config file."""
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(config, indent=2))


def get_telegram_config(username: str) -> dict | None:
    """Return the Telegram config for a user, or None if not configured."""
    config = _load_config()
    return config.get(username)


def save_telegram_config(username: str, bot_token: str, chat_id: str) -> None:
    """Save bot_token and chat_id for a user."""
    config = _load_config()
    config[username] = {"bot_token": bot_token, "chat_id": chat_id}
    _save_config(config)


async def send_telegram(chat_id: str, message: str, bot_token: str) -> bool:
    """Send a message via the Telegram Bot API.

    Returns True on success, False on failure.
    """
    url = f"{TELEGRAM_API}/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "Markdown",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=payload)
            data = resp.json()
            return data.get("ok", False)
    except Exception:
        return False


async def send_alert_notification(username: str, alert: dict) -> bool:
    """Format an alert dict and send it to the user's Telegram.

    `alert` should have keys like: coin, condition, current_value, threshold.
    """
    cfg = get_telegram_config(username)
    if not cfg:
        return False

    coin = alert.get("coin", "Unknown")
    condition = alert.get("condition", "triggered")
    current = alert.get("current_value", "?")
    threshold = alert.get("threshold", "?")

    message = (
        f"*Alert Triggered*\n"
        f"Coin: {coin}\n"
        f"Condition: {condition}\n"
        f"Current: {current}\n"
        f"Threshold: {threshold}"
    )
    return await send_telegram(cfg["chat_id"], message, cfg["bot_token"])


async def send_daily_briefing(username: str, briefing: str) -> bool:
    """Send a daily briefing message to the user's Telegram."""
    cfg = get_telegram_config(username)
    if not cfg:
        return False

    message = f"*Daily Crypto Briefing*\n\n{briefing}"
    return await send_telegram(cfg["chat_id"], message, cfg["bot_token"])
