"""Two-factor authentication with authenticator apps (TOTP, RFC 6238) and one-time recovery codes.

Per-user record: document store namespace "mfa", key = username (removed with the account by
store.delete_owner). Fields:
  enabled              True once the user confirmed a code from their app
  secret_enc           TOTP secret, encrypted with ASSETADVISOR_ENCRYPTION_KEY (services.crypto_utils)
  pending_secret_enc   secret shown during setup, until confirmed
  last_step            last accepted 30 s time step: a code is accepted once, and never an older one
  recovery_codes       [{"salt", "hash"}] scrypt hashes of the unused recovery codes
  failures             timestamps of recent wrong codes (per-user rate limit)
The data export drops secret_enc / pending_secret_enc / recovery_codes (api.account_data SECRET_KEYS).

Sign-in: a correct password (or SSO response) for a user with MFA does not start a session; it
starts a challenge: a signed JWT (typ "mfa", 5 minutes) naming a server-side entry in the shared
record "mfa_challenges". The entry allows MAX_CHALLENGE_ATTEMPTS wrong codes and is removed when a
code is accepted, so each challenge completes at most once.

Firm policy: firms.mfa_required ("require two-factor authentication for members") limits members
without MFA to the enrollment endpoints (enrollment_required, enforced in middleware.auth).
firms.idp_mfa ("our identity provider handles MFA") skips the code step for that firm's SAML sign-ins
and counts such a session as meeting that firm's requirement.
"""

import hashlib
import hmac
import re
import secrets
import threading
import time
from datetime import datetime, timezone
from urllib.parse import quote

import pyotp
from jose import JWTError, jwt

from services import audit_events, store

NS = "mfa"
CHALLENGES = "mfa_challenges"
ISSUER = "AssetAdvisor"
STEP_SECONDS = 30
WINDOW = 1                      # accept the previous and next time step too (clock drift)
RECOVERY_CODES = 10
RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"   # no 0/o, 1/l/i
RECOVERY_LEN = 10               # ~49 bits each
CHALLENGE_SECONDS = 300
MAX_CHALLENGE_ATTEMPTS = 5      # wrong codes per sign-in challenge
MAX_USER_FAILURES = 10          # wrong codes per user (all challenges, disable, regenerate) ...
FAILURE_WINDOW = 900            # ... within 15 minutes
CHALLENGE_COOKIE = "mfa_challenge"
CACHE_SECONDS = 15
# Paths a session limited to enrollment may use (firm requires MFA, user has none yet)
# A member who must enroll can still sign out, delete their account or take their data with them
ENROLL_PATHS = ("/api/2fa/", "/api/auth/me", "/api/auth/logout", "/api/auth/delete-account", "/api/account/export")

_cache: dict[tuple, tuple[float, bool]] = {}
_cache_lock = threading.Lock()


class MfaError(Exception):
    """A refused MFA operation. `code` is a closed set used by callers and the frontend:
    invalid_code, reused_code, expired, locked, not_enabled, already_enabled, no_pending, required."""

    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


def _now() -> float:
    return time.time()


def _record(username: str) -> dict:
    r = store.get(NS, username, {})
    return r if isinstance(r, dict) else {}


def _audit(username: str, action: str, ip: str | None = None, **detail) -> None:
    audit_events.record(username, action, ip=ip, target=username, detail=detail or None)


def clear_cache(username: str | None = None) -> None:
    with _cache_lock:
        for k in [k for k in _cache if username is None or k[0] == username]:
            _cache.pop(k, None)


# ── TOTP and recovery codes ────────────────────────────────────────────────

def _encrypt(s: str) -> str:
    from services.crypto_utils import encrypt

    return encrypt(s)


def _decrypt(s: str) -> str:
    from services.crypto_utils import decrypt

    return decrypt(s)


def _match_step(secret: str, code: str, last_step: int | None, now: float) -> tuple[str, int | None]:
    """("ok", step) | ("reused", None) | ("invalid", None). Every window step is compared."""
    totp = pyotp.TOTP(secret)
    current = int(now // STEP_SECONDS)
    found = None
    for step in range(current - WINDOW, current + WINDOW + 1):
        if hmac.compare_digest(totp.generate_otp(step), code) and found is None:
            found = step
    if found is None:
        return "invalid", None
    if last_step is not None and found <= last_step:
        return "reused", None
    return "ok", found


def _hash_recovery(code: str, salt: bytes) -> str:
    return hashlib.scrypt(code.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32).hex()


def _norm_recovery(code: str) -> str:
    return re.sub(r"[\s-]", "", code or "").lower()


def _new_recovery_codes() -> tuple[list[str], list[dict]]:
    plain, hashed = [], []
    for _ in range(RECOVERY_CODES):
        c = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(RECOVERY_LEN))
        salt = secrets.token_bytes(16)
        plain.append(f"{c[:5]}-{c[5:]}")
        hashed.append({"salt": salt.hex(), "hash": _hash_recovery(c, salt)})
    return plain, hashed


