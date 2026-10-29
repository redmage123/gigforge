"""BACSWN test fixtures — shared across all test modules."""

import os

# Set TESTING and JWT_SECRET before any app imports
os.environ["TESTING"] = "1"
os.environ["JWT_SECRET"] = "test-secret-key-for-pytest-only-do-not-use-in-production-64chars!"

import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from services.database import init_db
from config import DATA_DIR, DB_PATH


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    """Use a temp database for every test — fully isolated."""
    import config
    import services.database as db_mod

    test_db = tmp_path / "test.db"
    monkeypatch.setattr(config, "DB_PATH", test_db)
    monkeypatch.setattr(db_mod, "DB_PATH", test_db)

    await init_db()
    yield


_client_seq = 0


@pytest_asyncio.fixture
async def client():
    """Async test client for the FastAPI app."""
    from main import app
    # Fresh client IP per test so the app-wide rate limiter (200 req/min,
    # keyed by IP) doesn't carry hits across tests and start returning 429s.
    global _client_seq
    _client_seq += 1
    transport = ASGITransport(app=app, client=(f"10.0.{_client_seq // 250}.{_client_seq % 250 + 1}", 123))
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def admin_headers(client):
    """Create an admin directly in the DB and return its Authorization header."""
    from services.auth import create_user
    await create_user("testadmin", "testadmin-password-123", role="admin",
                      first_name="Test", last_name="Admin")
    resp = await client.post("/api/auth/login", json={
        "username": "testadmin",
        "password": "testadmin-password-123",
    })
    return {"Authorization": f"Bearer {resp.json()['token']}"}


@pytest_asyncio.fixture
async def auth_token(client):
    """Create a regular test user and return a valid JWT token."""
    from services.auth import create_user
    await create_user("testuser", "testpass12345", first_name="Test", last_name="User")
    resp = await client.post("/api/auth/login", json={
        "username": "testuser",
        "password": "testpass12345",
    })
    return resp.json()["token"]
