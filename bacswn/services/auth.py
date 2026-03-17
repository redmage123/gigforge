"""BACSWN — Authentication service (JWT + bcrypt)."""

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
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── JWT helpers ─────────────────────────────────────────────────────────
def create_token(username: str, role: str = "user") -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS)
    payload = {"sub": username, "role": role, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None


# ── Brute-force protection ──────────────────────────────────────────────
_login_attempts: dict[str, list[float]] = {}
MAX_ATTEMPTS = 5
LOCKOUT_SECONDS = 300


def check_lockout(username: str) -> bool:
    attempts = _login_attempts.get(username, [])
    now = time.time()
    attempts = [t for t in attempts if now - t < LOCKOUT_SECONDS]
    _login_attempts[username] = attempts
    return len(attempts) >= MAX_ATTEMPTS


def record_failed_attempt(username: str) -> None:
    _login_attempts.setdefault(username, []).append(time.time())


def clear_attempts(username: str) -> None:
    _login_attempts.pop(username, None)


# ── User CRUD ───────────────────────────────────────────────────────────
async def authenticate(username: str, password: str) -> dict | None:
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
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT id, username, role, first_name, last_name, title, department, created_at FROM users WHERE username = ?",
            [username],
        )
        row = await cursor.fetchone()
        return dict(row) if row else None


async def create_user(username: str, password: str, role: str = "user", **extra) -> int:
    return await db_insert("users", {
        "username": username,
        "password_hash": hash_password(password),
        "role": role,
        **extra,
    })


async def ensure_default_admin() -> None:
    """First-boot: create admin with random password if no users exist."""
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
