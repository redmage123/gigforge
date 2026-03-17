"""API Keys management router — CRUD for per-user encrypted API keys."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services.api_keys import (
    get_integrations,
    get_categories,
    get_user_keys,
    save_user_key,
    delete_user_key,
)

router = APIRouter()


class SaveKeyRequest(BaseModel):
    integration_id: str
    fields: dict[str, str]


def _get_username(request: Request) -> str:
    user = getattr(request.state, "user", {})
    return user.get("sub", "")


@router.get("/integrations")
async def list_integrations():
    """List all supported third-party integrations and their fields."""
    return {
        "integrations": get_integrations(),
        "categories": get_categories(),
    }


@router.get("/keys")
async def list_keys(request: Request):
    """Get all configured API keys for the current user (masked)."""
    username = _get_username(request)
    if not username:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})
    return {"keys": get_user_keys(username)}


@router.post("/keys")
async def save_key(req: SaveKeyRequest, request: Request):
    """Save or update API key(s) for an integration."""
    username = _get_username(request)
    if not username:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    # Validate integration exists
    valid_ids = {i["id"] for i in get_integrations()}
    if req.integration_id not in valid_ids:
        return JSONResponse(status_code=400, content={"error": "Unknown integration"})

    # Validate fields aren't empty
    non_empty = {k: v for k, v in req.fields.items() if v and v.strip()}
    if not non_empty:
        return JSONResponse(status_code=400, content={"error": "At least one field is required"})

    save_user_key(username, req.integration_id, non_empty)
    return {"message": f"API key for {req.integration_id} saved successfully"}


@router.delete("/keys/{integration_id}")
async def remove_key(integration_id: str, request: Request):
    """Remove all stored keys for an integration."""
    username = _get_username(request)
    if not username:
        return JSONResponse(status_code=401, content={"error": "Not authenticated"})

    if delete_user_key(username, integration_id):
        return {"message": f"API key for {integration_id} removed"}
    return JSONResponse(status_code=404, content={"error": "Key not found"})
