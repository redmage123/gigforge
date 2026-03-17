"""Crypto Fear & Greed Index from alternative.me."""

import httpx
from services.cache import cached


@cached(ttl=3600)
async def get_fear_greed() -> dict:
    """Get current Fear & Greed index."""
    async with httpx.AsyncClient() as client:
        resp = await client.get("https://api.alternative.me/fng/?limit=1")
        resp.raise_for_status()
        data = resp.json()
        if data.get("data"):
            entry = data["data"][0]
            return {
                "value": int(entry["value"]),
                "classification": entry["value_classification"],
                "timestamp": entry["timestamp"],
            }
        return {"value": 50, "classification": "Neutral", "timestamp": ""}
