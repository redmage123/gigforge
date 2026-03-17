"""Bitcoin blockchain client using Blockstream.info REST API."""

import httpx
from config import BITCOIN_API


class BitcoinClient:
    def __init__(self):
        self.api = BITCOIN_API

    async def get_block_height(self) -> int:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{self.api}/blocks/tip/height")
            resp.raise_for_status()
            return int(resp.text)

    async def get_address_balance(self, address: str) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{self.api}/address/{address}")
            resp.raise_for_status()
            data = resp.json()
            stats = data.get("chain_stats", {})
            balance_sats = stats.get("funded_txo_sum", 0) - stats.get("spent_txo_sum", 0)
            return {
                "address": address,
                "balance_sats": balance_sats,
                "balance_btc": balance_sats / 1e8,
                "tx_count": stats.get("tx_count", 0),
            }

    async def get_fee_estimates(self) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{self.api}/fee-estimates")
            resp.raise_for_status()
            data = resp.json()
            return {
                "fastest": data.get("1", 0),
                "half_hour": data.get("3", 0),
                "hour": data.get("6", 0),
                "economy": data.get("144", 0),
            }

    async def get_mempool_stats(self) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{self.api}/mempool")
            resp.raise_for_status()
            data = resp.json()
            return {
                "tx_count": data.get("count", 0),
                "vsize": data.get("vsize", 0),
                "total_fee": data.get("total_fee", 0),
            }

    async def get_network_stats(self) -> dict:
        height = await self.get_block_height()
        fees = await self.get_fee_estimates()
        mempool = await self.get_mempool_stats()
        return {"block_height": height, "fees": fees, "mempool": mempool}
