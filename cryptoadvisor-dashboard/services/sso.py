"""Single sign-on: Google and Microsoft (OpenID Connect) and per-firm SAML 2.0.

OpenID Connect (authorization code + PKCE, state, nonce). The ID token's signature is checked against
the provider's published keys (JWKS), plus issuer, audience, expiry and nonce.
  * Enabled per provider by GOOGLE_OIDC_CLIENT_ID/SECRET and MICROSOFT_OIDC_CLIENT_ID/SECRET.
  * An identity signs in to the account it was linked to (Settings → Connect).
  * Google accounts with a verified email in a firm's SSO domains are created on first sign-in
    (just-in-time) and added to that firm with its default role. Microsoft doesn't guarantee
    verified email claims, so Microsoft sign-in only works for linked identities; firms on
    Microsoft Entra ID should use SAML for automatic accounts.

SAML 2.0 (per firm, SP-initiated, HTTP-Redirect request, HTTP-POST response). The firm admin enters
the IdP's entity ID, sign-in URL and signing certificate. Only data inside the XML-signature-verified
element is used (defends against signature wrapping); issuer, audience, recipient, validity window,
InResponseTo and one-time use of each assertion are enforced.
"""

import base64
import hashlib
import json
import os
import re
import secrets
import time
import urllib.parse
import zlib
from datetime import datetime, timedelta, timezone

import httpx

from services import audit_events, db, firms

STATE_TTL = 600  # seconds a sign-in may take
CLOCK_SKEW = timedelta(minutes=3)


class SSOError(Exception):
    pass


def public_url() -> str:
    return (os.getenv("ASSETADVISOR_PUBLIC_URL") or os.getenv("CRYPTOADVISOR_PUBLIC_URL")
            or "https://assetadvisor.ai-elevate.ai").rstrip("/")


# ── Pending sign-in state ──────────────────────────────────────────────────

def _save_state(data: dict) -> str:
    state = secrets.token_urlsafe(24)
    with db.conn() as c:
        c.execute("DELETE FROM sso_states WHERE created_at < now() - interval '1 hour'")
        c.execute("INSERT INTO sso_states (state, data) VALUES (%s, %s::jsonb)", (state, json.dumps(data)))
        c.commit()
    return state


def _take_state(state: str) -> dict:
    """One-time: the state row is deleted as it is read."""
    with db.conn() as c:
        r = c.execute("DELETE FROM sso_states WHERE state = %s RETURNING data, created_at", (state or "",)).fetchone()
        c.commit()
    if not r or (datetime.now(timezone.utc) - r[1]).total_seconds() > STATE_TTL:
        raise SSOError("This sign-in link expired or was already used. Please start again.")
    return r[0]


def _safe_next(path: str | None) -> str:
    return path if path and re.fullmatch(r"/[A-Za-z0-9/_\-?=&.%]*", path) and not path.startswith("//") else "/"


# ── Identities and accounts ────────────────────────────────────────────────

def linked_user(provider: str, subject: str) -> str | None:
    with db.conn() as c:
        r = c.execute("UPDATE identities SET last_used = now() WHERE provider = %s AND subject = %s RETURNING username",
                      (provider, subject)).fetchone()
        c.commit()
    return r[0] if r else None


def link(username: str, provider: str, subject: str, email: str | None) -> None:
    with db.conn() as c:
        r = c.execute("SELECT username FROM identities WHERE provider = %s AND subject = %s", (provider, subject)).fetchone()
        if r and r[0] != username:
            raise SSOError("That sign-in is already connected to a different AssetAdvisor account.")
        c.execute("INSERT INTO identities (provider, subject, username, email) VALUES (%s, %s, %s, %s) "
                  "ON CONFLICT (provider, subject) DO UPDATE SET email = EXCLUDED.email", (provider, subject, username, email))
        c.commit()
    audit_events.record(username, "sso.link", target=provider, detail={"email": email})