def _is_totp_format(code: str) -> bool:
    return bool(re.fullmatch(r"\d{6}", code))


def _recent_failures(rec: dict, now: float) -> list[float]:
    return [t for t in rec.get("failures") or [] if now - t < FAILURE_WINDOW]


def locked(username: str) -> bool:
    return len(_recent_failures(_record(username), _now())) >= MAX_USER_FAILURES


def _consume(username: str, code: str, allow_recovery: bool = True) -> str:
    """Check a code against the user's enabled MFA and use it up, atomically. Returns the factor used
    ("totp" or "recovery"); raises MfaError otherwise (a wrong code is counted as a failure)."""
    code = re.sub(r"\s", "", code or "")
    outcome: dict = {}

    def fn(rec):
        rec = rec if isinstance(rec, dict) else {}
        now = _now()
        fails = _recent_failures(rec, now)
        if not rec.get("enabled") or not rec.get("secret_enc"):
            outcome["r"] = "not_enabled"
            return rec
        if len(fails) >= MAX_USER_FAILURES:
            outcome["r"] = "locked"
            return rec
        if _is_totp_format(code):
            result, step = _match_step(_decrypt(rec["secret_enc"]), code, rec.get("last_step"), now)
            if result == "ok":
                outcome["r"] = "totp"
                return {**rec, "last_step": step, "failures": fails}
            outcome["r"] = result
        elif allow_recovery and code:
            norm = _norm_recovery(code)
            left = list(rec.get("recovery_codes") or [])
            hit = None
            for i, h in enumerate(left):
                if hmac.compare_digest(_hash_recovery(norm, bytes.fromhex(h["salt"])), h["hash"]) and hit is None:
                    hit = i
            if hit is not None:
                left.pop(hit)
                outcome["r"], outcome["left"] = "recovery", len(left)
                return {**rec, "recovery_codes": left, "failures": fails}
            outcome["r"] = "invalid"
        else:
            outcome["r"] = "invalid"
        return {**rec, "failures": fails + [now]}

    store.update(NS, username, fn, {})
    r = outcome["r"]
    if r in ("totp", "recovery"):
        if r == "recovery":
            outcome_left = outcome["left"]
            _audit(username, "mfa.recovery_used", remaining=outcome_left)
        return r
    if r == "not_enabled":
        raise MfaError("not_enabled", "Two-factor authentication isn't turned on for this account.")
    if r == "locked":
        raise MfaError("locked", "Too many wrong codes. Try again in 15 minutes.", 429)
    if r == "reused":
        raise MfaError("reused_code", "That code was already used. Wait for the next code in your app.", 401)
    raise MfaError("invalid_code", "That code isn't right. Check your authenticator app and try again.", 401)


# ── Status, enrollment, disable ────────────────────────────────────────────

def is_enabled(username: str) -> bool:
    return bool(_record(username).get("enabled"))


def status(username: str) -> dict:
    rec = _record(username)
    return {"enabled": bool(rec.get("enabled")), "enabled_at": rec.get("enabled_at"),
            "recovery_codes_left": len(rec.get("recovery_codes") or []) if rec.get("enabled") else 0,
            "setup_pending": bool(rec.get("pending_secret_enc")) and not rec.get("enabled")}


def otpauth_uri(secret: str, username: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=ISSUER)


def begin_setup(username: str) -> dict:
    """New secret for the user to add to their app; not active until confirm_setup."""
    secret = pyotp.random_base32()     # 32 base32 chars = 160 bits

    def fn(rec):
        rec = rec if isinstance(rec, dict) else {}
        if rec.get("enabled"):
            raise MfaError("already_enabled", "Two-factor authentication is already on.", 409)
        return {**rec, "pending_secret_enc": _encrypt(secret), "pending_at": datetime.now(timezone.utc).isoformat()}

    store.update(NS, username, fn, {})
    return {"secret": secret, "otpauth_uri": otpauth_uri(secret, username), "issuer": ISSUER, "account": username,
            "digits": 6, "period": STEP_SECONDS}


