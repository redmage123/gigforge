"""US-314: Webhook System tests — TDD RED phase."""
import hashlib
import hmac
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app
from core.dependencies import get_current_user
from database import get_db
from models.user import UserRole


def _make_user(role=UserRole.ADMIN, tenant_id=None):
    u = MagicMock()
    u.id = uuid.uuid4()
    u.tenant_id = tenant_id or uuid.uuid4()
    u.role = role
    return u


def _make_webhook(wid=None, tenant_id=None):
    w = MagicMock()
    w.id = wid or uuid.uuid4()
    w.tenant_id = tenant_id or uuid.uuid4()
    w.url = "https://example.com/hook"
    w.events = ["contact.created", "deal.updated"]
    w.is_active = True
    w.secret = "test-secret"
    return w


def _make_delivery(did=None, webhook_id=None):
    d = MagicMock()
    d.id = did or uuid.uuid4()
    d.webhook_id = webhook_id or uuid.uuid4()
    d.event_type = "contact.created"
    d.payload = json.dumps({"id": "abc"})
    d.status = "success"
    d.attempt_count = 1
    d.response_status = 200
    d.response_body = "OK"
    d.last_attempted_at = None
    d.created_at = None
    return d


@pytest.fixture
def user():
    return _make_user()


@pytest.fixture
def client(user):
    db = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


class TestWebhooksRouter:

    def test_create_webhook(self, client, user):
        """POST /api/webhooks creates a new webhook."""
        wh = _make_webhook(tenant_id=user.tenant_id)

        with pytest.MonkeyPatch().context() as mp:
            from repositories import webhook_repo as wr_mod
            mock_repo = MagicMock()
            mock_repo.create = AsyncMock(return_value=wh)
            mp.setattr(wr_mod, "WebhookRepository", lambda db: mock_repo)

            resp = client.post("/api/webhooks", json={
                "url": "https://example.com/hook",
                "events": ["contact.created", "deal.updated"],
            })
        assert resp.status_code == 201
        data = resp.json()
        assert data["url"] == "https://example.com/hook"
        assert "secret" not in data  # secret must never be returned

    def test_list_webhooks(self, client, user):
        """GET /api/webhooks returns tenant-scoped webhooks."""
        wh = _make_webhook(tenant_id=user.tenant_id)

        with pytest.MonkeyPatch().context() as mp:
            from repositories import webhook_repo as wr_mod
            mock_repo = MagicMock()
            mock_repo.list = AsyncMock(return_value=[wh])
            mp.setattr(wr_mod, "WebhookRepository", lambda db: mock_repo)

            resp = client.get("/api/webhooks")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert "secret" not in data[0]

    def test_delete_webhook(self, client, user):
        """DELETE /api/webhooks/{id} returns 204."""
        wid = uuid.uuid4()

        with pytest.MonkeyPatch().context() as mp:
            from repositories import webhook_repo as wr_mod
            mock_repo = MagicMock()
            mock_repo.delete = AsyncMock(return_value=True)
            mp.setattr(wr_mod, "WebhookRepository", lambda db: mock_repo)

            resp = client.delete(f"/api/webhooks/{wid}")
        assert resp.status_code == 204

    def test_delete_webhook_not_found(self, client, user):
        """DELETE /api/webhooks/{id} returns 404 when not found."""
        wid = uuid.uuid4()

        with pytest.MonkeyPatch().context() as mp:
            from repositories import webhook_repo as wr_mod
            mock_repo = MagicMock()
            mock_repo.delete = AsyncMock(return_value=False)
            mp.setattr(wr_mod, "WebhookRepository", lambda db: mock_repo)

            resp = client.delete(f"/api/webhooks/{wid}")
        assert resp.status_code == 404

    def test_get_webhook_deliveries(self, client, user):
        """GET /api/webhooks/{id}/deliveries returns delivery log."""
        wid = uuid.uuid4()
        delivery = _make_delivery(webhook_id=wid)

        with pytest.MonkeyPatch().context() as mp:
            from repositories import webhook_repo as wr_mod
            mock_repo = MagicMock()
            mock_repo.list_deliveries = AsyncMock(return_value=[delivery])
            mp.setattr(wr_mod, "WebhookRepository", lambda db: mock_repo)

            resp = client.get(f"/api/webhooks/{wid}/deliveries")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["event_type"] == "contact.created"

    def test_webhook_invalid_url(self, client, user):
        """POST /api/webhooks rejects non-HTTP URLs."""
        resp = client.post("/api/webhooks", json={
            "url": "not-a-url",
            "events": ["contact.created"],
        })
        assert resp.status_code == 422

    def test_webhook_empty_events(self, client, user):
        """POST /api/webhooks rejects empty events list."""
        resp = client.post("/api/webhooks", json={
            "url": "https://example.com/hook",
            "events": [],
        })
        assert resp.status_code == 422


