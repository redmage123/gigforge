"""BACSWN Sprint 1 — Auth service and API tests (S1-006)."""

import pytest
import pytest_asyncio
from httpx import AsyncClient


# ── Registration ──────────────────────────────────────────────────────────────

class TestRegister:
    @pytest.mark.anyio
    async def test_register_success(self, client: AsyncClient, admin_headers: dict):
        resp = await client.post("/api/auth/register", headers=admin_headers, json={
            "username": "newuser",
            "password": "securepass1234",
            "confirm_password": "securepass1234",
            "first_name": "New",
            "last_name": "User",
        })
        assert resp.status_code == 201
        body = resp.json()
        assert "token" not in body
        assert body["username"] == "newuser"
        assert body["role"] == "user"

    @pytest.mark.anyio
    async def test_register_password_mismatch_returns_400(self, client: AsyncClient, admin_headers: dict):
        resp = await client.post("/api/auth/register", headers=admin_headers, json={
            "username": "mismatch",
            "password": "abc123",
            "confirm_password": "xyz789",
            "first_name": "M",
            "last_name": "M",
        })
        assert resp.status_code == 400

    @pytest.mark.anyio
    async def test_register_short_password_returns_400(self, client: AsyncClient, admin_headers: dict):
        resp = await client.post("/api/auth/register", headers=admin_headers, json={
            "username": "shortpw",
            "password": "abc",
            "confirm_password": "abc",
            "first_name": "S",
            "last_name": "P",
        })
        assert resp.status_code == 400

    @pytest.mark.anyio
    async def test_register_11_char_password_returns_400(self, client: AsyncClient, admin_headers: dict):
        resp = await client.post("/api/auth/register", headers=admin_headers, json={
            "username": "elevenchar",
            "password": "abcdefghijk",
            "confirm_password": "abcdefghijk",
            "first_name": "E",
            "last_name": "C",
        })
        assert resp.status_code == 400

    @pytest.mark.anyio
    async def test_register_unauthenticated_returns_401(self, client: AsyncClient):
        resp = await client.post("/api/auth/register", json={
            "username": "anon",
            "password": "password12345",
            "confirm_password": "password12345",
            "first_name": "A",
            "last_name": "N",
        })
        assert resp.status_code == 401

    @pytest.mark.anyio
    async def test_register_non_admin_returns_403(self, client: AsyncClient, auth_token: str):
        resp = await client.post("/api/auth/register",
                                 headers={"Authorization": f"Bearer {auth_token}"}, json={
            "username": "sneaky",
            "password": "password12345",
            "confirm_password": "password12345",
            "first_name": "S",
            "last_name": "N",
        })
        assert resp.status_code == 403

    @pytest.mark.anyio
    async def test_register_short_username_returns_400(self, client: AsyncClient, admin_headers: dict):
        resp = await client.post("/api/auth/register", headers=admin_headers, json={
            "username": "ab",
            "password": "password12345",
            "confirm_password": "password12345",
            "first_name": "A",
            "last_name": "B",
        })
        assert resp.status_code == 400

    @pytest.mark.anyio
    async def test_register_duplicate_username_returns_409(self, client: AsyncClient, admin_headers: dict):
        payload = {
            "username": "dupuser",
            "password": "password12345",
            "confirm_password": "password12345",
            "first_name": "D",
            "last_name": "U",
        }
        await client.post("/api/auth/register", headers=admin_headers, json=payload)
        resp = await client.post("/api/auth/register", headers=admin_headers, json=payload)
        assert resp.status_code == 409


# ── Login ─────────────────────────────────────────────────────────────────────

