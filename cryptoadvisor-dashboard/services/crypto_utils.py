"""Encryption utilities for storing API keys at rest."""

from pathlib import Path
from cryptography.fernet import Fernet
from config import BASE_DIR

_KEY_FILE = BASE_DIR / "data" / "encryption.key"


def _get_key() -> bytes:
    """Encryption key: ASSETADVISOR_ENCRYPTION_KEY (production keeps it with the other credentials, not in
    the data volume or its backups), else the key file (local dev), generated on first use."""
    import os

    env = os.getenv("ASSETADVISOR_ENCRYPTION_KEY")
    if env:
        return env.strip().encode()
    _KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
    if _KEY_FILE.exists():
        return _KEY_FILE.read_bytes()
    key = Fernet.generate_key()
    _KEY_FILE.write_bytes(key)
    return key


_fernet = Fernet(_get_key())


def encrypt(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _fernet.decrypt(ciphertext.encode()).decode()
