"""The content security policy: scripts only from listed origins, never inline or eval."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from middleware.security_headers import CSP, SecurityHeadersMiddleware  # noqa: E402


def _directives():
    return {d.split()[0]: d.split()[1:] for d in CSP.split("; ")}


def test_scripts_come_only_from_listed_origins():
    scripts = _directives()["script-src"]
    assert scripts == ["'self'", "https://cdn.plaid.com", "https://static.cloudflareinsights.com"]
    assert not any(s in scripts for s in ("'unsafe-inline'", "'unsafe-eval'", "https:", "*"))


def test_cloudflare_web_analytics_can_load_and_report():
    d = _directives()
    assert "https://static.cloudflareinsights.com" in d["script-src"]
    assert "https://cloudflareinsights.com" in d["connect-src"]


def test_walletconnect_can_reach_its_relay_and_telegram_is_gone():
    d = _directives()
    assert "wss://relay.walletconnect.org" in d["connect-src"]
    assert "https://verify.walletconnect.org" in d["frame-src"]
    assert not any("telegram" in s for s in d["connect-src"])


def test_policy_is_enforced_on_every_response(monkeypatch):
    monkeypatch.delenv("CSP_MODE", raising=False)
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/")
    async def home():
        return {"ok": True}

    r = TestClient(app).get("/")
    assert r.headers["content-security-policy"] == CSP
    assert "content-security-policy-report-only" not in r.headers
    assert r.headers["x-frame-options"] == "DENY"
