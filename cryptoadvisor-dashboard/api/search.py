"""Unified search API — searches across RAG index, user memory, and live data."""

from fastapi import APIRouter, Request, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

from services.rag import search as rag_search, get_stats as rag_stats, get_context, CATEGORIES
from services.user_memory import search_facts
from services.claude_cli import ask_claude

router = APIRouter()


class SearchRequest(BaseModel):
    query: str
    category: str = ""
    limit: int = 20
    include_ai_answer: bool = False


class AskRequest(BaseModel):
    question: str
    context_categories: list[str] = []


@router.get("/")
async def search_all(
    request: Request,
    q: str = Query(..., description="Search query"),
    category: str = Query("", description="Filter by category"),
    limit: int = Query(20, description="Max results"),
):
    """Search across all indexed content."""
    try:
        username = request.state.user.get("sub", "")

        # Search RAG index
        rag_results = await rag_search(
            query=q,
            limit=limit,
            category=category,
            username=username,
        )

        # Also search user memory facts
        memory_results = await search_facts(username, q, limit=5) if username else []

        return {
            "query": q,
            "results": rag_results,
            "memory_results": memory_results,
            "total": len(rag_results),
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/ask")
async def ask_with_rag(request: Request, body: AskRequest):
    """Ask a question with RAG context — retrieves relevant docs and sends to Claude."""
    try:
        username = request.state.user.get("sub", "")

        # Build RAG context
        context = await get_context(
            query=body.question,
            username=username,
            categories=body.context_categories or None,
        )

        # Build prompt with context
        prompt = f"""You are CryptoAdvisor, an AI crypto analyst. Answer the user's question using the provided context and your knowledge.

{context}

User question: {body.question}

Provide a clear, actionable answer. If the context contains relevant data, reference it. If you're uncertain, say so."""

        answer = await ask_claude(prompt)

        return {
            "question": body.question,
            "answer": answer,
            "context_used": bool(context),
            "context_length": len(context),
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/stats")
async def search_stats(request: Request):
    """Get RAG index statistics."""
    try:
        username = request.state.user.get("sub", "")
        stats = await rag_stats(username)
        stats["categories"] = CATEGORIES
        return stats
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/suggest")
async def search_suggest(
    request: Request,
    q: str = Query(..., description="Partial query for suggestions"),
):
    """Return search suggestions based on indexed titles."""
    try:
        username = request.state.user.get("sub", "")
        results = await rag_search(query=q, limit=5, username=username)
        suggestions = []
        seen = set()
        for r in results:
            title = r.get("title", "").strip()
            if title and title not in seen:
                seen.add(title)
                suggestions.append({
                    "title": title,
                    "category": r.get("category", ""),
                })
        return {"suggestions": suggestions}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