def identities_of(username: str) -> list[dict]:
    if not db.available():
        return []
    with db.conn() as c:
        rows = c.execute("SELECT provider, email, linked_at, last_used FROM identities WHERE username = %s ORDER BY provider",
                         (username,)).fetchall()
    return [{"provider": r[0], "email": r[1], "linked_at": r[2].isoformat(), "last_used": r[3].isoformat() if r[3] else None}
            for r in rows]


def unlink(username: str, provider: str) -> None:
    with db.conn() as c:
        c.execute("DELETE FROM identities WHERE username = %s AND provider = %s", (username, provider))
        c.commit()
    audit_events.record(username, "sso.unlink", target=provider)


def _provision(email: str, first: str, last: str, firm_id: str, provider: str, subject: str) -> str:
    """Just-in-time account for a firm SSO user. The password is random and unusable: SSO only."""
    from services.auth import hash_password, load_users
    from services.user_data import update_shared_data

    base = re.sub(r"[^a-z0-9_-]", "", email.split("@")[0].lower())[:24] or "user"
    taken = {u["username"] for u in load_users()}
    name, n = base if len(base) >= 3 else base + "-sso", 1
    while name in taken:
        n += 1
        name = f"{base}-{n}"
    rec = {"username": name, "first_name": first or base, "last_name": last or "", "role": "user",
           "password_hash": hash_password(secrets.token_urlsafe(32)), "sso_only": True, "email": email,
           "created_at": datetime.now(timezone.utc).isoformat()}
    update_shared_data("users", lambda users: (users or []) + [rec], [])
    link(name, provider, subject, email)
    firms.add_jit_member(firm_id, name)
    audit_events.record(name, "account.create_sso", firm_id=firm_id, target=name, detail={"provider": provider, "email": email})
    return name


def _firm_for_domain(email: str) -> dict | None:
    dom = email.rsplit("@", 1)[-1].lower() if "@" in email else ""
    if not dom:
        return None
    with db.conn() as c:
        r = c.execute("SELECT id FROM firms WHERE %s = ANY(sso_domains) ORDER BY created_at LIMIT 1", (dom,)).fetchone()
    return firms.get(r[0]) if r else None


# ── OpenID Connect ─────────────────────────────────────────────────────────

OIDC = {
    "google": {"discovery": "https://accounts.google.com/.well-known/openid-configuration",
               "issuers": ("https://accounts.google.com", "accounts.google.com"), "label": "Google"},
    "microsoft": {"discovery": "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration",
                  "issuers": None, "label": "Microsoft"},  # per-tenant issuer, checked against the tid claim
}
_discovery_cache: dict[str, tuple[float, dict]] = {}


def _client(provider: str) -> tuple[str, str] | None:
    p = provider.upper()
    cid, secret = os.getenv(f"{p}_OIDC_CLIENT_ID"), os.getenv(f"{p}_OIDC_CLIENT_SECRET")
    return (cid, secret) if cid and secret else None


def enabled_providers() -> list[dict]:
    return [{"id": k, "label": v["label"]} for k, v in OIDC.items() if _client(k)] if db.available() else []


async def _discovery(provider: str) -> dict:
    hit = _discovery_cache.get(provider)
    if hit and time.time() - hit[0] < 3600:
        return hit[1]
    async with httpx.AsyncClient(timeout=10) as c:
        doc = (await c.get(OIDC[provider]["discovery"])).raise_for_status().json()
        doc["_jwks"] = (await c.get(doc["jwks_uri"])).raise_for_status().json()
    _discovery_cache[provider] = (time.time(), doc)
    return doc


def redirect_uri(provider: str) -> str:
    return f"{public_url()}/api/sso/oidc/{provider}/callback"


