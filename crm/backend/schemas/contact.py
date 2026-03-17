"""Pydantic schemas for contacts."""
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr

from schemas.tag import TagResponse


class ContactCreate(BaseModel):
    first_name: str
    last_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company_id: Optional[uuid.UUID] = None
    source: Optional[str] = None
    status: Optional[str] = "lead"
    custom_fields: Optional[Dict[str, Any]] = None


class ContactUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company_id: Optional[uuid.UUID] = None
    source: Optional[str] = None
    status: Optional[str] = None
    custom_fields: Optional[Dict[str, Any]] = None


class ContactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    company_id: Optional[uuid.UUID] = None
    source: Optional[str] = None
    status: str
    custom_fields: Optional[Dict[str, Any]] = None
    deleted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    tags: List[TagResponse] = []