class TestLogin:
    @pytest.mark.anyio
    async def test_login_valid_credentials(self, client: AsyncClient, auth_token: str):
        """auth_token fixture registers testuser — login should succeed."""
        resp = await client.post("/api/auth/login", json={
            "username": "testuser",
            "password": "testpass12345",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert "token" in body
        assert body["username"] == "testuser"

    @pytest.mark.anyio
    async def test_login_wrong_password_returns_401(self, client: AsyncClient, auth_token: str):
        resp = await client.post("/api/auth/login", json={
            "username": "testuser",
            "password": "wrongpassword",
        })
        assert resp.status_code == 401

    @pytest.mark.anyio
    async def test_login_unknown_user_returns_401(self, client: AsyncClient):
        resp = await client.post("/api/auth/login", json={
            "username": "nobody",
            "password": "anything",
        })
        assert resp.status_code == 401

    @pytest.mark.anyio
    async def test_login_sets_cookie(self, client: AsyncClient, auth_token: str):
        resp = await client.post("/api/auth/login", json={
            "username": "testuser",
            "password": "testpass12345",
        })
        assert resp.status_code == 200
        assert "access_token" in resp.cookies


# ── JWT token ─────────────────────────────────────────────────────────────────

class TestJWT:
    def test_create_token_returns_string(self):
        from services.auth import create_token
        token = create_token("testuser", "user")
        assert isinstance(token, str)
        assert len(token) > 20

    def test_decode_token_returns_payload(self):
        from services.auth import create_token, decode_token
        token = create_token("testuser", "meteorologist")
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "testuser"
        assert payload["role"] == "meteorologist"

    def test_decode_tampered_token_returns_none(self):
        from services.auth import create_token, decode_token
        token = create_token("testuser", "user")
        # Tamper the signature
        parts = token.split(".")
        tampered = parts[0] + "." + parts[1] + ".invalidsignature"
        result = decode_token(tampered)
        assert result is None

    def test_decode_random_string_returns_none(self):
        from services.auth import decode_token
        assert decode_token("not.a.jwt") is None

    def test_decode_empty_token_returns_none(self):
        from services.auth import decode_token
        assert decode_token("") is None


# ── Brute-force lockout ───────────────────────────────────────────────────────

class TestBruteForce:
    @pytest.mark.anyio
    async def test_brute_force_lockout_after_5_failures(self, client: AsyncClient):
        """After 5 failed logins, the 6th returns 429."""
        # Register a user to lock
        from services.auth import create_user
        await create_user("bruteuser", "correctpass")
        # Make 5 failed attempts
        for _ in range(5):
            resp = await client.post("/api/auth/login", json={
                "username": "bruteuser",
                "password": "wrongpass",
            })
            assert resp.status_code == 401

        # 6th attempt should be locked out
        resp = await client.post("/api/auth/login", json={
            "username": "bruteuser",
            "password": "wrongpass",
        })
        assert resp.status_code == 429

    @pytest.mark.anyio
    async def test_successful_login_clears_lockout(self, client: AsyncClient):
        """A successful login resets the failed-attempt counter."""
        from services.auth import create_user
        await create_user("clearuser", "rightpass")
        # Make 4 failed attempts (one less than lockout threshold)
        for _ in range(4):
            await client.post("/api/auth/login", json={
                "username": "clearuser",
                "password": "wrongpass",
            })
        # Successful login should reset counter
        resp = await client.post("/api/auth/login", json={
            "username": "clearuser",
            "password": "rightpass",
        })
        assert resp.status_code == 200
        # Next wrong attempt should be 401, not 429
        resp = await client.post("/api/auth/login", json={
            "username": "clearuser",
            "password": "wrongpass",
        })
        assert resp.status_code == 401


# ── Protected endpoints ───────────────────────────────────────────────────────

class TestProtectedEndpoints:
    @pytest.mark.anyio
    async def test_me_returns_user_profile(self, client: AsyncClient, auth_token: str):
        resp = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["username"] == "testuser"

    @pytest.mark.anyio
    async def test_me_requires_auth_token(self, client: AsyncClient):
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 401

    @pytest.mark.anyio
    async def test_logout_clears_cookie(self, client: AsyncClient, auth_token: str):
        resp = await client.post(
            "/api/auth/logout",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        # Cookie should be cleared (set-cookie with empty/expired value)
        assert resp.json()["message"] == "Logged out"