async def oidc_start(provider: str, intent: str, username: str | None = None, next_path: str | None = None) -> str:
    if provider not in OIDC or not _client(provider):
        raise SSOError("That sign-in method isn't set up.")
    cid, _ = _client(provider)
    doc = await _discovery(provider)
    verifier = secrets.token_urlsafe(48)
    nonce = secrets.token_urlsafe(16)
    state = _save_state({"kind": "oidc", "provider": provider, "intent": intent, "username": username,
                         "verifier": verifier, "nonce": nonce, "next": _safe_next(next_path)})
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    q = {"client_id": cid, "response_type": "code", "scope": "openid email profile", "redirect_uri": redirect_uri(provider),
         "state": state, "nonce": nonce, "code_challenge": challenge, "code_challenge_method": "S256", "prompt": "select_account"}
    return doc["authorization_endpoint"] + "?" + urllib.parse.urlencode(q)


def verify_id_token(provider: str, token: str, jwks: dict, client_id: str, nonce: str) -> dict:
    from jose import jwt
    from jose.exceptions import JWTError

    try:
        header = jwt.get_unverified_header(token)
    except JWTError:
        raise SSOError("The sign-in response was malformed.")
    if header.get("alg") not in ("RS256",):
        raise SSOError("Unexpected token algorithm.")
    key = next((k for k in jwks.get("keys", []) if k.get("kid") == header.get("kid")), None)
    if not key:
        raise SSOError("Unknown signing key; please try again.")
    try:
        claims = jwt.decode(token, key, algorithms=["RS256"], audience=client_id,
                            options={"verify_iss": False, "verify_at_hash": False})
    except JWTError as exc:
        raise SSOError(f"The sign-in token is not valid ({exc}).")
    issuers = OIDC[provider]["issuers"] or (f"https://login.microsoftonline.com/{claims.get('tid')}/v2.0",)
    if claims.get("iss") not in issuers:
        raise SSOError("The sign-in token came from an unexpected issuer.")
    if not secrets.compare_digest(str(claims.get("nonce") or ""), nonce):
        raise SSOError("The sign-in response didn't match this browser session.")
    return claims


async def oidc_callback(provider: str, code: str, state: str) -> dict:
    """Returns {"username": …, "next": …} to sign in, or {"linked": provider, "next": …}."""
    st = _take_state(state)
    if st.get("kind") != "oidc" or st.get("provider") != provider:
        raise SSOError("The sign-in response didn't match this request.")
    cid, secret = _client(provider) or (None, None)
    if not cid:
        raise SSOError("That sign-in method isn't set up.")
    doc = await _discovery(provider)
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(doc["token_endpoint"], data={
            "grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri(provider),
            "client_id": cid, "client_secret": secret, "code_verifier": st["verifier"]})
    if r.status_code != 200 or "id_token" not in r.json():
        raise SSOError("The sign-in provider refused the request.")
    claims = verify_id_token(provider, r.json()["id_token"], doc["_jwks"], cid, st["nonce"])
    subject = claims["sub"] if provider == "google" else f"{claims.get('tid')}:{claims.get('oid') or claims['sub']}"
    email = (claims.get("email") or claims.get("preferred_username") or "").lower() or None
    if st["intent"] == "link":
        link(st["username"], provider, subject, email)
        return {"linked": provider, "next": st["next"]}
    user = linked_user(provider, subject)
    if not user and provider == "google" and email and claims.get("email_verified") is True:
        firm = _firm_for_domain(email)
        if firm:
            user = _provision(email, claims.get("given_name", ""), claims.get("family_name", ""), firm["id"], provider, subject)
    if not user:
        raise SSOError(f"No AssetAdvisor account is connected to this {OIDC[provider]['label']} account. Sign in with your "
                       "password and connect it under Settings, or ask your firm admin.")
    return {"username": user, "next": st["next"], "provider": provider}


# ── SAML 2.0 ───────────────────────────────────────────────────────────────

NS = {"samlp": "urn:oasis:names:tc:SAML:2.0:protocol", "saml": "urn:oasis:names:tc:SAML:2.0:assertion",
      "ds": "http://www.w3.org/2000/09/xmldsig#"}


