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


@pytest_asyncio.fixture
async def client():
    """Async test client for the FastAPI app."""
    from main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def auth_token(client):
    """Register a test user and return a valid JWT token."""
    resp = await client.post("/api/auth/register", json={
        "username": "testuser",
        "password": "testpass123",
        "confirm_password": "testpass123",
        "first_name": "Test",
        "last_name": "User",
    })
    return resp.json()["token"]
