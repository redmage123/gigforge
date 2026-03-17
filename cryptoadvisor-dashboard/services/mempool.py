"""Mempool monitoring service for ETH and BTC."""

import httpx
from cachetools import TTLCache

from config import ETHERSCAN_APIS

_cache = TTLCache(maxsize=16, ttl=15)
_TIMEOUT = 10.0


async def get_eth_mempool_stats() -> dict:
    """Get Ethereum mempool statistics via Etherscan gas oracle."""
    cache_key = "eth_mempool"
    if cache_key in _cache:
        return _cache[cache_key]

    result: dict = {"chain": "ethereum", "pending_tx_count": None, "avg_gas_price_gwei": None, "pending_value_eth": None}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            # Etherscan gas oracle (no API key needed for basic rate)
            gas_url = f"{ETHERSCAN_APIS['ethereum']}?module=gastracker&action=gasoracle"
            resp = await client.get(gas_url)
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") == "1" and data.get("result"):
                gas_data = data["result"]
                result["avg_gas_price_gwei"] = float(gas_data.get("ProposeGasPrice", 0))
                result["fast_gas_gwei"] = float(gas_data.get("FastGasPrice", 0))
                result["safe_gas_gwei"] = float(gas_data.get("SafeGasPrice", 0))
                result["base_fee_gwei"] = float(gas_data.get("suggestBaseFee", 0))

            # Etherscan pending tx count proxy
            pending_url = f"{ETHERSCAN_APIS['ethereum']}?module=proxy&action=eth_getBlockByNumber&tag=pending&boolean=false"
            resp2 = await client.get(pending_url)
            if resp2.status_code == 200:
                block_data = resp2.json()
                if block_data.get("result") and block_data["result"].get("transactions"):
                    result["pending_tx_count"] = len(block_data["result"]["transactions"])

    except Exception as e:
        result["error"] = str(e)

    _cache[cache_key] = result
    return result


async def get_btc_mempool_stats() -> dict:
    """Get Bitcoin mempool statistics from mempool.space."""
    cache_key = "btc_mempool"
    if cache_key in _cache:
        return _cache[cache_key]

    result: dict = {"chain": "bitcoin"}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            # Mempool stats
            mempool_resp = await client.get("https://mempool.space/api/mempool")
            mempool_resp.raise_for_status()
            mempool_data = mempool_resp.json()

            result["tx_count"] = mempool_data.get("count", 0)
            result["total_vsize"] = mempool_data.get("vsize", 0)
            result["total_fee_btc"] = mempool_data.get("total_fee", 0) / 1e8  # satoshis to BTC

            # Fee size breakdown
            fee_histogram = mempool_data.get("fee_histogram", [])
            if fee_histogram:
                result["fee_histogram"] = fee_histogram[:10]  # Top 10 fee ranges

            # Recommended fees
            fees_resp = await client.get("https://mempool.space/api/v1/fees/recommended")
            fees_resp.raise_for_status()
            fees_data = fees_resp.json()

            result["recommended_fees"] = {
                "fastest": fees_data.get("fastestFee", 0),
                "half_hour": fees_data.get("halfHourFee", 0),
                "hour": fees_data.get("hourFee", 0),
                "economy": fees_data.get("economyFee", 0),
                "minimum": fees_data.get("minimumFee", 0),
            }

    except Exception as e:
        result["error"] = str(e)

    _cache[cache_key] = result
    return result


async def get_mempool_summary() -> dict:
    """Combine ETH and BTC mempool data into a unified summary."""
    cache_key = "mempool_summary"
    if cache_key in _cache:
        return _cache[cache_key]

    eth_stats = await get_eth_mempool_stats()
    btc_stats = await get_btc_mempool_stats()

    result = {
        "ethereum": eth_stats,
        "bitcoin": btc_stats,
        "summary": {
            "eth_gas_gwei": eth_stats.get("avg_gas_price_gwei"),
            "btc_fastest_fee_sat_vb": btc_stats.get("recommended_fees", {}).get("fastest"),
            "btc_pending_txs": btc_stats.get("tx_count"),
            "eth_pending_txs": eth_stats.get("pending_tx_count"),
        },
    }
    _cache[cache_key] = result
    return result