def confirm_setup(username: str, code: str, ip: str | None = None) -> list[str]:
    """Turn MFA on after a correct code from the pending secret; returns the recovery codes (shown once)."""
    code = re.sub(r"\s", "", code or "")
    plain, hashed = _new_recovery_codes()
    outcome: dict = {}

    def fn(rec):
        rec = rec if isinstance(rec, dict) else {}
        now = _now()
        fails = _recent_failures(rec, now)
        if rec.get("enabled"):
            outcome["r"] = "already_enabled"
            return rec
        if not rec.get("pending_secret_enc"):
            outcome["r"] = "no_pending"
            return rec
        if len(fails) >= MAX_USER_FAILURES:
            outcome["r"] = "locked"
            return rec
        result, step = ("invalid", None)
        if _is_totp_format(code):
            result, step = _match_step(_decrypt(rec["pending_secret_enc"]), code, None, now)
        if result != "ok":
            outcome["r"] = "invalid"
            return {**rec, "failures": fails + [now]}
        outcome["r"] = "ok"
        return {"enabled": True, "secret_enc": rec["pending_secret_enc"], "last_step": step,
                "enabled_at": datetime.now(timezone.utc).isoformat(), "recovery_codes": hashed, "failures": []}

    store.update(NS, username, fn, {})
    r = outcome["r"]
    if r == "already_enabled":
        raise MfaError("already_enabled", "Two-factor authentication is already on.", 409)
    if r == "no_pending":
        raise MfaError("no_pending", "Start the setup again: no authenticator key is waiting to be confirmed.")
    if r == "locked":
        raise MfaError("locked", "Too many wrong codes. Try again in 15 minutes.", 429)
    if r == "invalid":
        raise MfaError("invalid_code", "That code isn't right. Check the time on your phone and try again.")
    clear_cache(username)
    _audit(username, "mfa.enabled", ip=ip)
    return plain


def regenerate_recovery_codes(username: str, code: str, ip: str | None = None) -> list[str]:
    """Replace all recovery codes after a valid code (authenticator or a recovery code)."""
    try:
        factor = _consume(username, code)
    except MfaError as exc:
        if exc.code in ("invalid_code", "reused_code"):
            _audit(username, "mfa.challenge_failed", ip=ip, context="regenerate_recovery_codes", reason=exc.code)
        raise
    plain, hashed = _new_recovery_codes()
    store.update(NS, username, lambda rec: {**(rec or {}), "recovery_codes": hashed}, {})
    _audit(username, "mfa.recovery_regenerated", ip=ip, factor=factor)
    return plain


def disable(username: str, code: str, ip: str | None = None) -> None:
    """Turn MFA off after a valid code. The caller checks the password and the firm policy."""
    try:
        factor = _consume(username, code)
    except MfaError as exc:
        if exc.code in ("invalid_code", "reused_code"):
            _audit(username, "mfa.challenge_failed", ip=ip, context="disable", reason=exc.code)
        raise
    store.delete(NS, username)
    clear_cache(username)
    _audit(username, "mfa.disabled", ip=ip, factor=factor)


def reset(username: str, actor: str = "support", reason: str = "support_reset", end_sessions: bool = True) -> dict:
    """Support: remove a user's MFA (lost phone and recovery codes) after verifying their identity
    out of band. Ends their sessions so the next sign-in is a fresh one. Audited as mfa.disabled."""
    from services import sessions

    had = is_enabled(username)
    store.delete(NS, username)
    clear_cache(username)
    ended = sessions.revoke_all(username, reason="mfa_reset") if end_sessions else 0
    audit_events.record(actor, "mfa.disabled", target=username,
                        detail={"reason": reason, "was_enabled": had, "sessions_ended": ended})
    return {"username": username, "was_enabled": had, "sessions_ended": ended}


# ── Sign-in challenge ──────────────────────────────────────────────────────

def _secret_key() -> str:
    from services.auth import SECRET_KEY

    return SECRET_KEY


def start_challenge(username: str, method: str, next_path: str = "/", firm_id: str | None = None) -> str:
    """After the first factor: a signed, single-use token for the code step (5 minutes)."""
    jti = secrets.token_urlsafe(18)
    now = _now()
    exp = now + CHALLENGE_SECONDS

    def fn(data):
        data = {k: v for k, v in (data or {}).items() if isinstance(v, dict) and v.get("exp", 0) > now}
        data[jti] = {"u": username, "exp": exp, "attempts": 0, "method": method, "next": next_path or "/",
                     "firm_id": firm_id}
        return data

    store.update(store.SHARED, CHALLENGES, fn, {})
    return jwt.encode({"typ": "mfa", "sub": username, "jti": jti, "exp": int(exp)}, _secret_key(), algorithm="HS256")


