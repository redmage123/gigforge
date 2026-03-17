"""Theme management service — per-user dark/light preference."""

import json
from pathlib import Path

from config import DATA_DIR

SETTINGS_DIR = DATA_DIR / "settings"

THEME_COLORS: dict[str, dict[str, str]] = {
    "dark": {
        "--bg": "#0a0e1a",
        "--card": "#111827",
        "--border": "#1e293b",
        "--text": "#e2e8f0",
        "--muted": "#64748b",
        "--primary": "#00d4aa",
        "--accent": "#ef4444",
    },
    "light": {
        "--bg": "#f8fafc",
        "--card": "#ffffff",
        "--border": "#e2e8f0",
        "--text": "#1e293b",
        "--muted": "#94a3b8",
        "--primary": "#00d4aa",
        "--accent": "#ef4444",
    },
}

VALID_THEMES = frozenset(THEME_COLORS.keys())


def _theme_file(username: str) -> Path:
    return SETTINGS_DIR / f"{username}_theme.json"


def get_theme(username: str) -> str:
    """Return the user's theme preference ('dark' or 'light'). Defaults to 'dark'."""
    path = _theme_file(username)
    if not path.exists():
        return "dark"
    try:
        data = json.loads(path.read_text())
        theme = data.get("theme", "dark")
        return theme if theme in VALID_THEMES else "dark"
    except (json.JSONDecodeError, OSError):
        return "dark"


def set_theme(username: str, theme: str) -> None:
    """Save the user's theme preference.

    Raises ValueError if *theme* is not 'dark' or 'light'.
    """
    if theme not in VALID_THEMES:
        raise ValueError(f"Invalid theme '{theme}'. Must be one of: {', '.join(sorted(VALID_THEMES))}")

    SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    _theme_file(username).write_text(json.dumps({"theme": theme}, indent=2))


def get_theme_colors(theme: str) -> dict[str, str]:
    """Return CSS variable values for the given theme.

    Raises ValueError if *theme* is not recognized.
    """
    colors = THEME_COLORS.get(theme)
    if colors is None:
        raise ValueError(f"Unknown theme '{theme}'. Must be one of: {', '.join(sorted(VALID_THEMES))}")
    return dict(colors)
