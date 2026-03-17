"""Blockchain data API endpoints."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from services.blockchain.ethereum import EVMClient
from services.blockchain.solana import SolanaClient
from services.blockchain.bitcoin import BitcoinClient

router = APIRouter()


@router.get("/eth/stats")
async def eth_stats():
    try:
        client = EVMClient("ethereum")
        return await client.get_network_stats()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/eth/balance/{address}")
async def eth_balance(address: str):
    try:
        client = EVMClient("ethereum")
        return await client.get_balance(address)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/evm/{chain}/gas")
async def evm_gas(chain: str):
    try:
        client = EVMClient(chain)
        return await client.get_gas_price()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/solana/stats")
async def solana_stats():
    try:
        client = SolanaClient()
        return await client.get_network_stats()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/solana/balance/{address}")
async def solana_balance(address: str):
    try:
        client = SolanaClient()
        return await client.get_balance(address)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/bitcoin/stats")
async def bitcoin_stats():
    try:
        client = BitcoinClient()
        return await client.get_network_stats()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/bitcoin/balance/{address}")
async def bitcoin_balance(address: str):
    try:
        client = BitcoinClient()
        return await client.get_address_balance(address)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/gas/compare")
async def gas_compare():
    """Compare gas prices across EVM chains."""
    try:
        from config import EVM_CHAINS
        results = {}
        for chain in EVM_CHAINS:
            try:
                client = EVMClient(chain)
                gas = await client.get_gas_price()
                results[chain] = gas
            except Exception:
                results[chain] = {"error": "unavailable"}
        return results
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)
