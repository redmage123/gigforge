"""BACSWN — authentication service (JWT + bcrypt).

What: password hashing, JWT creation/verification, a per-username login lockout, user
lookups/creation and the first-boot admin account.

Why: the login route, the auth middleware and the WebSocket feeds all need the same
token rules and the same password checks; keeping them here keeps one source of truth.

How: passwords are hashed with bcrypt; tokens are HS256 JWTs signed with
``config.JWT_SECRET`` carrying ``sub`` (username), ``role`` and ``exp``. Failed logins
are kept in memory per username; five within five minutes lock that username out.
The lockout is per process and resets on restart.
"""

import secrets
import time
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from config import JWT_ALGORITHM, JWT_EXPIRY_HOURS, JWT_SECRET
from services.database import get_db, db_insert

# ── Secret key (from config — no hardcoded fallback) ─────────────────────
SECRET_KEY = JWT_SECRET


# ── Password helpers ────────────────────────────────────────────────────
def hash_password(plain: str) -> str:
    """Return a salted bcrypt hash of ``plain``."""
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """True if ``plain`` matches the bcrypt ``hashed`` value."""
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── JWT helpers ─────────────────────────────────────────────────────────
def create_token(username: str, role: str = "user") -> str:
    """Sign a JWT for ``username`` with ``role`` that expires after ``JWT_EXPIRY_HOURS``."""
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS)
    payload = {"sub": username, "role": role, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    """Return the token's claims, or None if it is malformed, forged or expired.

    ``JWTError`` is caught on purpose: callers treat None as "not authenticated".
    """
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None


# ── Brute-force protection ──────────────────────────────────────────────
_login_attempts: dict[str, list[float]] = {}
MAX_ATTEMPTS = 5
LOCKOUT_SECONDS = 300


def check_lockout(username: str) -> bool:
    """True if ``username`` has ``MAX_ATTEMPTS`` failures in the last ``LOCKOUT_SECONDS``.

    Also drops failures older than the window.
    """
    attempts = _login_attempts.get(username, [])
    now = time.time()
    attempts = [t for t in attempts if now - t < LOCKOUT_SECONDS]
    _login_attempts[username] = attempts
    return len(attempts) >= MAX_ATTEMPTS


def record_failed_attempt(username: str) -> None:
    """Note a failed login for ``username`` now."""
    _login_attempts.setdefault(username, []).append(time.time())


def clear_attempts(username: str) -> None:
    """Forget failed logins for ``username`` (after a successful login)."""
    _login_attempts.pop(username, None)


# ── User CRUD ───────────────────────────────────────────────────────────
async def authenticate(username: str, password: str) -> dict | None:
    """Return the full user row (including the hash) if the credentials match, else None."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM users WHERE username = ?", [username]
        )
        row = await cursor.fetchone()
        if not row:
            return None
        user = dict(row)
        if not verify_password(password, user["password_hash"]):
            return None
        return user


async def get_user(username: str) -> dict | None:
    """Return the public profile fields of ``username`` (no password hash), or None."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT id, username, role, first_name, last_name, title, department, created_at FROM users WHERE username = ?",
            [username],
        )
        row = await cursor.fetchone()
        return dict(row) if row else None


async def create_user(username: str, password: str, role: str = "user", **extra) -> int:
    """Insert a user with a hashed password and return its id.

    Args:
        extra: other ``users`` columns, e.g. ``first_name``, ``title``, ``department``.
    """
    return await db_insert("users", {
        "username": username,
        "password_hash": hash_password(password),
        "role": role,
        **extra,
    })


async def ensure_default_admin() -> None:
    """On first boot (no users at all), create ``admin`` with a random password.

    The password is printed once to stdout so the operator can read it from the logs.
    """
    async with get_db() as db:
        cursor = await db.execute("SELECT COUNT(*) as cnt FROM users")
        row = await cursor.fetchone()
        if row["cnt"] > 0:
            return

    password = secrets.token_urlsafe(20)
    await create_user(
        username="admin",
        password=password,
        role="admin",
        first_name="BACSWN",
        last_name="Administrator",
        title="System Administrator",
        department="Operations",
    )
    print(f"BACSWN FIRST-BOOT ADMIN PASSWORD: {password}")