def sp_entity_id(slug: str) -> str:
    return f"{public_url()}/api/sso/saml/{slug}/metadata"


def acs_url(slug: str) -> str:
    return f"{public_url()}/api/sso/saml/{slug}/acs"


def sp_metadata(slug: str) -> str:
    return (f'<?xml version="1.0"?>\n<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="{sp_entity_id(slug)}">'
            '<md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" '
            'protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">'
            '<md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>'
            f'<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="{acs_url(slug)}" index="0"/>'
            '</md:SPSSODescriptor></md:EntityDescriptor>')


def _pem(cert: str) -> str:
    body = re.sub(r"-----(BEGIN|END) CERTIFICATE-----|\s", "", cert or "")
    if not re.fullmatch(r"[A-Za-z0-9+/=]{200,}", body):
        raise SSOError("The certificate should be a PEM or base64 X.509 certificate.")
    lines = "\n".join(body[i:i + 64] for i in range(0, len(body), 64))
    pem = f"-----BEGIN CERTIFICATE-----\n{lines}\n-----END CERTIFICATE-----\n"
    from cryptography import x509

    try:
        x509.load_pem_x509_certificate(pem.encode())
    except ValueError:
        raise SSOError("That certificate couldn't be read.")
    return pem


def save_saml_config(username: str, firm_id: str, entity_id: str, sso_url: str, cert: str, email_attribute: str = "",
                     enabled: bool = True) -> dict:
    firms.require(username, firm_id, ("admin",))
    if not entity_id.strip():
        raise SSOError("Enter the identity provider's entity ID.")
    if not re.fullmatch(r"https://[^\s]+", sso_url.strip()):
        raise SSOError("The sign-in URL must start with https://")
    pem = _pem(cert)
    with db.conn() as c:
        c.execute("INSERT INTO saml_configs (firm_id, idp_entity_id, idp_sso_url, idp_cert_pem, email_attribute, enabled, updated_by) "
                  "VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (firm_id) DO UPDATE SET idp_entity_id = EXCLUDED.idp_entity_id, "
                  "idp_sso_url = EXCLUDED.idp_sso_url, idp_cert_pem = EXCLUDED.idp_cert_pem, email_attribute = EXCLUDED.email_attribute, "
                  "enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()",
                  (firm_id, entity_id.strip(), sso_url.strip(), pem, email_attribute.strip(), enabled, username))
        c.commit()
    audit_events.record(username, "sso.saml_config", firm_id=firm_id, target=firm_id,
                        detail={"entity_id": entity_id.strip(), "sso_url": sso_url.strip(), "enabled": enabled,
                                "cert_sha256": hashlib.sha256(pem.encode()).hexdigest()[:16]})
    return saml_config(firm_id)


def saml_config(firm_id: str) -> dict | None:
    with db.conn() as c:
        r = c.execute("SELECT idp_entity_id, idp_sso_url, idp_cert_pem, email_attribute, enabled, updated_by, updated_at "
                      "FROM saml_configs WHERE firm_id = %s", (firm_id,)).fetchone()
    if not r:
        return None
    return {"idp_entity_id": r[0], "idp_sso_url": r[1], "idp_cert_pem": r[2], "email_attribute": r[3], "enabled": r[4],
            "updated_by": r[5], "updated_at": r[6].isoformat()}