class TestWebhookRepository:

    @pytest.mark.asyncio
    async def test_create_webhook(self):
        """WebhookRepository.create persists a webhook with hashed secret."""
        from repositories.webhook_repo import WebhookRepository
        db = AsyncMock()
        repo = WebhookRepository(db)
        wh = await repo.create(
            tenant_id=uuid.uuid4(),
            url="https://example.com/hook",
            events=["contact.created"],
        )
        db.add.assert_called_once()
        db.flush.assert_called_once()

    @pytest.mark.asyncio
    async def test_list_webhooks(self):
        """WebhookRepository.list returns tenant-scoped webhooks."""
        from repositories.webhook_repo import WebhookRepository
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=mock_result)
        repo = WebhookRepository(db)
        result = await repo.list(tenant_id=uuid.uuid4())
        assert result == []

    @pytest.mark.asyncio
    async def test_log_delivery(self):
        """WebhookRepository.log_delivery creates a delivery record."""
        from repositories.webhook_repo import WebhookRepository
        db = AsyncMock()
        repo = WebhookRepository(db)
        delivery = await repo.log_delivery(
            webhook_id=uuid.uuid4(),
            event_type="contact.created",
            payload={"id": "abc"},
        )
        db.add.assert_called_once()
        db.flush.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_delivery_status(self):
        """WebhookRepository.update_delivery_status updates the delivery row."""
        from repositories.webhook_repo import WebhookRepository
        db = AsyncMock()
        delivery = MagicMock()
        delivery.status = "pending"
        delivery.attempt_count = 0

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = delivery
        db.execute = AsyncMock(return_value=mock_result)

        repo = WebhookRepository(db)
        await repo.update_delivery_status(
            delivery_id=uuid.uuid4(),
            status="success",
            response_status=200,
            response_body="OK",
        )
        assert delivery.status == "success"
        assert delivery.attempt_count == 1


class TestWebhookService:

    def test_compute_signature(self):
        """WebhookService.compute_signature returns correct HMAC-SHA256."""
        from services.webhook_service import WebhookService
        secret = "my-secret"
        body = b'{"event":"test"}'
        sig = WebhookService.compute_signature(secret, body)
        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        assert sig == expected

    @pytest.mark.asyncio
    async def test_get_active_webhooks_for_event(self):
        """WebhookService.get_webhooks_for_event returns webhooks subscribed to event."""
        from services.webhook_service import WebhookService
        db = AsyncMock()

        wh = MagicMock()
        wh.id = uuid.uuid4()
        wh.url = "https://hook.example.com"
        wh.events = ["contact.created"]
        wh.secret = "secret"
        wh.is_active = True

        mock_repo = MagicMock()
        mock_repo.get_active_for_event = AsyncMock(return_value=[wh])

        with patch("services.webhook_service.WebhookRepository", return_value=mock_repo):
            svc = WebhookService(db)
            webhooks = await svc.get_webhooks_for_event(
                tenant_id=uuid.uuid4(),
                event_type="contact.created",
            )
        assert len(webhooks) == 1
        assert webhooks[0].url == "https://hook.example.com"

    @pytest.mark.asyncio
    async def test_dispatch_calls_background_tasks(self):
        """WebhookService.dispatch enqueues background delivery task."""
        from services.webhook_service import WebhookService
        db = AsyncMock()

        wh = MagicMock()
        wh.id = uuid.uuid4()
        wh.url = "https://hook.example.com"
        wh.events = ["deal.created"]
        wh.secret = "secret"
        wh.is_active = True

        delivery = MagicMock()
        delivery.id = uuid.uuid4()

        mock_repo = MagicMock()
        mock_repo.get_active_for_event = AsyncMock(return_value=[wh])
        mock_repo.log_delivery = AsyncMock(return_value=delivery)

        background_tasks = MagicMock()

        with patch("services.webhook_service.WebhookRepository", return_value=mock_repo):
            svc = WebhookService(db)
            await svc.dispatch(
                tenant_id=uuid.uuid4(),
                event_type="deal.created",
                payload={"id": "xyz"},
                background_tasks=background_tasks,
            )

        background_tasks.add_task.assert_called_once()


