"""Parse agent memory files for portfolio, signals, and watchlist.

Supports per-user data: when a username is provided, reads from the user's
own memory directory first, falling back to the shared agent memory.
"""

import re
from pathlib import Path
from config import MEMORY_DIR, DATA_DIR


def _user_memory_dir(username: str) -> Path:
    """Return the per-user memory directory."""
    return DATA_DIR / "memory" / username


def _resolve_memory_file(filename: str, username: str = "") -> Path | None:
    """Find a memory file: check per-user dir first, then shared MEMORY_DIR."""
    if username:
        user_path = _user_memory_dir(username) / filename
        if user_path.exists():
            return user_path
    shared_path = Path(MEMORY_DIR) / filename
    if shared_path.exists():
        return shared_path
    return None


def _parse_md_table(text: str) -> list[dict]:
    """Parse a markdown table into a list of dicts."""
    lines = [l.strip() for l in text.strip().split("\n") if l.strip() and not l.strip().startswith("---")]
    if len(lines) < 2:
        return []
    # Header
    headers = [h.strip() for h in lines[0].split("|") if h.strip()]
    rows = []
    for line in lines[1:]:
        if set(line.replace("|", "").strip()) <= {"-", " ", ":"}:
            continue
        cells = [c.strip() for c in line.split("|") if c.strip()]
        if len(cells) == len(headers):
            rows.append(dict(zip(headers, cells)))
    return rows


def get_portfolio(username: str = "") -> dict:
    """Read portfolio holdings from memory/portfolio.md.

    Checks the user's memory directory first, then the shared agent memory.
    """
    path = _resolve_memory_file("portfolio.md", username)
    if not path:
        return {"holdings": [], "total_value": 0}
    text = path.read_text()
    holdings = _parse_md_table(text)
    total = sum(float(h.get("Value", h.get("value", "0")).replace("$", "").replace(",", ""))
                for h in holdings if h.get("Value") or h.get("value"))
    return {"holdings": holdings, "total_value": total}


def get_signals(username: str = "") -> list[dict]:
    """Read trading signals from memory/signals.md.

    Checks the user's memory directory first, then the shared agent memory.
    """
    path = _resolve_memory_file("signals.md", username)
    if not path:
        return []
    text = path.read_text()
    return _parse_md_table(text)


def get_watchlist(username: str = "") -> list[dict]:
    """Read watchlist from memory/watchlist.md.

    Checks the user's memory directory first, then the shared agent memory.
    """
    path = _resolve_memory_file("watchlist.md", username)
    if not path:
        return []
    text = path.read_text()
    return _parse_md_table(text)
