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

DATA_DIR = BASE_DIR / "data"
USERS_FILE = DATA_DIR / "users.json"
SECRET_FILE = DATA_DIR / "secret.key"

JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "24"))


def _get_secret_key() -> str:
    """Load or generate a persistent secret key."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if SECRET_FILE.exists():
        return SECRET_FILE.read_text().strip()
    key = secrets.token_hex(32)
    SECRET_FILE.write_text(key)
    return key


SECRET_KEY = os.getenv("JWT_SECRET", _get_secret_key())

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
    if not USERS_FILE.exists():
        return []
    return json.loads(USERS_FILE.read_text())


def save_users(users: list[dict]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    USERS_FILE.write_text(json.dumps(users, indent=2))


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


def create_token(username: str, role: str = "user") -> str:
    """Create a signed JWT token."""
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS)
    payload = {"sub": username, "role": role, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    """Decode and validate a JWT token. Returns payload or None."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None
