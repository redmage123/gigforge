"""EVM blockchain client using web3.py."""

import asyncio
from functools import partial
from web3 import Web3
from config import EVM_CHAINS


class EVMClient:
    def __init__(self, chain: str = "ethereum"):
        cfg = EVM_CHAINS.get(chain, EVM_CHAINS["ethereum"])
        self.w3 = Web3(Web3.HTTPProvider(cfg["rpc"]))
        self.symbol = cfg["symbol"]
        self.chain = chain

    async def _run(self, fn, *args):
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, partial(fn, *args))

    async def get_gas_price(self) -> dict:
        gas = await self._run(self.w3.eth.gas_price.fget, self.w3.eth)
        return {"chain": self.chain, "gas_wei": gas, "gas_gwei": round(gas / 1e9, 2)}

    async def get_latest_block(self) -> dict:
        block = await self._run(self.w3.eth.get_block, "latest")
        return {
            "chain": self.chain,
            "number": block["number"],
            "timestamp": block["timestamp"],
            "transactions": len(block["transactions"]),
            "gas_used": block["gasUsed"],
            "gas_limit": block["gasLimit"],
        }

    async def get_balance(self, address: str) -> dict:
        balance = await self._run(self.w3.eth.get_balance, address)
        return {
            "chain": self.chain,
            "address": address,
            "balance_wei": balance,
            "balance": round(balance / 1e18, 6),
            "symbol": self.symbol,
        }

    async def get_network_stats(self) -> dict:
        block = await self.get_latest_block()
        gas = await self.get_gas_price()
        return {**block, **gas}
