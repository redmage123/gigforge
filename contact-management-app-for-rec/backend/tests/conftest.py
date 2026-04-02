"""
Pytest fixtures for ContactBase API black-box tests.

These tests hit the live API via HTTP.  Start the stack before running:

    docker compose up -d        # or: cd api && npm run dev

Then run:
    cd backend
    pip install -r requirements.txt
    pytest tests/ -v

Environment variables (all have sensible defaults for local dev):
    API_BASE_URL   Base URL of the running API  (default: http://localhost:4098/api/v1)
    TEST_EMAIL     Demo admin email             (default: admin@gigforge.ai)
    TEST_PASSWORD  Demo admin password          (default: demo1234)
"""

import os
import uuid

import httpx
import pytest

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:4098/api/v1").rstrip("/")
TEST_EMAIL = os.environ.get("TEST_EMAIL", "admin@gigforge.ai")
TEST_PASSWORD = os.environ.get("TEST_PASSWORD", "demo1234")


# ---------------------------------------------------------------------------
# Session-scoped: shared across the entire test run
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def client() -> httpx.Client:
    """Unauthenticated httpx client."""
    with httpx.Client(base_url=BASE_URL, timeout=15.0) as c:
        yield c


@pytest.fixture(scope="session")
def token(client: httpx.Client) -> str:
    """Obtain a valid JWT for the demo admin and reuse across all tests."""
    resp = client.post("/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    data = resp.json()
    assert data["data"]["token"], "No token in login response"
    return data["data"]["token"]


@pytest.fixture(scope="session")
def auth_client(token: str) -> httpx.Client:
    """httpx client with Authorization header pre-set."""
    headers = {"Authorization": f"Bearer {token}"}
    with httpx.Client(base_url=BASE_URL, headers=headers, timeout=15.0) as c:
        yield c


# ---------------------------------------------------------------------------
# Function-scoped helpers: create/delete resources per test
# ---------------------------------------------------------------------------


@pytest.fixture()
def created_contact(auth_client: httpx.Client):
    """
    Create a disposable contact before the test and delete it afterwards.
    Yields the full contact dict from the API response.
    """
    unique = uuid.uuid4().hex[:8]
    payload = {
        "name": f"Test Contact {unique}",
        "email": f"test-{unique}@example.com",
        "phone": "+1 555 000 0000",
        "company": "Test Corp",
        "notes": "Created by pytest fixture",
    }
    resp = auth_client.post("/contacts", json=payload)
    assert resp.status_code == 201, f"Fixture create failed: {resp.text}"
    contact = resp.json()["data"]

    yield contact

    # Teardown — ignore 404 if already deleted by the test
    auth_client.delete(f"/contacts/{contact['id']}")


@pytest.fixture()
def created_tag(auth_client: httpx.Client):
    """
    Create a disposable custom tag before the test and delete it afterwards.
    Yields the full tag dict from the API response.
    """
    unique = uuid.uuid4().hex[:8]
    payload = {"name": f"pytest-tag-{unique}", "colour": "#FF5733"}
    resp = auth_client.post("/tags", json=payload)
    assert resp.status_code == 201, f"Fixture tag create failed: {resp.text}"
    tag = resp.json()["data"]

    yield tag

    auth_client.delete(f"/tags/{tag['id']}")


@pytest.fixture()
def csv_data() -> bytes:
    """Return a minimal valid CSV payload for import tests."""
    content = (
        "name,email,phone,company,tags\n"
        "Alice Pytest,alice.pytest@example.com,+44 7700 000001,Alpha Ltd,candidate\n"
        "Bob Pytest,bob.pytest@example.com,,Beta Inc,\"client,warm lead\"\n"
        "Charlie Pytest,,,Delta Co,\n"
    )
    return content.encode("utf-8")


@pytest.fixture()
def invalid_csv_data() -> bytes:
    """CSV where some rows are missing required name field."""
    content = (
        "name,email,phone,company,tags\n"
        "Valid Name,valid@example.com,,,\n"
        ",missing-name@example.com,,,\n"
        ",,,, \n"
    )
    return content.encode("utf-8")
