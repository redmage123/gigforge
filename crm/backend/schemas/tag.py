"""Pydantic schemas for tags."""
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class TagCreate(BaseModel):
    name: str
    color: Optional[str] = None  # hex e.g. "#F59E0B"


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    color: Optional[str] = None
    created_at: datetime


class TagAssignRequest(BaseModel):
    tag_ids: list[uuid.UUID]
