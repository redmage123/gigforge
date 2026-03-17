"""Technical dashboard layout customization per user."""

import json
from pathlib import Path
from config import DATA_DIR

SETTINGS_DIR = DATA_DIR / "settings"

AVAILABLE_INDICATORS = [
    {"id": "candlestick", "name": "Candlestick Chart", "type": "plotly", "endpoint": "/api/charts/candlestick"},
    {"id": "rsi", "name": "RSI (Relative Strength Index)", "type": "image", "endpoint": "/api/charts/technical", "params": {"indicator": "rsi"}},
    {"id": "macd", "name": "MACD", "type": "image", "endpoint": "/api/charts/technical", "params": {"indicator": "macd"}},
    {"id": "bollinger", "name": "Bollinger Bands", "type": "image", "endpoint": "/api/charts/technical", "params": {"indicator": "bollinger"}},
]

DEFAULT_LAYOUT = [
    {"i": "candlestick", "x": 0, "y": 0, "w": 12, "h": 7, "label": "Candlestick Chart", "indicatorId": "candlestick"},
    {"i": "rsi-1", "x": 0, "y": 7, "w": 4, "h": 4, "label": "RSI", "indicatorId": "rsi"},
    {"i": "macd-1", "x": 4, "y": 7, "w": 4, "h": 4, "label": "MACD", "indicatorId": "macd"},
    {"i": "bollinger-1", "x": 8, "y": 7, "w": 4, "h": 4, "label": "Bollinger Bands", "indicatorId": "bollinger"},
]


def _layout_file(username: str) -> Path:
    return SETTINGS_DIR / f"{username}_technical_layout.json"


def get_technical_layout(username: str) -> list[dict]:
    path = _layout_file(username)
    if not path.exists():
        return [dict(w) for w in DEFAULT_LAYOUT]
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return [dict(w) for w in DEFAULT_LAYOUT]


def save_technical_layout(username: str, layout: list[dict]) -> None:
    SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    _layout_file(username).write_text(json.dumps(layout, indent=2))