def saml_start(slug: str, intent: str = "login", username: str | None = None, next_path: str | None = None) -> str:
    firm = firms.by_slug(slug)
    cfg = firm and saml_config(firm["id"])
    if not cfg or not cfg["enabled"]:
        raise SSOError("Single sign-on isn't set up for that firm.")
    rid = "_" + secrets.token_hex(16)
    state = _save_state({"kind": "saml", "firm_id": firm["id"], "request_id": rid, "intent": intent,
                         "username": username, "next": _safe_next(next_path)})
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    req = (f'<samlp:AuthnRequest xmlns:samlp="{NS["samlp"]}" xmlns:saml="{NS["saml"]}" ID="{rid}" Version="2.0" '
           f'IssueInstant="{now}" Destination="{cfg["idp_sso_url"]}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" '
           f'AssertionConsumerServiceURL="{acs_url(slug)}"><saml:Issuer>{sp_entity_id(slug)}</saml:Issuer>'
           '<samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>'
           '</samlp:AuthnRequest>')
    deflated = zlib.compress(req.encode())[2:-4]  # raw DEFLATE, as the Redirect binding requires
    q = {"SAMLRequest": base64.b64encode(deflated).decode(), "RelayState": state}
    sep = "&" if "?" in cfg["idp_sso_url"] else "?"
    return cfg["idp_sso_url"] + sep + urllib.parse.urlencode(q)


def _parse_xml(data: bytes):
    from lxml import etree

    if b"<!DOCTYPE" in data[:2000] or b"<!ENTITY" in data:
        raise SSOError("Rejected SAML response (DTDs are not allowed).")
    parser = etree.XMLParser(resolve_entities=False, no_network=True, huge_tree=False, remove_comments=False)
    return etree.fromstring(data, parser)


def _time(s: str | None) -> datetime | None:
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def validate_saml_response(b64: str, slug: str, cfg: dict, request_id: str, now: datetime | None = None) -> dict:
    """Return {"subject", "email", "assertion_id"} from a verified SAML response, or raise SSOError."""
    from lxml import etree
    from signxml import XMLVerifier
    from signxml.exceptions import InvalidSignature

    now = now or datetime.now(timezone.utc)
    try:
        raw = base64.b64decode(b64, validate=True)
    except ValueError:
        raise SSOError("The SAML response wasn't valid base64.")
    root = _parse_xml(raw)
    if root.tag != f"{{{NS['samlp']}}}Response":
        raise SSOError("That isn't a SAML response.")
    status = root.find("samlp:Status/samlp:StatusCode", NS)
    if status is None or status.get("Value") != "urn:oasis:names:tc:SAML:2.0:status:Success":
        raise SSOError("Your identity provider didn't approve the sign-in.")

    # Verify whichever element is signed and keep only what the signature covers
    signed = None
    if root.find("ds:Signature", NS) is not None:
        target = root
    else:
        assertions = root.findall("saml:Assertion", NS)
        if len(assertions) != 1 or assertions[0].find("ds:Signature", NS) is None:
            raise SSOError("The SAML response must contain exactly one signed assertion.")
        target = assertions[0]
    try:
        result = XMLVerifier().verify(etree.tostring(target), x509_cert=cfg["idp_cert_pem"])
        signed = result.signed_xml
    except InvalidSignature as exc:
        raise SSOError(f"The SAML signature didn't verify ({exc}).")
    if signed.tag == f"{{{NS['saml']}}}Assertion":
        assertion = signed
    else:
        found = signed.findall("saml:Assertion", NS)
        if len(found) != 1:
            raise SSOError("The signed SAML response must contain exactly one assertion.")
        assertion = found[0]

    issuer = assertion.findtext("saml:Issuer", namespaces=NS)
    if (issuer or "").strip() != cfg["idp_entity_id"]:
        raise SSOError("The SAML assertion came from an unexpected identity provider.")
    cond = assertion.find("saml:Conditions", NS)
    if cond is None:
        raise SSOError("The SAML assertion has no validity conditions.")
    nb, noa = _time(cond.get("NotBefore")), _time(cond.get("NotOnOrAfter"))
    if (nb and now + CLOCK_SKEW < nb) or (noa and now - CLOCK_SKEW >= noa):
        raise SSOError("The SAML assertion is outside its validity period (check clocks).")
    audiences = [a.text.strip() for a in cond.findall("saml:AudienceRestriction/saml:Audience", NS) if a.text]
    if sp_entity_id(slug) not in audiences:
        raise SSOError("The SAML assertion was issued for a different service.")
    conf = assertion.find("saml:Subject/saml:SubjectConfirmation/saml:SubjectConfirmationData", NS)
    if conf is None:
        raise SSOError("The SAML assertion has no subject confirmation.")
    if conf.get("Recipient") != acs_url(slug):
        raise SSOError("The SAML assertion was addressed to a different URL.")
    if not conf.get("InResponseTo") or not secrets.compare_digest(conf.get("InResponseTo"), request_id):
        raise SSOError("The SAML response doesn't match this sign-in attempt.")
    c_noa = _time(conf.get("NotOnOrAfter"))
    if not c_noa or now - CLOCK_SKEW >= c_noa:
        raise SSOError("The SAML response has expired.")
    name_id = (assertion.findtext("saml:Subject/saml:NameID", namespaces=NS) or "").strip()
    if not name_id:
        raise SSOError("The SAML assertion doesn't name the user.")
    email = None
    if cfg.get("email_attribute"):
        for attr in assertion.findall("saml:AttributeStatement/saml:Attribute", NS):
            if attr.get("Name") == cfg["email_attribute"]:
                email = (attr.findtext("saml:AttributeValue", namespaces=NS) or "").strip().lower() or None
    if not email and "@" in name_id:
        email = name_id.lower()
    aid = assertion.get("ID")
    if not aid:
        raise SSOError("The SAML assertion has no ID.")
    return {"subject": name_id, "email": email, "assertion_id": aid,
            "first_name": _attr(assertion, ("givenName", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
                                            "urn:oid:2.5.4.42")),
            "last_name": _attr(assertion, ("sn", "surname", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
                                           "urn:oid:2.5.4.4"))}


