"""Whale transaction monitoring — detect large transfers."""

import httpx
from services.blockchain.etherscan import get_transactions
from services.cache import cached
from config import BITCOIN_API


@cached(ttl=120)
async def get_whale_transactions(chain: str = "ethereum", min_value_eth: float = 100) -> list[dict]:
    """Get recent large transactions on a chain."""
    if chain == "bitcoin":
        return await _bitcoin_whales(min_value_eth)
    # Use Etherscan recent blocks for the chain
    # Query the zero address or a known whale tracker alternative
    # For simplicity, we scan recent txs from latest blocks
    try:
        # Get recent large txs (Etherscan internal txs can help)
        from services.blockchain.ethereum import EVMClient
        client = EVMClient(chain)
        block = await client.get_latest_block()
        block_num = block["number"]

        # Fetch recent normal transactions from a few blocks
        results = []
        txs = await get_transactions(chain, "0x0000000000000000000000000000000000000000", limit=100)
        for tx in txs[:50]:
            value_eth = int(tx.get("value", "0")) / 1e18
            if value_eth >= min_value_eth:
                results.append({
                    "hash": tx.get("hash", ""),
                    "from": tx.get("from", ""),
                    "to": tx.get("to", ""),
                    "value": round(value_eth, 4),
                    "symbol": "ETH",
                    "chain": chain,
                    "block": int(tx.get("blockNumber", 0)),
                    "timestamp": int(tx.get("timeStamp", 0)),
                })
        return results[:20]
    except Exception:
        return []


async def _bitcoin_whales(min_btc: float = 10) -> list[dict]:
    """Get recent large Bitcoin transactions."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{BITCOIN_API}/mempool/recent")
            resp.raise_for_status()
            txs = resp.json()
            results = []
            for tx in txs[:100]:
                value_btc = tx.get("value", 0) / 1e8
                if value_btc >= min_btc:
                    results.append({
                        "hash": tx.get("txid", ""),
                        "from": "mempool",
                        "to": "",
                        "value": round(value_btc, 4),
                        "symbol": "BTC",
                        "chain": "bitcoin",
                        "block": 0,
                        "timestamp": 0,
                    })
            return results[:20]
    except Exception:
        return []
