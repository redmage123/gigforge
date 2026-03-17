"""TTL cache wrapper for async functions."""

import asyncio
import functools
from cachetools import TTLCache

# Global caches by TTL
_caches: dict[int, TTLCache] = {}


def get_cache(ttl: int, maxsize: int = 128) -> TTLCache:
    if ttl not in _caches:
        _caches[ttl] = TTLCache(maxsize=maxsize, ttl=ttl)
    return _caches[ttl]


def cached(ttl: int):
    """Decorator for caching async function results with TTL."""
    def decorator(func):
        cache = get_cache(ttl)

        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            key = f"{func.__name__}:{args}:{sorted(kwargs.items())}"
            if key in cache:
                return cache[key]
            result = await func(*args, **kwargs)
            cache[key] = result
            return result

        return wrapper
    return decorator
