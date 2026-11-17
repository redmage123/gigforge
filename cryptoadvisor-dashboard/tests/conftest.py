"""Shared fixtures for the Carbon Desk tests (async tests run on anyio's pytest plugin)."""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def desk_db(tmp_path, monkeypatch):
    """A fresh, empty Carbon Desk database for one test."""
    from services.carbon_desk import store
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "carbon_desk.db")
    await store.init()
    return store


@pytest.fixture
async def desk_client(desk_db, monkeypatch):
    """HTTP client for the Carbon Desk API behind the app's real auth and CSRF middleware.

    Returns (client, headers): headers carry a valid login cookie and matching CSRF token.
    """
    import httpx
    from fastapi import FastAPI

    from api.carbon_desk import router
    from middleware.auth import AuthMiddleware
    from middleware.csrf import CSRFMiddleware
    from services.auth import create_token

    app = FastAPI()
    app.add_middleware(CSRFMiddleware)
    app.add_middleware(AuthMiddleware)
    app.include_router(router, prefix="/api/carbon-desk")
    token = create_token("desk-tester")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        client.cookies.set("access_token", token)
        client.cookies.set("csrf_token", "t" * 64)
        yield client, {"X-CSRF-Token": "t" * 64}


@pytest.fixture(autouse=True)
def _isolated_user_data(tmp_path, monkeypatch):
    """Tests never touch real records. They also run inside the production container, where
    DATABASE_URL points at the live database: it is removed here. By default records go to files in a
    temp dir; with TEST_DATABASE_URL (a throwaway database) they go to Postgres, emptied per test."""
    from services import store, user_data

    monkeypatch.setattr(user_data, "DATA_DIR", tmp_path / "data")
    test_db = os.environ.get("TEST_DATABASE_URL")
    if test_db:
        assert test_db != os.environ.get("DATABASE_URL"), "TEST_DATABASE_URL must not be the app database"
        monkeypatch.setenv("DATABASE_URL", test_db)
        with store.pool().connection() as conn:
            conn.execute("TRUNCATE documents, blobs")
    else:
        monkeypatch.delenv("DATABASE_URL", raising=False)
