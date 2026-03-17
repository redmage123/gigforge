"""User memory API — CRUD for per-user RAG facts."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

from services.user_memory import (
    add_fact, get_facts, update_fact, delete_fact, delete_all_facts,
    search_facts, get_memory_stats, CATEGORIES,
)

router = APIRouter()


class FactCreate(BaseModel):
    fact: str
    category: str = "general"


class FactUpdate(BaseModel):
    fact: str
    category: Optional[str] = None


class FactSearch(BaseModel):
    query: str
    limit: int = 10


@router.get("/")
async def list_facts(request: Request, category: Optional[str] = None):
    """List all facts for the current user, optionally filtered by category."""
    try:
        username = request.state.user.get("sub", "")
        if not username:
            return JSONResponse({"error": "Not authenticated"}, status_code=401)
        facts = await get_facts(username, category=category)
        return {"facts": facts, "count": len(facts)}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/")
async def create_fact(request: Request, body: FactCreate):
    """Add a new fact manually."""
    try:
        username = request.state.user.get("sub", "")
        if not username:
            return JSONResponse({"error": "Not authenticated"}, status_code=401)
        if len(body.fact.strip()) < 5:
            return JSONResponse({"error": "Fact too short"}, status_code=400)
        fact_id = await add_fact(username, body.fact, body.category, source="manual")
        return {"id": fact_id, "message": "Fact saved"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.put("/{fact_id}")
async def edit_fact(request: Request, fact_id: int, body: FactUpdate):
    """Update an existing fact."""
    try:
        username = request.state.user.get("sub", "")
        if not username:
            return JSONResponse({"error": "Not authenticated"}, status_code=401)
        ok = await update_fact(username, fact_id, body.fact, body.category)
        if not ok:
            return JSONResponse({"error": "Fact not found"}, status_code=404)
        return {"message": "Fact updated"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.delete("/{fact_id}")
async def remove_fact(request: Request, fact_id: int):
    """Delete a single fact."""
    try:
        username = request.state.user.get("sub", "")
        if not username:
            return JSONResponse({"error": "Not authenticated"}, status_code=401)
        ok = await delete_fact(username, fact_id)
        if not ok:
            return JSONResponse({"error": "Fact not found"}, status_code=404)
        return {"message": "Fact deleted"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.delete("/")
async def clear_all_facts(request: Request):
    """Delete all facts for the current user."""
    try:
        username = request.state.user.get("sub", "")
        if not username:
            return JSONResponse({"error": "Not authenticated"}, status_code=401)
        count = await delete_all_facts(username)
        return {"deleted": count, "message": f"Deleted {count} facts"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/search")
async def search_memory(request: Request, body: FactSearch):
    """Search facts using full-text search."""
    try:
        username = request.state.user.get("sub", "")
        if not username:
            return JSONResponse({"error": "Not authenticated"}, status_code=401)
        results = await search_facts(username, body.query, limit=body.limit)
        return {"results": results, "count": len(results)}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/stats")
async def memory_stats(request: Request):
    """Get memory statistics for the current user."""
    try:
        username = request.state.user.get("sub", "")
        if not username:
            return JSONResponse({"error": "Not authenticated"}, status_code=401)
        stats = await get_memory_stats(username)
        return stats
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/categories")
async def list_categories(request: Request):
    """List available fact categories."""
    return {"categories": CATEGORIES}
