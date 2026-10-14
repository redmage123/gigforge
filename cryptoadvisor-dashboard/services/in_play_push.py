"""Phone delivery for in-play alerts via ntfy (https://ntfy.sh)."""

import logging
import os

import httpx

from services.user_data import load_user_data

logger = logging.getLogger(__name__)

PHONE_NAMESPACE = "phone_alerts"
# Where tapping a phone alert takes you
APP_URL = os.getenv("CRYPTOADVISOR_PUBLIC_URL", "https://cryptoadvisor.ai-elevate.ai").rstrip("/") + "/notifications"


def get_phone_config(username: str) -> dict:
    cfg = load_user_data(username, PHONE_NAMESPACE)
    return cfg if isinstance(cfg, dict) else {}


def phone_enabled(cfg: dict) -> bool:
    return bool(cfg.get("enabled") and cfg.get("ntfy_topic"))


async def send_ntfy(cfg: dict, title: str, body: str, tags: str, priority: str = "high") -> bool:
    server = (cfg.get("ntfy_server") or "https://ntfy.sh").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{server}/{cfg['ntfy_topic']}",
                content=body.encode(),
                headers={"Title": title.encode("utf-8"), "Tags": tags, "Priority": priority, "Click": APP_URL},
            )
            return resp.status_code < 300
    except httpx.HTTPError as exc:
        logger.warning("in_play: ntfy send failed: %s", exc)
        return False


def catalyst_line(cat: dict | None) -> str:
    if not cat:
        return "News check pending"
    if cat.get("ai_summary"):
        prefix = "Catalyst" if cat["found"] else "No clear catalyst"
        return f"{prefix} (AI): {cat['ai_summary']}"
    if cat["found"]:
        top = next(h for h in cat["headlines"] if h.get("kind") != "price_action")
        return f"Catalyst: {top['title']} ({top['source']})"
    if cat["headlines"]:
        return "No news catalyst found (only price-move coverage)"
    return "No news catalyst found"


def format_push(entry: dict, in_play: list[dict]) -> tuple[str, str, str]:
    arrow = "▲" if entry["direction"] == "bullish" else "▼"
    title = f"{arrow} {entry['base']} in play — {entry['direction']} {entry['change_pct']:+.1f}%"
    lines = [
        f"Volume {entry['volume_ratio']:.1f}x avg · Candle {entry['range_ratio']:.1f}x avg range · Body {entry['body_pct']:.0f}%",
        f"Price ${entry['close']:,.6g} ({'forming' if entry['candle_forming'] else 'closed'} daily candle)",
        catalyst_line(entry.get("catalyst")),
    ]
    others = ", ".join(f"{e['base']}{'▲' if e['direction'] == 'bullish' else '▼'}" for e in in_play[:10])
    lines.append(f"In play ({len(in_play)}): {others}")
    tags = "chart_with_upwards_trend" if entry["direction"] == "bullish" else "chart_with_downwards_trend"
    return title, "\n".join(lines), tags
