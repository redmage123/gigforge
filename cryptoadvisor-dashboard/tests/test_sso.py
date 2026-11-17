"""SSO: OIDC ID-token checks and SAML response validation, including tampering, wrapping and replay."""

import asyncio
import base64
import copy
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402
from cryptography import x509  # noqa: E402
from cryptography.hazmat.primitives import hashes, serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from cryptography.x509.oid import NameOID  # noqa: E402

from services import sso  # noqa: E402
from tests.conftest import requires_pg  # noqa: E402

NOW = datetime(2026, 11, 17, 12, 0, tzinfo=timezone.utc)
SLUG = "acme"


def _keypair(cn="idp.test"):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)])
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(NOW - timedelta(days=1))
            .not_valid_after(NOW + timedelta(days=365)).sign(key, hashes.SHA256()))
    return (key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()),
            cert.public_bytes(serialization.Encoding.PEM))


KEY, CERT = _keypair()
EVIL_KEY, EVIL_CERT = _keypair("evil")
CFG = {"idp_entity_id": "https://idp.acme.com", "idp_cert_pem": CERT.decode(), "email_attribute": "email"}


def _assertion(name_id="ann@acme.com", aid="_a1", audience=None, recipient=None, in_response_to="_req1",
               not_after=NOW + timedelta(minutes=5), issuer="https://idp.acme.com", now=NOW):
    audience = audience or sso.sp_entity_id(SLUG)
    recipient = recipient or sso.acs_url(SLUG)
    t = lambda d: d.strftime("%Y-%m-%dT%H:%M:%SZ")  # noqa: E731
    return f'''<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="{aid}" Version="2.0" IssueInstant="{t(now)}">
<saml:Issuer>{issuer}</saml:Issuer>
<saml:Subject><saml:NameID>{name_id}</saml:NameID>
<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
<saml:SubjectConfirmationData InResponseTo="{in_response_to}" Recipient="{recipient}" NotOnOrAfter="{t(not_after)}"/>
</saml:SubjectConfirmation></saml:Subject>
<saml:Conditions NotBefore="{t(now - timedelta(minutes=1))}" NotOnOrAfter="{t(not_after)}">
<saml:AudienceRestriction><saml:Audience>{audience}</saml:Audience></saml:AudienceRestriction></saml:Conditions>
<saml:AttributeStatement><saml:Attribute Name="email"><saml:AttributeValue>{name_id}</saml:AttributeValue></saml:Attribute>
<saml:Attribute Name="givenName"><saml:AttributeValue>Ann</saml:AttributeValue></saml:Attribute></saml:AttributeStatement>
</saml:Assertion>'''


def _sign(xml: str, key=KEY, cert=CERT):
    from lxml import etree
    from signxml import XMLSigner

    el = etree.fromstring(xml.encode())
    return XMLSigner(c14n_algorithm="http://www.w3.org/2001/10/xml-exc-c14n#").sign(el, key=key, cert=cert)


def _response(assertion_el, status="urn:oasis:names:tc:SAML:2.0:status:Success", extra=b""):
    from lxml import etree

    body = etree.tostring(assertion_el)
    xml = (b'<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_r1" Version="2.0" '
           b'IssueInstant="2026-11-17T12:00:00Z"><samlp:Status><samlp:StatusCode Value="' + status.encode() + b'"/></samlp:Status>'
           + extra + body + b'</samlp:Response>')
    return base64.b64encode(xml).decode()


def validate(b64, request_id="_req1", cfg=CFG):
    return sso.validate_saml_response(b64, SLUG, cfg, request_id, now=NOW)


