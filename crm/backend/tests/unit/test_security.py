"""Tests for core/security.py — TDD RED phase (write before implementation)."""
import uuid
from datetime import datetime, timezone

import pytest
from jose import jwt

from core.security import (
    ALGORITHM,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from config import settings


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

def test_hash_password_returns_bcrypt_hash():
    h = hash_password("my-password")
    assert h.startswith("$2b$")


def test_hash_password_uses_cost_12():
    h = hash_password("my-password")
    # $2b$12$ — cost factor is 3rd segment
    parts = h.split("$")
    assert parts[2] == "12"


def test_verify_password_correct():
    h = hash_password("correct-pass")
    assert verify_password("correct-pass", h) is True


def test_verify_password_wrong():
    h = hash_password("correct-pass")
    assert verify_password("wrong-pass", h) is False


# ---------------------------------------------------------------------------
# Access token
# ---------------------------------------------------------------------------

def test_create_access_token_returns_tuple():
    token, jti = create_access_token({"sub": "user-id"})
    assert isinstance(token, str)
    assert isinstance(jti, str)


def test_access_token_contains_jti_claim():
    token, jti = create_access_token({"sub": "user-id"})
    payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    assert payload["jti"] == jti


def test_access_token_contains_sub():
    token, _ = create_access_token({"sub": "my-user"})
    payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    assert payload["sub"] == "my-user"


def test_access_token_expires_in_15_minutes():
    token, _ = create_access_token({"sub": "user"})
    payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    iat = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
    delta = (exp - iat).total_seconds()
    assert 890 <= delta <= 910  # ~15 min


# ---------------------------------------------------------------------------
# Refresh token
# ---------------------------------------------------------------------------

def test_create_refresh_token_returns_tuple():
    token, jti = create_refresh_token({"sub": "user-id"})
    assert isinstance(token, str)
    assert isinstance(jti, str)


def test_refresh_token_expires_in_7_days():
    token, _ = create_refresh_token({"sub": "user"})
    payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    iat = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
    delta = (exp - iat).total_seconds()
    assert 7 * 24 * 3600 - 10 <= delta <= 7 * 24 * 3600 + 10


# ---------------------------------------------------------------------------
# decode_token
# ---------------------------------------------------------------------------

def test_decode_token_valid():
    token, _ = create_access_token({"sub": "abc"})
    payload = decode_token(token)
    assert payload["sub"] == "abc"


def test_decode_token_invalid_raises_401():
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        decode_token("not.a.valid.token")
    assert exc.value.status_code == 401


def test_decode_token_tampered_raises_401():
    from fastapi import HTTPException
    token, _ = create_access_token({"sub": "user"})
    tampered = token[:-5] + "XXXXX"
    with pytest.raises(HTTPException) as exc:
        decode_token(tampered)
    assert exc.value.status_code == 401
