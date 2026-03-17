"""WebSocket price manager for real-time cryptocurrency price feeds."""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import WebSocket

from config import COINGECKO_API

logger = logging.getLogger(__name__)

TRACKED_COINS = [
    "bitcoin", "ethereum", "solana", "cardano", "polkadot",
    "avalanche-2", "chainlink", "uniswap", "aave", "matic-network",
]

POLL_INTERVAL_SECONDS = 10


class PriceManager:
    """Manages WebSocket connections and broadcasts live price updates."""

    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._latest_prices: dict[str, Any] = {}
        self._running: bool = False

    async def connect(self, ws: WebSocket) -> None:
        """Accept and register a new WebSocket client."""
        await ws.accept()
        self._clients.add(ws)
        logger.info("WebSocket client connected. Total clients: %d", len(self._clients))
        # Send last known prices immediately so the client isn't staring at blanks
        if self._latest_prices:
            try:
                await ws.send_json({
                    "type": "prices",
                    "data": self._latest_prices,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
            except Exception:
                pass

    def disconnect(self, ws: WebSocket) -> None:
        """Remove a WebSocket client from the active set."""
        self._clients.discard(ws)
        logger.info("WebSocket client disconnected. Total clients: %d", len(self._clients))

    async def broadcast(self, data: dict[str, Any]) -> None:
        """Send a message to every connected client, removing dead connections."""
        dead: list[WebSocket] = []
        message = json.dumps(data)
        for ws in self._clients:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._clients.discard(ws)

    async def _fetch_prices(self) -> dict[str, Any] | None:
        """Fetch current prices from CoinGecko /simple/price endpoint."""
        ids = ",".join(TRACKED_COINS)
        url = f"{COINGECKO_API}/simple/price"
        params = {
            "ids": ids,
            "vs_currencies": "usd",
            "include_24hr_change": "true",
            "include_market_cap": "true",
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPStatusError as exc:
            logger.warning("CoinGecko HTTP error %s: %s", exc.response.status_code, exc)
            return None
        except Exception as exc:
            logger.warning("Failed to fetch prices from CoinGecko: %s", exc)
            return None

    async def start_price_feed(self) -> None:
        """Poll CoinGecko every POLL_INTERVAL_SECONDS and broadcast to clients."""
        if self._running:
            logger.warning("Price feed already running — skipping duplicate start")
            return
        self._running = True
        logger.info("Starting price feed (interval=%ds)", POLL_INTERVAL_SECONDS)
        try:
            while self._running:
                prices = await self._fetch_prices()
                if prices is not None:
                    self._latest_prices = prices
                    payload = {
                        "type": "prices",
                        "data": prices,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                    await self.broadcast(payload)
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            logger.info("Price feed cancelled")
        finally:
            self._running = False

    def stop(self) -> None:
        """Signal the price feed loop to stop."""
        self._running = False


# Singleton instance
price_manager = PriceManager()
