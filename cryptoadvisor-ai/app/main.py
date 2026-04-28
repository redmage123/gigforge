"""cryptoadvisor-ai FastAPI service.

Routes:
  GET  /healthz                 — liveness + Gemma reachability
  GET  /kg/entities             — list KG entities (optional ?type=)
  GET  /kg/entity/{id}          — single entity lookup
  GET  /kg/neighbors/{id}       — 1-hop neighbors
  POST /kg/upsert-entity        — create/update entity
  POST /kg/upsert-relation      — create/update relation
  POST /rag/ingest              — chunk + embed + store a document
  POST /rag/search              — hybrid vector + keyword retrieval
  POST /signals/explain         — LLM signal explainer (RAG + KG context-enriched)
  POST /chat/stream             — streaming chat (SSE) with context enrichment
"""
from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import kg, llm, rag
from .config import settings

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("cryptoadvisor-ai")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("starting up — initializing KG + RAG")
    kg.init_db()
    rag.init_db()
    try:
        seeded = await rag.seed_corpus()
        if seeded > 0:
            log.info("RAG corpus seeded with %d chunks", seeded)
    except Exception as e:
        log.warning("RAG seed skipped: %s", e)
    yield


app = FastAPI(title="cryptoadvisor-ai", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Health ----------


@app.get("/healthz")
async def healthz() -> dict[str, Any]:
    gemma_ok = await llm.health_check()
    return {
        "status": "ok",
        "gemma_reachable": gemma_ok,
        "gemma_host": settings.gemma_host,
    }


# ---------- KG ----------


class UpsertEntityRequest(BaseModel):
    id: str
    name: str
    type: str
    props: dict | None = None


class UpsertRelationRequest(BaseModel):
    src: str
    dst: str
    type: str
    props: dict | None = None


@app.get("/kg/entities")
def list_kg_entities(type: str | None = None) -> dict:
    return {"entities": kg.list_entities(type)}


@app.get("/kg/entity/{entity_id:path}")
def get_kg_entity(entity_id: str) -> dict:
    e = kg.get_entity(entity_id)
    if not e:
        raise HTTPException(404, "entity not found")
    return e


@app.get("/kg/neighbors/{entity_id:path}")
def kg_neighbors(entity_id: str, depth: int = 1) -> dict:
    return {"neighborhood": kg.neighbors(entity_id, depth=depth)}


@app.post("/kg/upsert-entity")
def upsert_kg_entity(body: UpsertEntityRequest) -> dict:
    kg.upsert_entity(body.id, body.name, body.type, body.props)
    return {"ok": True}


@app.post("/kg/upsert-relation")
def upsert_kg_relation(body: UpsertRelationRequest) -> dict:
    kg.upsert_relation(body.src, body.dst, body.type, body.props)
    return {"ok": True}


# ---------- RAG ----------


class IngestRequest(BaseModel):
    source: str
    text: str
    title: str | None = None
    metadata: dict | None = None


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    alpha: float = 0.7


@app.post("/rag/ingest")
async def rag_ingest(body: IngestRequest) -> dict:
    n = await rag.ingest(body.source, body.text, body.title, body.metadata)
    return {"chunks": n}


@app.post("/rag/search")
async def rag_search(body: SearchRequest) -> dict:
    results = await rag.search(body.query, top_k=body.top_k, alpha=body.alpha)
    return {"results": results}


@app.get("/rag/sources")
def rag_sources() -> dict:
    return {"sources": rag.list_sources()}


# ---------- Signal explainer ----------


class ExplainSignalRequest(BaseModel):
    symbol: str
    action: str
    conviction: int
    contributors: list[dict]
    rawPolarity: float | None = None


@app.post("/signals/explain")
async def explain_signal(body: ExplainSignalRequest) -> dict:
    """Produce a human-readable narrative for a composite signal.

    Uses the KG (asset context, related events, strategy explanations) and
    RAG (relevant indicator/strategy passages) to ground the LLM output.
    """
    kg_context = kg.context_for_asset(body.symbol)
    contributor_summary = "\n".join(
        f"- {c['source']} (vote {c['vote']:+.2f}, weight {c['weight']:.2f}): {c['detail']}"
        for c in body.contributors
    )
    rag_query = f"{body.symbol} {body.action} {' '.join(c['source'] for c in body.contributors)}"
    rag_hits = await rag.search(rag_query, top_k=3)
    rag_context = "\n\n".join(
        f"[{h['title']}]\n{h['chunk']}" for h in rag_hits if h["score"] > 0.05
    )

    prompt = f"""You are a quantitative crypto-trading advisor. Explain in 3-5 sentences why the following composite signal was generated. Be concrete: cite the most influential contributors. Do NOT add disclaimers about not being financial advice — the UI handles that.

ASSET CONTEXT:
{kg_context}

CONTRIBUTING SIGNALS:
{contributor_summary}

REFERENCE PASSAGES (use only if relevant):
{rag_context}

COMPOSITE: {body.action} {body.symbol} with {body.conviction}% conviction.

Explanation:"""

    try:
        response = await llm.generate(prompt, max_tokens=400, temperature=0.4)
    except Exception as e:
        log.warning("LLM explain failed, returning fallback: %s", e)
        response = (
            f"Composite {body.action} for {body.symbol} with {body.conviction}% conviction. "
            f"Top contributors: {', '.join(c['source'] for c in body.contributors[:3])}."
        )

    return {
        "explanation": response.strip(),
        "kg_context": kg_context,
        "rag_sources": [
            {"title": h["title"], "source": h["source"], "score": round(h["score"], 3)}
            for h in rag_hits
        ],
    }


# ---------- Chat ----------


class ChatMessage(BaseModel):
    role: str  # 'user' | 'assistant' | 'system'
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    symbol: str | None = None  # optional asset context
    use_rag: bool = True


SYSTEM_PROMPT = """You are CryptoAdvisor's research assistant. You help users \
understand technical indicators, sentiment, on-chain metrics, and portfolio \
strategies for cryptocurrency. Be concise, factual, and concrete. Cite \
specific indicators or data sources when you reference them.

You have access to:
- Real-time price data and computed indicators (SMA, RSI, MACD, Bollinger, ATR, Donchian)
- Composite signal feed (Donchian + HMM regime + sentiment + on-chain + order book)
- Sentiment from Reddit, Hacker News, GDELT news tone, and Crypto Fear & Greed Index
- On-chain metrics (Mempool fees, Etherscan gas, DefiLlama TVL)
- Historical backtests of strategies against buy-and-hold

When the user asks about a specific asset, the system will provide its \
knowledge-graph context and any matched RAG passages — use them. \
Do NOT add boilerplate disclaimers; the UI handles "not financial advice"."""


async def _build_chat_messages(req: ChatRequest) -> list[dict]:
    """Compose the message list sent to Gemma — system prompt + KG + RAG + user history."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # KG context
    if req.symbol:
        kg_text = kg.context_for_asset(req.symbol)
        if kg_text:
            messages.append(
                {
                    "role": "system",
                    "content": f"KNOWLEDGE GRAPH CONTEXT for {req.symbol}:\n{kg_text}",
                }
            )

    # RAG context (last user message → search)
    if req.use_rag:
        last_user = next((m for m in reversed(req.messages) if m.role == "user"), None)
        if last_user:
            try:
                hits = await rag.search(last_user.content, top_k=3)
                rag_text = "\n\n".join(
                    f"[{h['title']}] {h['chunk']}" for h in hits if h["score"] > 0.05
                )
                if rag_text:
                    messages.append(
                        {
                            "role": "system",
                            "content": f"REFERENCE PASSAGES:\n{rag_text}",
                        }
                    )
            except Exception as e:
                log.warning("RAG enrichment failed: %s", e)

    for m in req.messages:
        messages.append({"role": m.role, "content": m.content})
    return messages


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    """SSE streaming chat. Each event is a JSON line with `delta` text."""
    msgs = await _build_chat_messages(req)

    async def event_gen() -> AsyncIterator[str]:
        try:
            async for chunk in llm.chat_stream(msgs, max_tokens=1024):
                yield f"data: {json.dumps({'delta': chunk})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            log.exception("chat stream failed")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


# ---------- Chat-feedback corpus (STORY-1310 lite) ----------


class FeedbackRequest(BaseModel):
    user_message: str
    assistant_message: str
    rating: int  # +1, 0, -1
    rewrite: str | None = None


@app.post("/chat/feedback")
def submit_feedback(body: FeedbackRequest) -> dict:
    """Persist a (user, assistant, rating, rewrite) tuple for fine-tune corpus."""
    import sqlite3
    import os

    feedback_path = "/data/feedback.sqlite"
    os.makedirs(os.path.dirname(feedback_path), exist_ok=True)
    with sqlite3.connect(feedback_path) as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY,
                user_message TEXT, assistant_message TEXT,
                rating INTEGER, rewrite TEXT,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            )"""
        )
        conn.execute(
            "INSERT INTO feedback (user_message, assistant_message, rating, rewrite) VALUES (?, ?, ?, ?)",
            (body.user_message, body.assistant_message, body.rating, body.rewrite),
        )
    return {"ok": True}
