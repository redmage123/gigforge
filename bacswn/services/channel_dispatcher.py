"""BACSWN — Multi-channel emergency alert dispatcher.

Dispatches alerts to WhatsApp, Telegram, Slack, Discord, SMS, Email.
For the demo, all channels are simulated with realistic logging.
"""

import logging
from datetime import datetime, timezone
from services.database import db_insert

logger = logging.getLogger("bacswn.dispatch")

CHANNELS = [
    {"type": "whatsapp", "name": "BACSWN Emergency Group", "icon": "📱"},
    {"type": "whatsapp", "name": "Nassau ATC Group", "icon": "📱"},
    {"type": "whatsapp", "name": "Freeport ATC Group", "icon": "📱"},
    {"type": "telegram", "name": "BACSWN Alerts Channel", "icon": "✈️"},
    {"type": "telegram", "name": "Aviation Safety Bot", "icon": "✈️"},
    {"type": "slack", "name": "#bacswn-emergency", "icon": "💬"},
    {"type": "slack", "name": "#aviation-ops", "icon": "💬"},
    {"type": "slack", "name": "#weather-alerts", "icon": "💬"},
    {"type": "discord", "name": "BACSWN Emergency Server", "icon": "🎮"},
    {"type": "discord", "name": "Pilot Briefing Channel", "icon": "🎮"},
    {"type": "email", "name": "BCAA Operations", "icon": "📧"},
    {"type": "email", "name": "Met Office Duty Forecaster", "icon": "📧"},
    {"type": "email", "name": "NEMA Emergency Management", "icon": "📧"},
    {"type": "email", "name": "Airport Authority Nassau", "icon": "📧"},
    {"type": "email", "name": "Airport Authority Freeport", "icon": "📧"},
    {"type": "sms", "name": "BCAA Director", "icon": "📲"},
    {"type": "sms", "name": "Chief Meteorologist", "icon": "📲"},
    {"type": "sms", "name": "ATC Supervisor MYNN", "icon": "📲"},
    {"type": "sms", "name": "ATC Supervisor MYGF", "icon": "📲"},
    {"type": "sms", "name": "NEMA Director", "icon": "📲"},
    {"type": "radio", "name": "Nassau ATIS 128.00", "icon": "📻"},
    {"type": "radio", "name": "Freeport ATIS 127.45", "icon": "📻"},
    {"type": "radio", "name": "Nassau Approach 124.20", "icon": "📻"},
    {"type": "pager", "name": "On-Call Meteorologist", "icon": "📟"},
    {"type": "pager", "name": "On-Call ATC Supervisor", "icon": "📟"},
    {"type": "webhook", "name": "ICAO SADIS Gateway", "icon": "🌐"},
    {"type": "webhook", "name": "WMO GTS Feed", "icon": "🌐"},
    {"type": "webhook", "name": "US FAA NOTAM System", "icon": "🌐"},
    {"type": "webhook", "name": "Caribbean Aviation Safety", "icon": "🌐"},
    {"type": "display", "name": "MYNN Departure Board", "icon": "🖥️"},
    {"type": "display", "name": "MYNN Arrival Board", "icon": "🖥️"},
    {"type": "display", "name": "MYGF Departure Board", "icon": "🖥️"},
    {"type": "display", "name": "MYGF Arrival Board", "icon": "🖥️"},
    {"type": "display", "name": "Met Office Wall Display", "icon": "🖥️"},
    {"type": "app_push", "name": "BACSWN Mobile App (iOS)", "icon": "📲"},
    {"type": "app_push", "name": "BACSWN Mobile App (Android)", "icon": "📲"},
    {"type": "app_push", "name": "Pilot Briefing App", "icon": "📲"},
    {"type": "social", "name": "Twitter/X @BACSWN_Alerts", "icon": "🐦"},
    {"type": "social", "name": "Facebook BCAA Page", "icon": "📘"},
    {"type": "p2p", "name": "Zello Aviation Emergency", "icon": "📡"},
    {"type": "satellite", "name": "COSPAS-SARSAT Relay", "icon": "🛰️"},
]


async def dispatch_alert(
    subject: str,
    body: str,
    severity: str = "warning",
    channel_types: list[str] | None = None,
) -> list[dict]:
    """Dispatch an alert to all configured channels.

    Returns list of dispatch results.
    """
    results = []
    now = datetime.now(timezone.utc).isoformat()

    for channel in CHANNELS:
        if channel_types and channel["type"] not in channel_types:
            continue

        status = "sent"
        result = {
            "channel_type": channel["type"],
            "channel_name": channel["name"],
            "icon": channel["icon"],
            "status": status,
            "sent_at": now,
        }
        results.append(result)

        # Log to database
        await db_insert("channel_messages", {
            "channel_type": channel["type"],
            "channel_name": channel["name"],
            "message_type": severity,
            "subject": subject,
            "body": body,
            "status": status,
            "sent_at": now,
        })

    logger.info(f"Dispatched alert to {len(results)} channels: {subject}")
    return results


async def dispatch_to_all(subject: str, body: str, severity: str = "warning") -> list[dict]:
    """Convenience wrapper to dispatch to all channels."""
    return await dispatch_alert(subject, body, severity)


def get_channel_summary() -> dict:
    """Get summary of available channels by type."""
    summary = {}
    for ch in CHANNELS:
        t = ch["type"]
        summary.setdefault(t, {"count": 0, "channels": []})
        summary[t]["count"] += 1
        summary[t]["channels"].append(ch["name"])
    return {
        "total_channels": len(CHANNELS),
        "by_type": summary,
    }
