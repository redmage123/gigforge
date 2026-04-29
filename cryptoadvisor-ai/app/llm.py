"""Gemma-4 LLM proxy client (STORY-1305).

Wraps the dev-server Ollama (Gemma) at 176.9.99.103:11434 with bearer auth.
Streams chat completions back as Server-Sent Events.
"""
from __future__ import annotations

import json
from typing import AsyncIterator

import httpx

from .config import settings


def _headers() -> dict[str, str]:
    h = {"Content-Type": "application/json"}
    if settings.gemma_token:
        h["Authorization"] = f"Bearer {settings.gemma_token}"
    return h


async def health_check() -> bool:
    """Returns True if the Gemma server responds to /api/version."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(
                f"{settings.gemma_host}/api/version", headers=_headers()
            )
            return r.status_code == 200
    except Exception:
        return False


async def list_models() -> list[str]:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{settings.gemma_host}/api/tags", headers=_headers())
        r.raise_for_status()
        data = r.json()
        return [m["name"] for m in data.get("models", [])]


async def generate(
    prompt: str,
    *,
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 1024,
    stream: bool = False,
) -> str:
    """Single-shot non-streaming completion. Returns the response string.

    Routes through /api/chat with think=False so reasoning-tuned Gemma
    variants (which silently swallow tokens into a hidden "thinking" field
    on /api/generate) actually emit a visible answer.
    """
    payload = {
        "model": model or settings.gemma_model_chat,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "think": False,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            f"{settings.gemma_host}/api/chat",
            headers=_headers(),
            json=payload,
        )
        r.raise_for_status()
        return r.json().get("message", {}).get("content", "")


async def chat_stream(
    messages: list[dict],
    *,
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> AsyncIterator[str]:
    """Streaming chat completion. Yields token chunks as they arrive."""
    payload = {
        "model": model or settings.gemma_model_chat,
        "messages": messages,
        "stream": True,
        "think": False,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "POST",
            f"{settings.gemma_host}/api/chat",
            headers=_headers(),
            json=payload,
        ) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                msg = obj.get("message", {})
                content = msg.get("content", "")
                if content:
                    yield content
                if obj.get("done"):
                    break


async def embed(text: str) -> list[float]:
    """Embed a single text via the embedding model on the Gemma server."""
    payload = {"model": settings.gemma_model_embed, "prompt": text}
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{settings.gemma_host}/api/embeddings",
            headers=_headers(),
            json=payload,
        )
        r.raise_for_status()
        return r.json().get("embedding", [])
