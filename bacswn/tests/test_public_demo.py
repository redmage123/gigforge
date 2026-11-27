"""Public self-guided demo mode (PUBLIC_DEMO): guest sign-in and the guest write allowlist."""

import pytest
from httpx import AsyncClient

import api.auth
import api.carbon_oversight
import middleware.auth


@pytest.fixture
def public_demo(monkeypatch):
    """Switch the app into public-demo mode for one test."""
    monkeypatch.setattr(api.auth, "PUBLIC_DEMO", True)
    monkeypatch.setattr(middleware.auth, "PUBLIC_DEMO", True)
    monkeypatch.setattr(api.carbon_oversight, "PUBLIC_DEMO", True)


async def _guest_headers(client: AsyncClient) -> dict:
    resp = await client.post("/api/auth/guest")
    assert resp.status_code == 200
    body = resp.json()
    assert body["username"] == "guest" and body["role"] == "user" and body["public_demo"] is True
    return {"Authorization": f"Bearer {body['token']}"}


class TestGuestSignIn:
    @pytest.mark.anyio
    async def test_guest_sign_in_is_off_outside_the_public_demo(self, client: AsyncClient):
        # Not a public path on the presenter's server: the auth gate answers first.
        resp = await client.post("/api/auth/guest")
        assert resp.status_code in (401, 404)

    @pytest.mark.anyio
    async def test_guest_signs_in_and_reads(self, client: AsyncClient, public_demo):
        headers = await _guest_headers(client)
        assert (await client.get("/api/auth/me", headers=headers)).status_code == 200
        assert (await client.get("/api/carbon-oversight/periods", headers=headers)).status_code == 200

    @pytest.mark.anyio
    async def test_second_guest_sign_in_reuses_the_account(self, client: AsyncClient, public_demo):
        await _guest_headers(client)
        await _guest_headers(client)


class TestGuestWrites:
    @pytest.mark.anyio
    @pytest.mark.parametrize("path", [
        "/api/auth/register", "/api/channels/send", "/api/agents/run", "/api/chat/message",
        "/api/carbon-oversight/ai/ask", "/api/mesh/ask", "/api/live-admin/reset",
    ])
    async def test_guest_cannot_write_outside_the_demo(self, client: AsyncClient, public_demo, path):
        headers = await _guest_headers(client)
        resp = await client.post(path, headers=headers, json={})
        assert resp.status_code == 403
        assert resp.json()["error"] == "Not available in the public demo"

    @pytest.mark.anyio
    async def test_guest_can_change_demo_data(self, client: AsyncClient, public_demo):
        headers = await _guest_headers(client)
        resp = await client.post("/api/carbon-oversight/claims/999999/review", headers=headers, json={})
        assert resp.status_code not in (401, 403)   # allowed through; the handler judges the request itself

    @pytest.mark.anyio
    async def test_guest_cannot_change_the_register_outside_the_public_demo(self, client: AsyncClient, auth_token):
        resp = await client.post("/api/carbon-oversight/claims/999999/review",
                                 headers={"Authorization": f"Bearer {auth_token}"}, json={})
        assert resp.status_code == 403

    @pytest.mark.anyio
    async def test_admin_is_not_restricted(self, client: AsyncClient, public_demo, admin_headers: dict):
        resp = await client.post("/api/auth/register", headers=admin_headers, json={
            "username": "staff1", "password": "securepass1234", "confirm_password": "securepass1234",
            "first_name": "S", "last_name": "One"})
        assert resp.status_code == 201
