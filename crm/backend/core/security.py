"""
JWT creation/verification and password hashing utilities.
"""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext

from config import settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

ALGORITHM = "HS256"


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------

def _make_token(data: dict, expires_delta: timedelta) -> str:
    payload = data.copy()
    jti = str(uuid.uuid4())
    expire = datetime.now(timezone.utc) + expires_delta
    payload.update({"jti": jti, "exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM), jti


def create_access_token(data: dict) -> tuple[str, str]:
    """Returns (encoded_token, jti)."""
    return _make_token(data, timedelta(minutes=15))


def create_refresh_token(data: dict) -> tuple[str, str]:
    """Returns (encoded_token, jti)."""
    return _make_token(data, timedelta(days=7))


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
