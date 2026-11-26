"""BACSWN — in-memory cache with per-entry TTL.

What: ``TTLCache``, a dict of key -> (value, expiry), and the shared ``cache`` instance.

Why: upstream feeds (AWC METAR/TAF, OpenSky, Open-Meteo) are polled far more often
than they change and some rate-limit us; caching responses for a few seconds to
minutes keeps the UI live without hammering them.

How: ``set`` stores the value with ``time.time() + ttl``; ``get`` returns it until it
expires and evicts it lazily on the first read after expiry. Entries are never swept in
the background, so a key that is never read again stays in memory.
"""

import time
from typing import Any


class TTLCache:
    """Simple TTL cache for use from the asyncio event loop.

    Not thread-safe: it has no lock, which is fine because every caller runs on the
    single event-loop thread and no method awaits.
    """

    def __init__(self):
        """Start with an empty store."""
        self._store: dict[str, tuple[Any, float]] = {}

    def get(self, key: str) -> Any | None:
        """Return the cached value, or None if the key is missing or expired (and evict it)."""
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if time.time() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl: int) -> None:
        """Store ``value`` under ``key`` for ``ttl`` seconds, replacing any previous entry."""
        self._store[key] = (value, time.time() + ttl)

    def delete(self, key: str) -> None:
        """Remove ``key`` if present."""
        self._store.pop(key, None)

    def clear(self) -> None:
        """Remove every entry."""
        self._store.clear()

    def keys(self) -> list[str]:
        """Keys whose entries have not yet expired (expired ones are not evicted here)."""
        now = time.time()
        return [k for k, (_, exp) in self._store.items() if now <= exp]


# Global cache instance
cache = TTLCache()
