"""BACSWN Security Tests — SEC-001, SEC-002, SEC-003."""

import pytest
from httpx import AsyncClient


# ═══════════════════════════════════════════════════════════════════════════
# SEC-001 — Secrets not hardcoded
# ═══════════════════════════════════════════════════════════════════════════

class TestSecretsPurged:
    """SEC-001: JWT secret must not be the insecure default."""

    def test_jwt_secret_not_default(self):
        from config import JWT_SECRET
        assert JWT_SECRET != "change-me-in-production", \
            "JWT_SECRET must not be the insecure default"

    def test_jwt_secret_minimum_length(self):
        from config import JWT_SECRET
        assert len(JWT_SECRET) >= 32, \
            f"JWT_SECRET too short ({len(JWT_SECRET)} chars), need >= 32"

    def test_env_example_has_placeholder(self, tmp_path):
        from pathlib import Path
        from config import BASE_DIR
        env_example = BASE_DIR / ".env.example"
        assert env_example.exists(), ".env.example must exist"
        content = env_example.read_text()
        assert "REPLACE_WITH_64_CHAR_HEX_SECRET" in content, \
            ".env.example must have placeholder for JWT_SECRET"

    def test_gitignore_covers_env(self):
        from config import BASE_DIR
        gitignore = (BASE_DIR / ".gitignore").read_text()
        assert ".env" in gitignore, ".gitignore must exclude .env"

    def test_gitignore_covers_data_dir(self):
        from config import BASE_DIR
        gitignore = (BASE_DIR / ".gitignore").read_text()
        assert "data/" in gitignore, ".gitignore must exclude data/"

    def test_config_raises_without_jwt_secret(self, monkeypatch):
        """If JWT_SECRET is unset and not TESTING, config must raise."""
        monkeypatch.delenv("JWT_SECRET", raising=False)
        monkeypatch.delenv("TESTING", raising=False)
        import importlib
        import config
        # Prevent load_dotenv from re-reading .env during reload
        monkeypatch.setattr("dotenv.load_dotenv", lambda *a, **kw: None)
        with pytest.raises(ValueError, match="JWT_SECRET"):
            importlib.reload(config)
        # Restore for other tests
        import os
        os.environ["TESTING"] = "1"
        os.environ["JWT_SECRET"] = "test-secret-key-for-pytest-only-do-not-use-in-production-64chars!"
        monkeypatch.undo()
        importlib.reload(config)


# ═══════════════════════════════════════════════════════════════════════════
# SEC-002 — No hardcoded default credentials
# ═══════════════════════════════════════════════════════════════════════════

class TestNoHardcodedCredentials:
    """SEC-002: admin/admin and meteorologist/weather must be rejected."""

    @pytest.mark.anyio
    async def test_admin_admin_rejected(self, client: AsyncClient):
        """Default admin/admin credentials must not work."""
        resp = await client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin",
        })
        assert resp.status_code == 401, \
            f"admin/admin should be rejected, got {resp.status_code}"

    @pytest.mark.anyio
    async def test_meteorologist_weather_rejected(self, client: AsyncClient):
        """Default meteorologist/weather credentials must not work."""
        resp = await client.post("/api/auth/login", json={
            "username": "meteorologist",
            "password": "weather",
        })
        assert resp.status_code == 401, \
            f"meteorologist/weather should be rejected, got {resp.status_code}"

    @pytest.mark.anyio
    async def test_first_boot_creates_admin_with_random_password(self):
        """First boot should create an admin user (not with 'admin' password)."""
        from services.auth import ensure_default_admin, authenticate
        await ensure_default_admin()
        # admin/admin must NOT work
        result = await authenticate("admin", "admin")
        assert result is None, "admin/admin must not authenticate after first boot"
        # But admin user should exist
        from services.auth import get_user
        user = await get_user("admin")
        assert user is not None, "admin user should exist after first boot"
        assert user["role"] == "admin"

    @pytest.mark.anyio
    async def test_first_boot_skips_if_users_exist(self, client: AsyncClient):
        """If users already exist, ensure_default_admin should be a no-op."""
        # Register a user first
        await client.post("/api/auth/register", json={
            "username": "existing",
            "password": "password123",
            "confirm_password": "password123",
            "first_name": "Existing",
            "last_name": "User",
        })
        from services.auth import ensure_default_admin, get_user
        await ensure_default_admin()
        # admin should NOT have been created
        user = await get_user("admin")
        assert user is None, "admin should not be created when users already exist"


# ═══════════════════════════════════════════════════════════════════════════
# SEC-003 — WebSocket token authentication
# ═══════════════════════════════════════════════════════════════════════════

class TestWebSocketAuth:
    """SEC-003: WebSocket connections require valid JWT token."""

    @pytest.mark.anyio
    async def test_ws_rejects_without_token(self, client: AsyncClient):
        """WebSocket connect without token should be rejected with 4001."""
        from starlette.testclient import TestClient
        from main import app
        sync_client = TestClient(app)
        with pytest.raises(Exception):
            with sync_client.websocket_connect("/ws/flights"):
                pass

    @pytest.mark.anyio
    async def test_ws_rejects_invalid_token(self, client: AsyncClient):
        """WebSocket connect with invalid token should be rejected."""
        from starlette.testclient import TestClient
        from main import app
        sync_client = TestClient(app)
        with pytest.raises(Exception):
            with sync_client.websocket_connect("/ws/flights?token=invalid-jwt-token"):
                pass

    @pytest.mark.anyio
    async def test_ws_accepts_valid_token(self, auth_token: str):
        """WebSocket connect with valid token should succeed."""
        from starlette.testclient import TestClient
        from main import app
        sync_client = TestClient(app)
        with sync_client.websocket_connect(f"/ws/flights?token={auth_token}") as ws:
            assert ws is not None

    @pytest.mark.anyio
    async def test_ws_all_channels_require_token(self, client: AsyncClient):
        """All WebSocket channels must require authentication."""
        from starlette.testclient import TestClient
        from main import app
        sync_client = TestClient(app)
        for channel in ["flights", "weather", "agents", "alerts"]:
            with pytest.raises(Exception):
                with sync_client.websocket_connect(f"/ws/{channel}"):
                    pass

    @pytest.mark.anyio
    async def test_ws_all_channels_accept_valid_token(self, auth_token: str):
        """All WebSocket channels should accept valid tokens."""
        from starlette.testclient import TestClient
        from main import app
        sync_client = TestClient(app)
        for channel in ["flights", "weather", "agents", "alerts"]:
            with sync_client.websocket_connect(f"/ws/{channel}?token={auth_token}") as ws:
                assert ws is not None
