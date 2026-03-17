"""TOTP / 2FA service — generate, verify, and manage TOTP secrets per user.

Requires: pyotp (add to requirements.txt)
"""

import pyotp

from services.auth import load_users, save_users


def generate_secret() -> str:
    """Generate a new random TOTP secret."""
    return pyotp.random_base32()


def get_provisioning_uri(secret: str, username: str) -> str:
    """Return an otpauth:// URI suitable for QR code generation."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=username, issuer_name="CryptoAdvisor")


def verify_totp(secret: str, code: str) -> bool:
    """Verify a TOTP code against a secret. Allows +/- 1 time step tolerance."""
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def enable_2fa(username: str) -> dict:
    """Generate a TOTP secret for the user, store it, and return secret + URI.

    Returns dict with 'secret' and 'provisioning_uri'.
    Raises ValueError if user not found.
    """
    users = load_users()
    user = next((u for u in users if u["username"] == username), None)
    if user is None:
        raise ValueError(f"User '{username}' not found")

    secret = generate_secret()
    user["totp_secret"] = secret
    save_users(users)

    return {
        "secret": secret,
        "provisioning_uri": get_provisioning_uri(secret, username),
    }


def disable_2fa(username: str) -> bool:
    """Remove TOTP secret from user. Returns True if it was enabled, False otherwise."""
    users = load_users()
    user = next((u for u in users if u["username"] == username), None)
    if user is None:
        return False

    if "totp_secret" not in user:
        return False

    del user["totp_secret"]
    save_users(users)
    return True


def is_2fa_enabled(username: str) -> bool:
    """Check whether the user has a TOTP secret configured."""
    users = load_users()
    user = next((u for u in users if u["username"] == username), None)
    if user is None:
        return False
    return bool(user.get("totp_secret"))
