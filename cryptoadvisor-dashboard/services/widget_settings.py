"""Dashboard widget layout customization per user."""

import json
from pathlib import Path

from config import DATA_DIR
from services import store

SETTINGS_DIR = DATA_DIR / "settings"

DEFAULT_WIDGETS: list[dict] = [
    {"id": "market_overview",   "name": "Market Overview",   "enabled": True, "order": 0, "size": "large"},
    {"id": "price_cards",       "name": "Price Cards",       "enabled": True, "order": 1, "size": "large"},
    {"id": "favorites",         "name": "Your Watchlist",    "enabled": True, "order": 2, "size": "large"},
    {"id": "fear_greed",        "name": "Fear & Greed Index", "enabled": True, "order": 3, "size": "small"},
    {"id": "dominance",         "name": "Dominance",         "enabled": True, "order": 4, "size": "small"},
    {"id": "volume",            "name": "Volume",            "enabled": True, "order": 5, "size": "medium"},
    {"id": "portfolio_summary", "name": "Portfolio Summary", "enabled": True, "order": 6, "size": "medium"},
    {"id": "alerts_summary",    "name": "Alerts Summary",    "enabled": True, "order": 7, "size": "small"},
    {"id": "recent_trades",     "name": "Recent Activity",   "enabled": True, "order": 8, "size": "medium"},
    {"id": "quick_actions",     "name": "Quick Actions",     "enabled": True, "order": 9, "size": "small"},
]


def _widget_file(username: str) -> Path:
    return SETTINGS_DIR / f"{username}_widgets.json"


def get_default_layout() -> list[dict]:
    """Return a copy of the default widget layout."""
    return [dict(w) for w in DEFAULT_WIDGETS]


def get_layout(username: str) -> list[dict]:
    layout = store.get("widgets", username)
    return layout if isinstance(layout, list) else get_default_layout()


def save_layout(username: str, layout: list[dict]) -> None:
    store.put("widgets", username, layout)