class TestSamlValidation:
    def test_valid_signed_assertion(self):
        out = validate(_response(_sign(_assertion())))
        assert out["subject"] == "ann@acme.com" and out["email"] == "ann@acme.com" and out["first_name"] == "Ann"

    @pytest.mark.parametrize("kw,msg", [
        ({"audience": "https://other.example/sp"}, "different service"),
        ({"recipient": "https://evil.example/acs"}, "different URL"),
        ({"in_response_to": "_other"}, "doesn't match this sign-in"),
        ({"not_after": NOW - timedelta(minutes=10)}, "validity period"),
        ({"issuer": "https://idp.evil.com"}, "unexpected identity provider"),
    ])
    def test_rejections(self, kw, msg):
        with pytest.raises(sso.SSOError, match=msg):
            validate(_response(_sign(_assertion(**kw))))

    def test_tampered_after_signing(self):
        el = _sign(_assertion())
        nid = el.find(".//{urn:oasis:names:tc:SAML:2.0:assertion}NameID")
        nid.text = "ceo@acme.com"
        with pytest.raises(sso.SSOError, match="signature"):
            validate(_response(el))

    def test_signed_by_someone_else(self):
        with pytest.raises(sso.SSOError, match="signature"):
            validate(_response(_sign(_assertion(), EVIL_KEY, EVIL_CERT)))

    def test_unsigned(self):
        from lxml import etree
        with pytest.raises(sso.SSOError, match="signed assertion"):
            validate(_response(etree.fromstring(_assertion().encode())))

    def test_signature_wrapping(self):
        """An attacker adds their own unsigned assertion next to a genuinely signed one."""
        from lxml import etree
        evil = etree.fromstring(_assertion(name_id="ceo@acme.com", aid="_evil").encode())
        with pytest.raises(sso.SSOError, match="exactly one"):
            validate(_response(_sign(_assertion()), extra=etree.tostring(evil)))

    def test_failed_status_and_dtd(self):
        with pytest.raises(sso.SSOError, match="didn't approve"):
            validate(_response(_sign(_assertion()), status="urn:oasis:names:tc:SAML:2.0:status:Requester"))
        xxe = base64.b64encode(b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>').decode()
        with pytest.raises(sso.SSOError, match="DTD"):
            validate(xxe)

    def test_cert_input_validation(self):
        assert sso._pem(CERT.decode()).startswith("-----BEGIN CERTIFICATE-----")
        body = "".join(CERT.decode().splitlines()[1:-1])
        assert sso._pem(body) == sso._pem(CERT.decode())  # bare base64 accepted
        with pytest.raises(sso.SSOError):
            sso._pem("not a cert")


class TestOidc:
    def _token(self, claims, key=None, kid="k1"):
        from jose import jwt
        return jwt.encode(claims, (key or KEY).decode(), algorithm="RS256", headers={"kid": kid})

    def _jwks(self, cert=CERT, kid="k1"):
        from jose import jwk
        pub = x509.load_pem_x509_certificate(cert).public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        k = jwk.construct(pub.decode(), "RS256").to_dict()
        return {"keys": [{**{a: (b.decode() if isinstance(b, bytes) else b) for a, b in k.items()}, "kid": kid, "use": "sig"}]}

    def claims(self, **kw):
        exp = int(datetime.now(timezone.utc).timestamp()) + 300
        return {"iss": "https://accounts.google.com", "aud": "cid", "sub": "g-1", "email": "ann@acme.com",
                "email_verified": True, "nonce": "n1", "exp": exp, "iat": exp - 600, **kw}

    def test_valid_and_rejected_tokens(self):
        jwks = self._jwks()
        assert sso.verify_id_token("google", self._token(self.claims()), jwks, "cid", "n1")["sub"] == "g-1"
        with pytest.raises(sso.SSOError, match="nonce|browser session"):
            sso.verify_id_token("google", self._token(self.claims()), jwks, "cid", "other")
        with pytest.raises(sso.SSOError, match="not valid"):
            sso.verify_id_token("google", self._token(self.claims(aud="someone-else")), jwks, "cid", "n1")
        with pytest.raises(sso.SSOError, match="issuer"):
            sso.verify_id_token("google", self._token(self.claims(iss="https://evil")), jwks, "cid", "n1")
        with pytest.raises(sso.SSOError, match="not valid"):
            sso.verify_id_token("google", self._token(self.claims(), key=EVIL_KEY), jwks, "cid", "n1")
        ms = self.claims(iss="https://login.microsoftonline.com/t-1/v2.0", tid="t-1")
        assert sso.verify_id_token("microsoft", self._token(ms), jwks, "cid", "n1")["tid"] == "t-1"
        with pytest.raises(sso.SSOError, match="issuer"):  # tenant in iss must match tid
            sso.verify_id_token("microsoft", self._token({**ms, "tid": "t-2"}), jwks, "cid", "n1")

    @requires_pg
    def test_google_jit_signin_for_firm_domain(self, monkeypatch):
        from services import firms, store
        store.put(store.SHARED, "users", [{"username": "alice", "role": "user"}])
        f = firms.create("alice", "Acme")
        firms.update_policy("alice", f["id"], {"sso_domains": ["acme.com"], "default_role": "analyst"})
        monkeypatch.setenv("GOOGLE_OIDC_CLIENT_ID", "cid")
        monkeypatch.setenv("GOOGLE_OIDC_CLIENT_SECRET", "s")
        disc = {"authorization_endpoint": "https://idp/auth", "token_endpoint": "https://idp/token", "_jwks": self._jwks()}

        async def fake_disc(p):
            return disc
        state_box = {}

        class Resp:
            status_code = 200

            def json(self):
                return {"id_token": TestOidc._token(self, self.claims)}

        with patch.object(sso, "_discovery", fake_disc):
            url = asyncio.run(sso.oidc_start("google", "login", next_path="/portfolio"))
            from urllib.parse import parse_qs, urlparse
            q = parse_qs(urlparse(url).query)
            state_box["state"], nonce = q["state"][0], q["nonce"][0]
            assert q["code_challenge_method"] == ["S256"]
            resp = Resp()
            resp.claims = self.claims(nonce=nonce, sub="g-77", given_name="Ann", family_name="Lee")

            class FakeClient:
                def __init__(self, *a, **k):
                    pass

                async def __aenter__(self):
                    return self

                async def __aexit__(self, *a):
                    return False

                async def post(self, *a, **k):
                    return resp

            with patch.object(sso.httpx, "AsyncClient", FakeClient):
                out = asyncio.run(sso.oidc_callback("google", "code", state_box["state"]))
                assert out["next"] == "/portfolio"
                assert firms.membership(out["username"], f["id"]) == "analyst"
                with pytest.raises(sso.SSOError, match="expired or was already used"):
                    asyncio.run(sso.oidc_callback("google", "code", state_box["state"]))  # state is one-time
        users = store.get(store.SHARED, "users")
        new = next(u for u in users if u["username"] == out["username"])
        assert new["sso_only"] and new["first_name"] == "Ann"


@requires_pg
class TestSamlFlow:
    def setup_firm(self):
        from services import firms, store
        store.put(store.SHARED, "users", [{"username": "alice", "role": "user"}])
        f = firms.create("alice", "Acme")
        firms.update_policy("alice", f["id"], {"sso_domains": ["acme.com"]})
        sso.save_saml_config("alice", f["id"], "https://idp.acme.com", "https://idp.acme.com/sso", CERT.decode(), "email")
        return f

    def _state_and_rid(self, start_url):
        from urllib.parse import parse_qs, urlparse
        from services import db
        state = parse_qs(urlparse(start_url).query)["RelayState"][0]
        with db.conn() as c:
            rid = c.execute("SELECT data->>'request_id' FROM sso_states WHERE state = %s", (state,)).fetchone()[0]
        return state, rid

    def test_end_to_end_jit_replay_and_suspension(self):
        from services import firms
        f = self.setup_firm()
        url = sso.saml_start(f["slug"])
        assert url.startswith("https://idp.acme.com/sso?SAMLRequest=")
        state, rid = self._state_and_rid(url)
        b64 = _response(_sign(_assertion(in_response_to=rid, not_after=datetime.now(timezone.utc) + timedelta(minutes=5), now=datetime.now(timezone.utc))))
        out = sso.saml_acs(f["slug"], b64, state)
        assert firms.membership(out["username"], f["id"]) == "viewer"
        # Same response again: state already used
        with pytest.raises(sso.SSOError):
            sso.saml_acs(f["slug"], b64, state)
        # Same assertion with a fresh state: assertion replay blocked
        state2, rid2 = self._state_and_rid(sso.saml_start(f["slug"]))
        with pytest.raises(sso.SSOError):
            sso.saml_acs(f["slug"], b64, state2)
        # Suspended members can't sign in through the firm
        firms.set_member("alice", f["id"], out["username"], status="suspended")
        state3, rid3 = self._state_and_rid(sso.saml_start(f["slug"]))
        b64_3 = _response(_sign(_assertion(aid="_a3", in_response_to=rid3, not_after=datetime.now(timezone.utc) + timedelta(minutes=5), now=datetime.now(timezone.utc))))
        with pytest.raises(sso.SSOError, match="suspended"):
            sso.saml_acs(f["slug"], b64_3, state3)

    def test_domain_not_allowed(self):
        f = self.setup_firm()
        state, rid = self._state_and_rid(sso.saml_start(f["slug"]))
        b64 = _response(_sign(_assertion(name_id="x@other.com", in_response_to=rid,
                                          not_after=datetime.now(timezone.utc) + timedelta(minutes=5), now=datetime.now(timezone.utc))))
        with pytest.raises(sso.SSOError, match="domain"):
            sso.saml_acs(f["slug"], b64, state)