class TestWebhookRepositoryExtended:

    @pytest.mark.asyncio
    async def test_get_by_id(self):
        """WebhookRepository.get_by_id returns webhook by id and tenant."""
        from repositories.webhook_repo import WebhookRepository
        db = AsyncMock()
        wh = MagicMock()
        wh.id = uuid.uuid4()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = wh
        db.execute = AsyncMock(return_value=mock_result)

        repo = WebhookRepository(db)
        result = await repo.get_by_id(wh.id, uuid.uuid4())
        assert result == wh

    @pytest.mark.asyncio
    async def test_update_webhook(self):
        """WebhookRepository.update modifies webhook fields."""
        from repositories.webhook_repo import WebhookRepository
        db = AsyncMock()
        wh = MagicMock()
        wh.url = "https://old.com"
        wh.is_active = True

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = wh
        db.execute = AsyncMock(return_value=mock_result)

        repo = WebhookRepository(db)
        result = await repo.update(
            webhook_id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            updates={"url": "https://new.com", "is_active": False},
        )
        assert wh.url == "https://new.com"
        assert wh.is_active is False

    @pytest.mark.asyncio
    async def test_update_webhook_not_found(self):
        """WebhookRepository.update returns None when webhook not found."""
        from repositories.webhook_repo import WebhookRepository
        db = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        repo = WebhookRepository(db)
        result = await repo.update(
            webhook_id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            updates={"url": "https://new.com"},
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_delete_webhook(self):
        """WebhookRepository.delete removes webhook."""
        from repositories.webhook_repo import WebhookRepository
        db = AsyncMock()
        wh = MagicMock()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = wh
        db.execute = AsyncMock(return_value=mock_result)

        repo = WebhookRepository(db)
        result = await repo.delete(uuid.uuid4(), uuid.uuid4())
        assert result is True
        db.delete.assert_called_once_with(wh)

    @pytest.mark.asyncio
    async def test_delete_webhook_not_found(self):
        """WebhookRepository.delete returns False when not found."""
        from repositories.webhook_repo import WebhookRepository
        db = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        repo = WebhookRepository(db)
        result = await repo.delete(uuid.uuid4(), uuid.uuid4())
        assert result is False

    @pytest.mark.asyncio
    async def test_get_active_for_event(self):
        """WebhookRepository.get_active_for_event returns matching webhooks."""
        from repositories.webhook_repo import WebhookRepository
        db = AsyncMock()

        wh1 = MagicMock()
        wh1.events = ["contact.created", "deal.updated"]
        wh1.is_active = True

        wh2 = MagicMock()
        wh2.events = ["deal.updated"]
        wh2.is_active = True

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [wh1, wh2]
        db.execute = AsyncMock(return_value=mock_result)

        repo = WebhookRepository(db)
        result = await repo.get_active_for_event(uuid.uuid4(), "contact.created")
        # Only wh1 matches "contact.created"
        assert len(result) == 1
        assert result[0] == wh1

    @pytest.mark.asyncio
    async def test_update_delivery_status_not_found(self):
        """WebhookRepository.update_delivery_status returns None when delivery not found."""
        from repositories.webhook_repo import WebhookRepository
        db = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        repo = WebhookRepository(db)
        result = await repo.update_delivery_status(
            delivery_id=uuid.uuid4(),
            status="failed",
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_list_deliveries(self):
        """WebhookRepository.list_deliveries returns delivery rows."""
        from repositories.webhook_repo import WebhookRepository
        db = AsyncMock()

        delivery = MagicMock()
        delivery.id = uuid.uuid4()

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [delivery]
        db.execute = AsyncMock(return_value=mock_result)

        repo = WebhookRepository(db)
        result = await repo.list_deliveries(uuid.uuid4())
        assert len(result) == 1


class TestWebhookRouterExtended:

    @pytest.fixture
    def user(self):
        return _make_user()

    @pytest.fixture
    def client(self, user):
        db = AsyncMock()
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_db] = lambda: db
        with TestClient(app) as c:
            yield c
        app.dependency_overrides.clear()

    def test_get_webhook_by_id(self, client, user):
        """GET /api/webhooks/{id} returns webhook details."""
        wid = uuid.uuid4()
        wh = _make_webhook(wid=wid, tenant_id=user.tenant_id)

        with pytest.MonkeyPatch().context() as mp:
            from repositories import webhook_repo as wr_mod
            mock_repo = MagicMock()
            mock_repo.get_by_id = AsyncMock(return_value=wh)
            mp.setattr(wr_mod, "WebhookRepository", lambda db: mock_repo)

            resp = client.get(f"/api/webhooks/{wid}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["url"] == "https://example.com/hook"

    def test_get_webhook_not_found(self, client, user):
        """GET /api/webhooks/{id} returns 404 when not found."""
        wid = uuid.uuid4()

        with pytest.MonkeyPatch().context() as mp:
            from repositories import webhook_repo as wr_mod
            mock_repo = MagicMock()
            mock_repo.get_by_id = AsyncMock(return_value=None)
            mp.setattr(wr_mod, "WebhookRepository", lambda db: mock_repo)

            resp = client.get(f"/api/webhooks/{wid}")
        assert resp.status_code == 404

    def test_update_webhook(self, client, user):
        """PUT /api/webhooks/{id} updates webhook."""
        wid = uuid.uuid4()
        wh = _make_webhook(wid=wid, tenant_id=user.tenant_id)

        with pytest.MonkeyPatch().context() as mp:
            from repositories import webhook_repo as wr_mod
            mock_repo = MagicMock()
            mock_repo.update = AsyncMock(return_value=wh)
            mp.setattr(wr_mod, "WebhookRepository", lambda db: mock_repo)

            resp = client.put(f"/api/webhooks/{wid}", json={"is_active": False})
        assert resp.status_code == 200

    def test_update_webhook_not_found(self, client, user):
        """PUT /api/webhooks/{id} returns 404 when not found."""
        wid = uuid.uuid4()

        with pytest.MonkeyPatch().context() as mp:
            from repositories import webhook_repo as wr_mod
            mock_repo = MagicMock()
            mock_repo.update = AsyncMock(return_value=None)
            mp.setattr(wr_mod, "WebhookRepository", lambda db: mock_repo)

            resp = client.put(f"/api/webhooks/{wid}", json={"is_active": False})
        assert resp.status_code == 404

    def test_update_webhook_invalid_events(self, client, user):
        """PUT /api/webhooks/{id} rejects unknown event types."""
        wid = uuid.uuid4()

        with pytest.MonkeyPatch().context() as mp:
            from repositories import webhook_repo as wr_mod
            mock_repo = MagicMock()
            mock_repo.update = AsyncMock(return_value=None)
            mp.setattr(wr_mod, "WebhookRepository", lambda db: mock_repo)

            resp = client.put(f"/api/webhooks/{wid}", json={"events": ["unknown.event"]})
        assert resp.status_code == 422

    def test_dispatch_webhook(self, client, user):
        """POST /api/webhooks/dispatch dispatches event to webhooks."""
        with pytest.MonkeyPatch().context() as mp:
            from repositories import webhook_repo as wr_mod
            mock_repo = MagicMock()
            mock_repo.get_active_for_event = AsyncMock(return_value=[])
            mp.setattr(wr_mod, "WebhookRepository", lambda db: mock_repo)

            resp = client.post("/api/webhooks/dispatch", json={
                "event": "contact.created",
                "payload": {"id": "abc"},
            })
        assert resp.status_code == 202

    def test_dispatch_webhook_with_hooks(self, client, user):
        """POST /api/webhooks/dispatch fires background tasks for matching hooks."""
        wh = _make_webhook(tenant_id=user.tenant_id)

        with pytest.MonkeyPatch().context() as mp:
            from repositories import webhook_repo as wr_mod
            mock_repo = MagicMock()
            mock_repo.get_active_for_event = AsyncMock(return_value=[wh])
            mp.setattr(wr_mod, "WebhookRepository", lambda db: mock_repo)

            # Patch asyncio at the built-in level since the router imports it inside the function
            import asyncio
            original_ensure_future = asyncio.ensure_future
            asyncio.ensure_future = MagicMock()
            try:
                resp = client.post("/api/webhooks/dispatch", json={
                    "event": "contact.created",
                    "payload": {"id": "abc"},
                })
            finally:
                asyncio.ensure_future = original_ensure_future
        assert resp.status_code == 202
        data = resp.json()
        assert data["dispatched"] == 1


class TestWebhookServiceExtended:

    @pytest.mark.asyncio
    async def test_dispatch_no_webhooks(self):
        """WebhookService.dispatch does nothing when no webhooks match."""
        from services.webhook_service import WebhookService
        db = AsyncMock()
        mock_repo = MagicMock()
        mock_repo.get_active_for_event = AsyncMock(return_value=[])
        background_tasks = MagicMock()

        with patch("services.webhook_service.WebhookRepository", return_value=mock_repo):
            svc = WebhookService(db)
            await svc.dispatch(
                tenant_id=uuid.uuid4(),
                event_type="contact.created",
                payload={"id": "abc"},
                background_tasks=background_tasks,
            )

        background_tasks.add_task.assert_not_called()

    @pytest.mark.asyncio
    async def test_deliver_with_retry_success(self):
        """WebhookService._deliver_with_retry succeeds on first attempt."""
        from services.webhook_service import WebhookService
        db = AsyncMock()
        mock_repo = MagicMock()
        mock_repo.update_delivery_status = AsyncMock()

        wh = MagicMock()
        wh.url = "https://hook.example.com"
        wh.secret = "secret"
        wh.events = ["contact.created"]

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "OK"

        with patch("services.webhook_service.WebhookRepository", return_value=mock_repo):
            svc = WebhookService(db)
            with patch("httpx.AsyncClient") as mock_client_cls:
                mock_client = AsyncMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=None)
                mock_client.post = AsyncMock(return_value=mock_response)
                mock_client_cls.return_value = mock_client

                await svc._deliver_with_retry(
                    webhook=wh,
                    delivery_id=uuid.uuid4(),
                    body_bytes=b'{"event":"contact.created"}',
                )

        mock_repo.update_delivery_status.assert_called_once()
        call_kwargs = mock_repo.update_delivery_status.call_args
        assert call_kwargs.kwargs.get("status") == "success" or \
               (call_kwargs.args and "success" in str(call_kwargs.args))

    @pytest.mark.asyncio
    async def test_deliver_with_retry_all_fail(self):
        """WebhookService._deliver_with_retry marks delivery as failed after 3 attempts."""
        from services.webhook_service import WebhookService
        db = AsyncMock()
        mock_repo = MagicMock()
        mock_repo.update_delivery_status = AsyncMock()

        wh = MagicMock()
        wh.url = "https://hook.example.com"
        wh.secret = "secret"
        wh.events = ["contact.created"]

        with patch("services.webhook_service.WebhookRepository", return_value=mock_repo):
            svc = WebhookService(db)
            with patch("httpx.AsyncClient") as mock_client_cls:
                mock_client = AsyncMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=None)
                # Always raises exception
                mock_client.post = AsyncMock(side_effect=Exception("connection refused"))
                mock_client_cls.return_value = mock_client

                with patch("asyncio.sleep", new_callable=AsyncMock):
                    await svc._deliver_with_retry(
                        webhook=wh,
                        delivery_id=uuid.uuid4(),
                        body_bytes=b'{"event":"contact.created"}',
                    )

        # After all retries, delivery should be marked failed
        mock_repo.update_delivery_status.assert_called_once()
        call_kwargs = mock_repo.update_delivery_status.call_args
        assert call_kwargs.kwargs.get("status") == "failed" or \
               (call_kwargs.args and "failed" in str(call_kwargs.args))