def _decode_challenge(token: str) -> dict:
    try:
        p = jwt.decode(token or "", _secret_key(), algorithms=["HS256"])
    except JWTError:
        p = None
    if not p or p.get("typ") != "mfa" or not p.get("jti") or not p.get("sub"):
        raise MfaError("expired", "This sign-in has expired. Sign in again.", 401)
    return p


def complete_challenge(token: str, code: str, ip: str | None = None) -> dict:
    """Check the code for a challenge. On success the challenge is used up and the result says how the
    user signed in: {"username", "method", "next", "firm_id", "factor"}."""
    p = _decode_challenge(token)
    jti, username = p["jti"], p["sub"]
    now = _now()
    entry = (store.get(store.SHARED, CHALLENGES, {}) or {}).get(jti)
    if not entry or entry.get("u") != username or entry.get("exp", 0) <= now:
        raise MfaError("expired", "This sign-in has expired. Sign in again.", 401)
    try:
        factor = _consume(username, code)
    except MfaError as exc:
        if exc.code in ("invalid_code", "reused_code"):
            left: dict = {}

            def bump(data):
                data = dict(data or {})
                e = data.get(jti)
                if e:
                    e = {**e, "attempts": e.get("attempts", 0) + 1}
                    left["n"] = MAX_CHALLENGE_ATTEMPTS - e["attempts"]
                    if e["attempts"] >= MAX_CHALLENGE_ATTEMPTS:
                        data.pop(jti)
                    else:
                        data[jti] = e
                return data

            store.update(store.SHARED, CHALLENGES, bump, {})
            _audit(username, "mfa.challenge_failed", ip=ip, context="sign_in", method=entry.get("method"),
                   reason=exc.code)
            if left.get("n", 0) <= 0:
                raise MfaError("expired", "Too many wrong codes. Sign in again.", 401)
        raise
    taken: dict = {}

    def take(data):
        data = dict(data or {})
        taken["e"] = data.pop(jti, None)
        return data

    store.update(store.SHARED, CHALLENGES, take, {})
    e = taken["e"]
    if not e:  # completed concurrently (or ran out of attempts) in the meantime
        raise MfaError("expired", "This sign-in has expired. Sign in again.", 401)
    return {"username": username, "method": e.get("method") or "password", "next": e.get("next") or "/",
            "firm_id": e.get("firm_id"), "factor": factor}


def set_challenge_cookie(response, token: str, request) -> None:
    from middleware.client_ip import is_https

    response.set_cookie(CHALLENGE_COOKIE, token, max_age=CHALLENGE_SECONDS, httponly=True, samesite="lax",
                        secure=is_https(request.scope), path="/api/auth/login")


def clear_challenge_cookie(response) -> None:
    response.delete_cookie(CHALLENGE_COOKIE, path="/api/auth/login")


def login_redirect(next_path: str) -> str:
    """Where an SSO sign-in goes for the code step (the Login page)."""
    return f"/login?mfa=1&next={quote(next_path or '/', safe='')}"


# ── SSO and firm policy ────────────────────────────────────────────────────

def idp_trusted(firm_id: str | None) -> bool:
    """The firm said its identity provider enforces MFA (applies to that firm's SAML sign-ins)."""
    if not firm_id:
        return False
    from services import firms

    f = firms.get(firm_id)
    return bool(f and f.get("idp_mfa"))


def sso_step_needed(username: str, firm_id: str | None) -> bool:
    """SSO sign-in: ask for the code when the user has MFA, unless the firm's IdP handles MFA."""
    return is_enabled(username) and not idp_trusted(firm_id)


def required_by(username: str) -> list[dict]:
    from services import firms

    return firms.mfa_required_firms(username)


def enrollment_required(payload: dict) -> bool:
    """True when this session belongs to a member of a firm that requires MFA, who hasn't set it up,
    and the sign-in didn't come through an identity provider the firm trusts for MFA. Cached briefly;
    errors propagate (the middleware refuses the request)."""
    username = payload.get("sub") or ""
    trusted = payload.get("idp_mfa_firm")
    key = (username, trusted)
    now = time.monotonic()
    hit = _cache.get(key)
    if hit and now - hit[0] < CACHE_SECONDS:
        return hit[1]
    req = required_by(username)
    need = bool(req) and not is_enabled(username) and any(not (f["id"] == trusted and f["idp_mfa"]) for f in req)
    with _cache_lock:
        _cache[key] = (now, need)
    return need


def path_allowed_during_enrollment(path: str) -> bool:
    return any(path == p.rstrip("/") or path.startswith(p) for p in ENROLL_PATHS)
