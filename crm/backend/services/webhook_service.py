"""Webhook service — HMAC-SHA256 signed delivery with retries (ADR-006)."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import uuid
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from repositories.webhook_repo import WebhookRepository


class WebhookService:
    """Handles async webhook dispatch with HMAC signing and retry logic."""

    MAX_RETRIES = 3
    BACKOFF_BASE = 2  # seconds

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = WebhookRepository(db)

    @staticmethod
    def compute_signature(secret: str, body: bytes) -> str:
        """Return HMAC-SHA256 hex digest of body using secret."""
        return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    async def get_webhooks_for_event(
        self,
        tenant_id: uuid.UUID,
        event_type: str,
    ) -> List[Any]:
        """Return active webhooks subscribed to event_type."""
        return await self.repo.get_active_for_event(tenant_id, event_type)

    async def dispatch(
        self,
        tenant_id: uuid.UUID,
        event_type: str,
        payload: Dict[str, Any],
        background_tasks: BackgroundTasks,
    ) -> None:
        """Enqueue background delivery for all matching webhooks."""
        webhooks = await self.get_webhooks_for_event(tenant_id, event_type)
        if not webhooks:
            return

        full_payload = {"event": event_type, "data": payload}
        body_bytes = json.dumps(full_payload, default=str).encode()

        for webhook in webhooks:
            delivery = await self.repo.log_delivery(
                webhook_id=webhook.id,
                event_type=event_type,
                payload=full_payload,
            )
            background_tasks.add_task(
                self._deliver_with_retry,
                webhook=webhook,
                delivery_id=delivery.id,
                body_bytes=body_bytes,
            )

    async def _deliver_with_retry(
        self,
        webhook: Any,
        delivery_id: uuid.UUID,
        body_bytes: bytes,
    ) -> None:
        """Attempt delivery up to MAX_RETRIES times with exponential backoff."""
        try:
            import httpx
        except ImportError:
            await self.repo.update_delivery_status(
                delivery_id=delivery_id,
                status="failed",
                response_body="httpx not available",
            )
            await self.db.commit()
            return

        signature = "sha256=" + self.compute_signature(webhook.secret or "", body_bytes)

        for attempt in range(self.MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        webhook.url,
                        content=body_bytes,
                        headers={
                            "Content-Type": "application/json",
                            "X-CRM-Signature": signature,
                            "X-CRM-Event": webhook.events[0] if webhook.events else "",
                        },
                    )

                if resp.status_code < 300:
                    await self.repo.update_delivery_status(
                        delivery_id=delivery_id,
                        status="success",
                        response_status=resp.status_code,
                        response_body=resp.text[:500],
                    )
                    await self.db.commit()
                    return
                else:
                    # Non-2xx — will retry
                    if attempt < self.MAX_RETRIES - 1:
                        await asyncio.sleep(self.BACKOFF_BASE ** (attempt + 1))

            except Exception as exc:
                if attempt < self.MAX_RETRIES - 1:
                    await asyncio.sleep(self.BACKOFF_BASE ** (attempt + 1))

        # All attempts exhausted
        await self.repo.update_delivery_status(
            delivery_id=delivery_id,
            status="failed",
        )
        await self.db.commit()