def _attr(assertion, names) -> str:
    for attr in assertion.findall("saml:AttributeStatement/saml:Attribute", NS):
        if attr.get("Name") in names:
            return (attr.findtext("saml:AttributeValue", namespaces=NS) or "").strip()
    return ""


def saml_acs(slug: str, saml_response: str, relay_state: str) -> dict:
    st = _take_state(relay_state)
    firm = firms.by_slug(slug)
    if st.get("kind") != "saml" or not firm or st.get("firm_id") != firm["id"]:
        raise SSOError("The SAML response didn't match this sign-in attempt.")
    cfg = saml_config(firm["id"])
    if not cfg or not cfg["enabled"]:
        raise SSOError("Single sign-on isn't set up for that firm.")
    info = validate_saml_response(saml_response, slug, cfg, st["request_id"])
    with db.conn() as c:  # each assertion is usable once
        c.execute("DELETE FROM saml_seen_assertions WHERE seen_at < now() - interval '1 day'")
        if c.execute("INSERT INTO saml_seen_assertions (assertion_id) VALUES (%s) ON CONFLICT DO NOTHING",
                     (info["assertion_id"],)).rowcount == 0:
            raise SSOError("This SAML response was already used.")
        c.commit()
    provider = f"saml:{firm['id']}"
    if firm["sso_domains"] and info["email"] and info["email"].rsplit("@", 1)[-1] not in firm["sso_domains"]:
        raise SSOError("Your email domain isn't allowed for this firm's sign-in.")
    if st["intent"] == "link":
        link(st["username"], provider, info["subject"], info["email"])
        firms.add_jit_member(firm["id"], st["username"])
        return {"linked": provider, "next": st["next"]}
    user = linked_user(provider, info["subject"])
    if user and firms.member_status(user, firm["id"]) == "suspended":
        raise SSOError("Your access to this firm is suspended. Contact your firm admin.")
    if not user:
        if not info["email"]:
            raise SSOError("Your identity provider didn't send an email address; ask your admin to map one.")
        user = _provision(info["email"], info["first_name"], info["last_name"], firm["id"], provider, info["subject"])
    elif not firms.membership(user, firm["id"]):
        firms.add_jit_member(firm["id"], user)
    return {"username": user, "next": st["next"], "provider": provider, "firm_id": firm["id"]}
