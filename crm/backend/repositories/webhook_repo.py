"""Webhook repository — CRUD for webhook registrations and delivery log."""
from __future__ import annotations

import json
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.webhook import Webhook
from models.webhook_delivery import WebhookDelivery


class WebhookRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        *,
        tenant_id: uuid.UUID,
        url: str,
        events: List[str],
        is_active: bool = True,
    ) -> Webhook:
        webhook = Webhook(
            tenant_id=tenant_id,
            url=url,
            events=events,
            is_active=is_active,
            secret=secrets.token_hex(32),
        )
        self.db.add(webhook)
        await self.db.flush()
        await self.db.refresh(webhook)
        return webhook

    async def get_by_id(self, webhook_id: uuid.UUID, tenant_id: uuid.UUID) -> Optional[Webhook]:
        result = await self.db.execute(
            select(Webhook).where(
                Webhook.id == webhook_id, Webhook.tenant_id == tenant_id
            )
        )
        return result.scalar_one_or_none()

    async def list(self, tenant_id: uuid.UUID) -> List[Webhook]:
        result = await self.db.execute(
            select(Webhook)
            .where(Webhook.tenant_id == tenant_id)
            .order_by(Webhook.created_at.desc())
        )
        return list(result.scalars().all())

    async def update(
        self,
        webhook_id: uuid.UUID,
        tenant_id: uuid.UUID,
        updates: dict,
    ) -> Optional[Webhook]:
        webhook = await self.get_by_id(webhook_id, tenant_id)
        if not webhook:
            return None
        for key, val in updates.items():
            setattr(webhook, key, val)
        await self.db.flush()
        await self.db.refresh(webhook)
        return webhook

    async def delete(self, webhook_id: uuid.UUID, tenant_id: uuid.UUID) -> bool:
        webhook = await self.get_by_id(webhook_id, tenant_id)
        if not webhook:
            return False
        await self.db.delete(webhook)
        await self.db.flush()
        return True

    async def get_active_for_event(
        self, tenant_id: uuid.UUID, event: str
    ) -> List[Webhook]:
        """Return all active webhooks subscribed to a given event type."""
        result = await self.db.execute(
            select(Webhook).where(
                Webhook.tenant_id == tenant_id,
                Webhook.is_active.is_(True),
            )
        )
        hooks = result.scalars().all()
        return [h for h in hooks if event in (h.events or [])]

    async def log_delivery(
        self,
        webhook_id: uuid.UUID,
        event_type: str,
        payload: Any,
        status: str = "pending",
    ) -> WebhookDelivery:
        """Create an initial delivery record."""
        delivery = WebhookDelivery(
            webhook_id=webhook_id,
            event_type=event_type,
            payload=json.dumps(payload) if not isinstance(payload, str) else payload,
            status=status,
            attempt_count=0,
        )
        self.db.add(delivery)
        await self.db.flush()
        await self.db.refresh(delivery)
        return delivery

    async def update_delivery_status(
        self,
        delivery_id: uuid.UUID,
        status: str,
        response_status: Optional[int] = None,
        response_body: Optional[str] = None,
    ) -> Optional[WebhookDelivery]:
        """Update delivery outcome after an attempt."""
        result = await self.db.execute(
            select(WebhookDelivery).where(WebhookDelivery.id == delivery_id)
        )
        delivery = result.scalar_one_or_none()
        if delivery is None:
            return None
        delivery.status = status
        delivery.attempt_count += 1
        delivery.last_attempted_at = datetime.now(timezone.utc)
        if response_status is not None:
            delivery.response_status = response_status
        if response_body is not None:
            delivery.response_body = response_body
        await self.db.flush()
        return delivery

    async def list_deliveries(
        self,
        webhook_id: uuid.UUID,
        limit: int = 50,
    ) -> List[WebhookDelivery]:
        """Return delivery log for a webhook, newest first."""
        result = await self.db.execute(
            select(WebhookDelivery)
            .where(WebhookDelivery.webhook_id == webhook_id)
            .order_by(WebhookDelivery.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())
