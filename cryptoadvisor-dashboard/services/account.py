"""Account deletion (GDPR right to erasure): remove every piece of a user's data.

Where user data lives:
  * data/<namespace>/<username>.json — trades, alerts, favorites, rules, settings, ... (any namespace)
  * data/settings/<username>_*.json, data/memory/<username>/, data/users/<username>/
  * shared files keyed by user: users.json, sessions.json, shared_portfolios.json,
    push_subscriptions.json, telegram_config.json, in_play_candidates.json (matched users)
  * SQLite user_memories (AI memory facts)
The security audit log keeps its entries but the username is replaced, so the trail stays intact
without identifying the person.
"""

import json
import logging
import shutil

from services.sanitize import sanitize_filename
from services.user_data import DATA_DIR

logger = logging.getLogger(__name__)
ANON = "deleted-user"


def _rewrite_json(name: str, fn) -> int:
    """Load data/<name>.json, apply fn(data) -> (new_data, changed_count), save if changed."""
    path = DATA_DIR / f"{name}.json"
    if not path.exists():
        return 0
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return 0
    new, changed = fn(data)
    if changed:
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(new, indent=2))
        tmp.replace(path)
    return changed


def _drop_user_rows(username: str):
    def fn(data):
        if isinstance(data, list):
            kept = [x for x in data if not (isinstance(x, dict) and username in (x.get("username"), x.get("user"), x.get("sub")))]
            return kept, len(data) - len(kept)
        if isinstance(data, dict):
            if username in data:
                return {k: v for k, v in data.items() if k != username}, 1
            kept = {k: v for k, v in data.items() if not (isinstance(v, dict) and v.get("username") == username)}
            return kept, len(data) - len(kept)
        return data, 0
    return fn


async def delete_account(username: str) -> dict:
    user = sanitize_filename(username)
    if not user or user != username:
        raise ValueError("invalid username")
    removed = {"files": 0, "records": 0, "memories": 0}

    # Per-user files in every namespace folder, plus per-user folders
    for ns in DATA_DIR.iterdir():
        if not ns.is_dir():
            continue
        f = ns / f"{user}.json"
        if f.is_file():
            f.unlink()
            removed["files"] += 1
    settings = DATA_DIR / "settings"
    if settings.is_dir():
        for f in settings.glob(f"{user}_*.json"):
            f.unlink()
            removed["files"] += 1
    for d in (DATA_DIR / "memory" / user, DATA_DIR / "users" / user):
        if d.is_dir():
            shutil.rmtree(d)
            removed["files"] += 1

    # Shared files keyed by user
    for name in ("sessions", "shared_portfolios", "push_subscriptions", "telegram_config"):
        removed["records"] += _rewrite_json(name, _drop_user_rows(user))

    def unmatch(data):
        n = 0
        for c in (data.values() if isinstance(data, dict) else []):
            if isinstance(c, dict) and user in (c.get("matched") or {}):
                del c["matched"][user]
                n += 1
        return data, n
    removed["records"] += _rewrite_json("in_play_candidates", unmatch)

    def anonymize(data):
        n = 0
        for e in data if isinstance(data, list) else []:
            if isinstance(e, dict) and e.get("username") == user:
                e["username"] = ANON
                n += 1
        return data, n
    removed["records"] += _rewrite_json("audit_log", anonymize)

    # AI memory facts
    try:
        from services.database import get_db

        async with get_db() as db:
            cur = await db.execute("DELETE FROM user_memories WHERE username = ?", (user,))
            await db.commit()
            removed["memories"] = cur.rowcount or 0
    except Exception as exc:  # noqa: BLE001 — table may not exist on a fresh install
        logger.warning("delete_account(%s): memory cleanup failed: %s", user, exc)

    # Finally the login itself
    removed["records"] += _rewrite_json("users", _drop_user_rows(user))
    logger.info("account deleted: %s %s", user, removed)
    return removed
