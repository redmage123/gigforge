"""Keyless Blockscout v2 API client for Ethereum mainnet (balances, tokens, transactions, transfers).

https://eth.blockscout.com/api-docs. Free and needs no key; other chains' Blockscout instances sit
behind bot challenges, so only Ethereum mainnet is served from here.
"""

import httpx

BASE = "https://eth.blockscout.com/api/v2"
_UA = {"User-Agent": "Mozilla/5.0 AssetAdvisor", "Accept": "application/json"}
TIMEOUT = 30.0  # the API can be slow for busy addresses


class BlockscoutError(Exception):
    """Blockscout could not answer; the message is safe to show."""


async def get(path: str, params: dict | None = None, client: httpx.AsyncClient | None = None) -> dict:
    async def run(c: httpx.AsyncClient) -> dict:
        try:
            r = await c.get(f"{BASE}{path}", params=params, timeout=TIMEOUT)
        except httpx.HTTPError as exc:
            raise BlockscoutError(f"Blockscout did not respond ({type(exc).__name__})") from exc
        if r.status_code == 404:
            return {}
        if r.status_code == 429:
            raise BlockscoutError("Blockscout rate limit reached. Try again in a minute.")
        if r.status_code >= 400:
            raise BlockscoutError(f"Blockscout returned HTTP {r.status_code}")
        try:
            return r.json()
        except ValueError as exc:
            raise BlockscoutError("Blockscout returned an unexpected response") from exc

    if client is not None:
        return await run(client)
    async with httpx.AsyncClient(timeout=TIMEOUT, headers=_UA) as c:
        return await run(c)


async def paged(path: str, params: dict | None = None, max_pages: int = 10,
                client: httpx.AsyncClient | None = None) -> tuple[list[dict], bool]:
    """Follow next_page_params up to max_pages. Returns (items, truncated)."""
    items: list[dict] = []
    query = dict(params or {})
    for _ in range(max_pages):
        data = await get(path, query, client)
        items.extend(data.get("items") or [])
        nxt = data.get("next_page_params")
        if not nxt:
            return items, False
        query = {**(params or {}), **nxt}
    return items, True


def client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=TIMEOUT, headers=_UA)


def scaled(raw, decimals) -> float | None:
    """Integer token amount string -> float units."""
    try:
        return int(raw) / (10 ** int(decimals if decimals not in (None, "") else 18))
    except (TypeError, ValueError):
        return None


def rate(token: dict) -> float | None:
    try:
        v = float(token.get("exchange_rate"))
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def trusted(token: dict) -> bool:
    """Blockscout flags known spam/scam tokens; their quoted prices are not to be trusted."""
    return token.get("reputation", "ok") == "ok" and not token.get("is_scam")
