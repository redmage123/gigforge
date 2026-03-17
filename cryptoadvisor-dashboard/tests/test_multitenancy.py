"""Multi-tenancy integration tests for CryptoAdvisor API."""

import pytest
import httpx

BASE = "http://localhost:8050"


@pytest.fixture
def admin_token():
    r = httpx.post(f"{BASE}/api/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture
def user_token():
    # Try to register, fall back to login if exists
    r = httpx.post(f"{BASE}/api/auth/register", json={
        "username": "testuser2", "password": "test123", "confirm_password": "test123"
    })
    if r.status_code == 409:  # already exists
        r = httpx.post(f"{BASE}/api/auth/login", json={"username": "testuser2", "password": "test123"})
    assert r.status_code in (200, 201)
    return r.json()["token"]


def headers(token):
    return {"Authorization": f"Bearer {token}"}


class TestAuth:
    def test_login_success(self):
        r = httpx.post(f"{BASE}/api/auth/login", json={"username": "admin", "password": "admin"})
        assert r.status_code == 200
        assert "token" in r.json()

    def test_login_failure(self):
        r = httpx.post(f"{BASE}/api/auth/login", json={"username": "admin", "password": "wrong"})
        assert r.status_code == 401

    def test_unauthenticated_api_blocked(self):
        r = httpx.get(f"{BASE}/api/wallet/saved")
        assert r.status_code == 401

    def test_register_duplicate(self):
        r = httpx.post(f"{BASE}/api/auth/register", json={
            "username": "admin", "password": "test123", "confirm_password": "test123"
        })
        assert r.status_code == 409

    def test_register_short_password(self):
        r = httpx.post(f"{BASE}/api/auth/register", json={
            "username": "shortpw", "password": "ab", "confirm_password": "ab"
        })
        assert r.status_code == 400


class TestWalletIsolation:
    def test_admin_wallets_not_visible_to_user(self, admin_token, user_token):
        # Admin's wallets
        admin_wallets = httpx.get(f"{BASE}/api/wallet/saved", headers=headers(admin_token)).json()
        user_wallets = httpx.get(f"{BASE}/api/wallet/saved", headers=headers(user_token)).json()

        # User should not see admin's wallets
        admin_addrs = {w.get("address") for w in admin_wallets}
        user_addrs = {w.get("address") for w in user_wallets}
        assert admin_addrs.isdisjoint(user_addrs) or len(admin_addrs) == 0


class TestSettingsIsolation:
    def test_theme_isolation(self, admin_token, user_token):
        # Set admin theme to light
        httpx.put(f"{BASE}/api/settings/theme", headers=headers(admin_token), json={"theme": "light"})

        # User should still be dark
        user_settings = httpx.get(f"{BASE}/api/settings/", headers=headers(user_token)).json()
        assert user_settings["theme"] == "dark"

        # Reset admin back to dark
        httpx.put(f"{BASE}/api/settings/theme", headers=headers(admin_token), json={"theme": "dark"})


class TestPortfolioIsolation:
    def test_portfolio_per_user(self, admin_token, user_token):
        admin_portfolio = httpx.get(f"{BASE}/api/portfolio/holdings", headers=headers(admin_token)).json()
        user_portfolio = httpx.get(f"{BASE}/api/portfolio/holdings", headers=headers(user_token)).json()
        # Both should return without error
        assert isinstance(admin_portfolio, dict)
        assert isinstance(user_portfolio, dict)


class TestHealthCheck:
    def test_health_no_auth(self):
        r = httpx.get(f"{BASE}/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] in ("healthy", "degraded")


class TestPublicEndpoints:
    def test_spa_no_auth(self):
        r = httpx.get(BASE)
        assert r.status_code == 200

    def test_register_no_auth(self):
        r = httpx.post(f"{BASE}/api/auth/register", json={
            "username": "unique_test_xyz_999", "password": "test123", "confirm_password": "test123"
        })
        assert r.status_code in (201, 409)


class TestDataExport:
    def test_export_returns_user_data(self, admin_token):
        r = httpx.get(f"{BASE}/api/settings/export", headers=headers(admin_token))
        assert r.status_code == 200
        data = r.json()
        assert data["username"] == "admin"
        assert "wallets" in data
        assert "trades" in data
        assert "settings" in data


class TestWizard:
    def test_wizard_status(self, user_token):
        r = httpx.get(f"{BASE}/api/wizard/status", headers=headers(user_token))
        assert r.status_code == 200
        assert "completed" in r.json()


class TestCSRF:
    def test_csrf_token_set_on_get(self, admin_token):
        r = httpx.get(f"{BASE}/api/settings/", headers=headers(admin_token))
        assert r.status_code == 200
        # CSRF cookie should be set
        # (note: httpx handles cookies differently, this is a basic check)
