"""Authentication service — JWT tokens, bcrypt password hashing, user storage."""

import json
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
from jose import JWTError, jwt

from config import BASE_DIR
from services import store

DATA_DIR = BASE_DIR / "data"
SECRET_FILE = DATA_DIR / "secret.key"

JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "24"))
MIN_PASSWORD = 10  # new passwords; existing ones keep working until changed


def _get_secret_key() -> str:
    """Load or generate a persistent secret key."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if SECRET_FILE.exists():
        return SECRET_FILE.read_text().strip()
    key = secrets.token_hex(32)
    SECRET_FILE.write_text(key)
    return key


# The env var wins (production keeps it with the credentials); only otherwise read/create the key file
SECRET_KEY = os.getenv("JWT_SECRET") or _get_secret_key()

# Brute force protection
_login_attempts: dict[str, list[float]] = {}
MAX_ATTEMPTS = 5
LOCKOUT_SECONDS = 300  # 5 minutes


def check_lockout(username: str) -> bool:
    """Return True if the user is locked out due to too many failed attempts."""
    attempts = _login_attempts.get(username, [])
    # Prune old attempts outside the lockout window
    now = time.time()
    attempts = [t for t in attempts if now - t < LOCKOUT_SECONDS]
    _login_attempts[username] = attempts
    return len(attempts) >= MAX_ATTEMPTS


def record_failed_attempt(username: str) -> None:
    """Record a failed login attempt timestamp."""
    if username not in _login_attempts:
        _login_attempts[username] = []
    _login_attempts[username].append(time.time())


def clear_attempts(username: str) -> None:
    """Clear failed login attempts after successful auth."""
    _login_attempts.pop(username, None)


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def load_users() -> list[dict]:
    return store.get(store.SHARED, "users", [])


def save_users(users: list[dict]) -> None:
    store.put(store.SHARED, "users", users)


def ensure_default_admin() -> None:
    """Create default admin user if no users exist."""
    users = load_users()
    if users:
        return
    users.append({
        "username": "admin",
        "password_hash": hash_password("admin"),
        "role": "admin",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    save_users(users)
    print("WARNING: Default admin user created (admin/admin). Change the password!")


def authenticate(username: str, password: str) -> dict | None:
    """Verify credentials, return user dict or None."""
    if check_lockout(username):
        return None
    for user in load_users():
        if user["username"] == username and verify_password(password, user["password_hash"]):
            clear_attempts(username)
            return {
                "username": user["username"],
                "role": user["role"],
                "first_name": user.get("first_name", ""),
                "last_name": user.get("last_name", ""),
            }
    record_failed_attempt(username)
    return None


def create_token(username: str, role: str = "user", hours: float | None = None, *, ip: str | None = None,
                 user_agent: str | None = None, method: str | None = None) -> str:
    """Start a server-side session and return a signed JWT naming it (lifetime: `hours`,
    default JWT_EXPIRY_HOURS). The token is valid only while the session is (verify_session_token)."""
    from services import sessions

    hours = hours or JWT_EXPIRY_HOURS
    sid = sessions.create(username, hours, ip=ip, user_agent=user_agent, method=method)
    expire = datetime.now(timezone.utc) + timedelta(hours=hours)
    payload = {"sub": username, "role": role, "exp": expire, "sid": sid}
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    """Check the signature and expiry only. Use verify_session_token to authenticate a request."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


def verify_session_token(token: str) -> dict | None:
    """Payload of a valid token whose session is still live (not revoked, not expired), else None.
    Tokens issued before sessions were tracked carry no sid and are refused."""
    from services import sessions

    payload = decode_token(token) if token else None
    if not payload or not sessions.is_active(payload.get("sid"), payload.get("sub")):
        return None
    sessions.touch(payload["sid"])
    return payload
