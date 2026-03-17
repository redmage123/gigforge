"""Etherscan-compatible API client for transaction history, token balances, NFTs."""

import os
import httpx
from services.cache import cached

# Free-tier Etherscan-compatible APIs (no key required for basic rate limits)
EXPLORER_APIS = {
    "ethereum": "https://api.etherscan.io/api",
    "bsc": "https://api.bscscan.com/api",
    "polygon": "https://api.polygonscan.com/api",
    "arbitrum": "https://api.arbiscan.io/api",
    "optimism": "https://api-optimistic.etherscan.io/api",
    "avalanche": "https://api.snowtrace.io/api",
    "base": "https://api.basescan.org/api",
}

# Optional API keys (free tier gives higher rate limits)
API_KEYS = {
    chain: os.getenv(f"{chain.upper()}_ETHERSCAN_KEY", "")
    for chain in EXPLORER_APIS
}


async def _query(chain: str, params: dict) -> dict:
    """Make an Etherscan API query."""
    base_url = EXPLORER_APIS.get(chain)
    if not base_url:
        return {"status": "0", "message": f"Unsupported chain: {chain}", "result": []}
    key = API_KEYS.get(chain, "")
    if key:
        params["apikey"] = key
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(base_url, params=params)
        resp.raise_for_status()
        return resp.json()


@cached(ttl=120)
async def get_transactions(chain: str, address: str, page: int = 1, limit: int = 50) -> list[dict]:
    """Get normal transaction history."""
    data = await _query(chain, {
        "module": "account", "action": "txlist",
        "address": address, "startblock": 0, "endblock": 99999999,
        "page": page, "offset": limit, "sort": "desc",
    })
    return data.get("result", []) if isinstance(data.get("result"), list) else []


@cached(ttl=120)
async def get_token_transfers(chain: str, address: str, page: int = 1, limit: int = 50) -> list[dict]:
    """Get ERC-20 token transfer history."""
    data = await _query(chain, {
        "module": "account", "action": "tokentx",
        "address": address, "startblock": 0, "endblock": 99999999,
        "page": page, "offset": limit, "sort": "desc",
    })
    return data.get("result", []) if isinstance(data.get("result"), list) else []


@cached(ttl=120)
async def get_nft_transfers(chain: str, address: str, page: int = 1, limit: int = 50) -> list[dict]:
    """Get ERC-721 NFT transfer history."""
    data = await _query(chain, {
        "module": "account", "action": "tokennfttx",
        "address": address, "startblock": 0, "endblock": 99999999,
        "page": page, "offset": limit, "sort": "desc",
    })
    return data.get("result", []) if isinstance(data.get("result"), list) else []


@cached(ttl=300)
async def get_token_balances(chain: str, address: str) -> list[dict]:
    """Derive current token balances from transfer history."""
    transfers = await get_token_transfers(chain, address, limit=200)
    # Aggregate balances from transfer events
    balances: dict[str, dict] = {}
    addr_lower = address.lower()
    for tx in transfers:
        contract = tx.get("contractAddress", "")
        symbol = tx.get("tokenSymbol", "?")
        name = tx.get("tokenName", "Unknown")
        decimals = int(tx.get("tokenDecimal", "18") or "18")
        value = int(tx.get("value", "0")) / (10 ** decimals)

        if contract not in balances:
            balances[contract] = {
                "contract": contract, "symbol": symbol,
                "name": name, "decimals": decimals, "balance": 0.0,
            }

        if tx.get("to", "").lower() == addr_lower:
            balances[contract]["balance"] += value
        elif tx.get("from", "").lower() == addr_lower:
            balances[contract]["balance"] -= value

    # Filter out zero/negative balances
    return [b for b in balances.values() if b["balance"] > 0.001]
