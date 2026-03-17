"""Solana blockchain client using raw JSON-RPC via httpx."""

import httpx
from config import SOLANA_RPC


class SolanaClient:
    def __init__(self):
        self.rpc = SOLANA_RPC

    async def _rpc(self, method: str, params: list = None) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                self.rpc,
                json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []},
            )
            resp.raise_for_status()
            return resp.json()

    async def get_balance(self, address: str) -> dict:
        data = await self._rpc("getBalance", [address])
        lamports = data.get("result", {}).get("value", 0)
        return {"address": address, "balance_lamports": lamports, "balance_sol": lamports / 1e9}

    async def get_slot(self) -> int:
        data = await self._rpc("getSlot")
        return data.get("result", 0)

    async def get_block_height(self) -> int:
        data = await self._rpc("getBlockHeight")
        return data.get("result", 0)

    async def get_supply(self) -> dict:
        data = await self._rpc("getSupply")
        supply = data.get("result", {}).get("value", {})
        return {
            "total": supply.get("total", 0) / 1e9,
            "circulating": supply.get("circulating", 0) / 1e9,
            "non_circulating": supply.get("nonCirculating", 0) / 1e9,
        }

    async def get_recent_performance(self) -> dict:
        data = await self._rpc("getRecentPerformanceSamples", [5])
        samples = data.get("result", [])
        if samples:
            avg_tps = sum(s["numTransactions"] / s["samplePeriodSecs"] for s in samples) / len(samples)
            return {"avg_tps": round(avg_tps, 0), "samples": len(samples)}
        return {"avg_tps": 0, "samples": 0}

    async def get_network_stats(self) -> dict:
        slot = await self.get_slot()
        height = await self.get_block_height()
        perf = await self.get_recent_performance()
        return {"slot": slot, "block_height": height, **perf}
