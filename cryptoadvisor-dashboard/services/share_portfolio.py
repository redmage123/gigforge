"""Shareable portfolio snapshots — generate, retrieve, and revoke share links."""

import json
import secrets
from datetime import datetime
from pathlib import Path

from config import DATA_DIR

SHARES_FILE = DATA_DIR / "shared_portfolios.json"


def _load_shares() -> dict:
    """Load all share data from disk."""
    if SHARES_FILE.exists():
        try:
            return json.loads(SHARES_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_shares(data: dict) -> None:
    """Persist share data to disk."""
    SHARES_FILE.parent.mkdir(parents=True, exist_ok=True)
    SHARES_FILE.write_text(json.dumps(data, indent=2, default=str))


def generate_share_token(username: str, holdings: list[dict], total_value: float) -> str:
    """Create a unique share token for a portfolio snapshot.

    `holdings` — list of dicts with coin, amount, value_usd (no sensitive data).
    Returns the share token string.
    """
    token = secrets.token_urlsafe(24)
    shares = _load_shares()

    # Store under token -> data mapping
    shares[token] = {
        "username": username,
        "holdings": holdings,
        "total_value": total_value,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "last_updated": datetime.utcnow().isoformat() + "Z",
    }
    _save_shares(shares)
    return token


def get_shared_portfolio(token: str) -> dict | None:
    """Retrieve a shared portfolio by its token. Returns None if not found."""
    shares = _load_shares()
    return shares.get(token)


def revoke_share(username: str, token: str) -> bool:
    """Remove a share link. Returns True if revoked, False if not found or unauthorized."""
    shares = _load_shares()
    entry = shares.get(token)
    if not entry or entry.get("username") != username:
        return False
    del shares[token]
    _save_shares(shares)
    return True


def get_user_shares(username: str) -> list[dict]:
    """List all active share links for a user."""
    shares = _load_shares()
    result: list[dict] = []
    for token, data in shares.items():
        if data.get("username") == username:
            result.append({
                "token": token,
                "total_value": data.get("total_value"),
                "holdings_count": len(data.get("holdings", [])),
                "created_at": data.get("created_at"),
                "last_updated": data.get("last_updated"),
            })
    return result
