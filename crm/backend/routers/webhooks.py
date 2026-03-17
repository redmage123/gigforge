"""Webhook registration and delivery log — US-314."""
from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field, HttpUrl, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

import datetime as _dt_mod

from core.dependencies import get_current_user
from database import get_db
from repositories import webhook_repo as _webhook_repo_mod

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

# Supported event types (US-314)
VALID_EVENTS = {
    "contact.created", "contact.updated", "contact.deleted",
    "deal.created", "deal.updated", "deal.stage_changed",
    "task.created", "task.completed",
}


class WebhookCreate(BaseModel):
    url: str
    events: List[str] = Field(..., min_length=1)
    is_active: bool = True

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("url must start with http:// or https://")
        return v

    @field_validator("events")
    @classmethod
    def validate_events(cls, v: List[str]) -> List[str]:
        if not v:
            raise ValueError("events must not be empty")
        return v


class WebhookUpdate(BaseModel):
    url: Optional[str] = None
    events: Optional[List[str]] = None
    is_active: Optional[bool] = None


class DispatchRequest(BaseModel):
    event: str
    payload: Dict[str, Any]


def _safe_dt(val):
    if isinstance(val, (_dt_mod.datetime, _dt_mod.date)):
        return val.isoformat()
    return None


def _hmac_signature(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _webhook_out(w: Any) -> Dict[str, Any]:
    """Never return the secret in API responses."""
    return {
        "id": str(w.id),
        "tenant_id": str(w.tenant_id),
        "url": w.url,
        "events": w.events,
        "is_active": w.is_active,
        "created_at": _safe_dt(w.created_at),
        "updated_at": _safe_dt(w.updated_at),
    }


def _delivery_out(d: Any) -> Dict[str, Any]:
    return {
        "id": str(d.id),
        "webhook_id": str(d.webhook_id),
        "event_type": d.event_type,
        "status": d.status,
        "attempt_count": d.attempt_count,
        "response_status": d.response_status,
        "response_body": d.response_body,
        "last_attempted_at": _safe_dt(d.last_attempted_at),
        "created_at": _safe_dt(d.created_at),
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def register_webhook(
    body: WebhookCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = _webhook_repo_mod.WebhookRepository(db)
    webhook = await repo.create(
        tenant_id=current_user.tenant_id,
        url=body.url,
        events=body.events,
        is_active=body.is_active,
    )
    await db.commit()
    await db.refresh(webhook)
    return _webhook_out(webhook)


@router.get("")
async def list_webhooks(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[Dict[str, Any]]:
    repo = _webhook_repo_mod.WebhookRepository(db)
    webhooks = await repo.list(current_user.tenant_id)
    return [_webhook_out(w) for w in webhooks]


@router.get("/{webhook_id}")
async def get_webhook(
    webhook_id: uuid.UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    repo = _webhook_repo_mod.WebhookRepository(db)
    webhook = await repo.get_by_id(webhook_id, current_user.tenant_id)
    if webhook is None:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return _webhook_out(webhook)


@router.put("/{webhook_id}")
async def update_webhook(
    webhook_id: uuid.UUID,
    body: WebhookUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    updates = body.model_dump(exclude_none=True)
    if "events" in updates:
        unknown = set(updates["events"]) - VALID_EVENTS
        if unknown:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown event types: {sorted(unknown)}",
            )
    repo = _webhook_repo_mod.WebhookRepository(db)
    webhook = await repo.update(webhook_id, current_user.tenant_id, updates)
    if webhook is None:
        raise HTTPException(status_code=404, detail="Webhook not found")
    await db.commit()
    await db.refresh(webhook)
    return _webhook_out(webhook)


@router.delete("/{webhook_id}", status_code=204, response_class=Response)
async def delete_webhook(
    webhook_id: uuid.UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = _webhook_repo_mod.WebhookRepository(db)
    deleted = await repo.delete(webhook_id, current_user.tenant_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Webhook not found")
    await db.commit()


@router.get("/{webhook_id}/deliveries")
async def get_webhook_deliveries(
    webhook_id: uuid.UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Return delivery log for a webhook (tenant-scoped via webhook ownership)."""
    repo = _webhook_repo_mod.WebhookRepository(db)
    deliveries = await repo.list_deliveries(webhook_id)
    return [_delivery_out(d) for d in deliveries]


@router.post("/dispatch", status_code=202)
async def dispatch_event(
    body: DispatchRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Dispatch an event to all active subscribed webhooks (async fire-and-forget)."""
    import asyncio
    try:
        import httpx
        _httpx_available = True
    except ImportError:
        _httpx_available = False

    repo = _webhook_repo_mod.WebhookRepository(db)
    hooks = await repo.get_active_for_event(current_user.tenant_id, body.event)

    if not hooks or not _httpx_available:
        return {"event": body.event, "dispatched": 0, "hooks": len(hooks)}

    payload_bytes = json.dumps({"event": body.event, "data": body.payload}).encode()

    async def _fire(hook: Any) -> None:
        sig = _hmac_signature(hook.secret or "", payload_bytes)
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    hook.url,
                    content=payload_bytes,
                    headers={
                        "Content-Type": "application/json",
                        "X-CRM-Signature": sig,
                        "X-CRM-Event": body.event,
                    },
                )
        except Exception:
            pass  # Fire-and-forget; failures are silent

    asyncio.ensure_future(asyncio.gather(*[_fire(h) for h in hooks]))
    return {"event": body.event, "dispatched": len(hooks)}
