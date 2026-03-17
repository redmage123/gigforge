"""Wallet API endpoints — balance aggregation + saved wallet management."""

import json
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services.blockchain.ethereum import EVMClient
from services.blockchain.solana import SolanaClient
from services.blockchain.bitcoin import BitcoinClient
from services.coingecko import get_prices
from config import EVM_CHAINS, BASE_DIR

router = APIRouter()

WALLETS_DIR = BASE_DIR / "data" / "wallets"

# Map chain names to CoinGecko IDs for price lookup
CHAIN_NATIVE_COINS = {
    "ethereum": "ethereum",
    "bsc": "binancecoin",
    "polygon": "matic-network",
    "arbitrum": "ethereum",
    "optimism": "ethereum",
    "avalanche": "avalanche-2",
    "base": "ethereum",
}


class SavedWallet(BaseModel):
    label: str
    address: str
    chain: str  # "ethereum", "solana", "bitcoin", or specific EVM chain


def _wallets_file(username: str) -> Path:
    """Per-user saved wallets file."""
    WALLETS_DIR.mkdir(parents=True, exist_ok=True)
    return WALLETS_DIR / f"{username}.json"


def _load_wallets(username: str) -> list[dict]:
    path = _wallets_file(username)
    if not path.exists():
        return []
    return json.loads(path.read_text())


def _save_wallets(username: str, wallets: list[dict]) -> None:
    path = _wallets_file(username)
    path.write_text(json.dumps(wallets, indent=2))


def _get_username(request: Request) -> str:
    user = getattr(request.state, "user", {})
    return user.get("sub", "anonymous")


@router.get("/saved")
async def list_saved_wallets(request: Request):
    """List all saved wallets for the current user."""
    username = _get_username(request)
    return _load_wallets(username)


@router.post("/saved")
async def add_saved_wallet(request: Request, wallet: SavedWallet):
    """Add a wallet to the user's saved list."""
    username = _get_username(request)
    wallets = _load_wallets(username)

    # Check for duplicate address+chain
    for w in wallets:
        if w["address"].lower() == wallet.address.lower() and w["chain"] == wallet.chain:
            return JSONResponse({"error": "Wallet already saved"}, status_code=409)

    wallets.append(wallet.model_dump())
    _save_wallets(username, wallets)
    return {"status": "saved", "wallet": wallet.model_dump()}


@router.delete("/saved/{index}")
async def remove_saved_wallet(request: Request, index: int):
    """Remove a saved wallet by index."""
    username = _get_username(request)
    wallets = _load_wallets(username)
    if index < 0 or index >= len(wallets):
        return JSONResponse({"error": "Invalid wallet index"}, status_code=404)
    removed = wallets.pop(index)
    _save_wallets(username, wallets)
    return {"status": "removed", "wallet": removed}


@router.get("/saved/balances")
async def get_all_saved_balances(request: Request):
    """Get balances for all saved wallets."""
    username = _get_username(request)
    wallets = _load_wallets(username)
    results = []
    for w in wallets:
        try:
            bal = await _get_wallet_balance(w["address"], w["chain"])
            results.append({**w, **bal})
        except Exception as e:
            results.append({**w, "balance": 0, "usd_value": 0, "error": str(e)})
    total_usd = sum(r.get("usd_value", 0) for r in results)
    return {"wallets": results, "total_usd": round(total_usd, 2)}


async def _get_wallet_balance(address: str, chain: str) -> dict:
    """Get balance for a single wallet on a specific chain."""
    if chain in EVM_CHAINS:
        client = EVMClient(chain)
        bal = await client.get_balance(address)
        coin_id = CHAIN_NATIVE_COINS.get(chain, "ethereum")
        try:
            prices = await get_prices((coin_id,))
            usd_price = prices.get(coin_id, {}).get("usd", 0)
        except Exception:
            usd_price = 0
        return {
            "balance": bal["balance"],
            "symbol": EVM_CHAINS[chain]["symbol"],
            "usd_value": round(bal["balance"] * usd_price, 2),
            "usd_price": usd_price,
        }
    elif chain == "solana":
        client = SolanaClient()
        bal = await client.get_balance(address)
        try:
            prices = await get_prices(("solana",))
            usd_price = prices.get("solana", {}).get("usd", 0)
        except Exception:
            usd_price = 0
        return {
            "balance": bal["balance_sol"],
            "symbol": "SOL",
            "usd_value": round(bal["balance_sol"] * usd_price, 2),
            "usd_price": usd_price,
        }
    elif chain == "bitcoin":
        client = BitcoinClient()
        bal = await client.get_address_balance(address)
        try:
            prices = await get_prices(("bitcoin",))
            usd_price = prices.get("bitcoin", {}).get("usd", 0)
        except Exception:
            usd_price = 0
        return {
            "balance": bal["balance_btc"],
            "symbol": "BTC",
            "usd_value": round(bal["balance_btc"] * usd_price, 2),
            "usd_price": usd_price,
        }
    else:
        return {"balance": 0, "symbol": "?", "usd_value": 0, "error": f"Unknown chain: {chain}"}


@router.get("/balances/{address}")
async def get_all_balances(address: str):
    """Get native token balances across all EVM chains with USD values."""
    try:
        coin_ids = tuple(set(CHAIN_NATIVE_COINS.values()))
        prices = {}
        try:
            prices = await get_prices(coin_ids)
        except Exception:
            pass

        balances = []
        for chain_name, chain_cfg in EVM_CHAINS.items():
            try:
                client = EVMClient(chain_name)
                bal = await client.get_balance(address)
                coin_id = CHAIN_NATIVE_COINS.get(chain_name, "ethereum")
                usd_price = prices.get(coin_id, {}).get("usd", 0)
                usd_value = bal["balance"] * usd_price
                balances.append({
                    "chain": chain_name,
                    "symbol": chain_cfg["symbol"],
                    "chain_id": chain_cfg["chain_id"],
                    "balance": bal["balance"],
                    "usd_value": round(usd_value, 2),
                    "usd_price": usd_price,
                })
            except Exception as e:
                balances.append({
                    "chain": chain_name,
                    "symbol": chain_cfg["symbol"],
                    "chain_id": chain_cfg["chain_id"],
                    "balance": 0,
                    "usd_value": 0,
                    "error": str(e),
                })

        total_usd = sum(b["usd_value"] for b in balances)
        return {"address": address, "balances": balances, "total_usd": round(total_usd, 2)}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/balance/{chain}/{address}")
async def get_chain_balance(chain: str, address: str):
    """Get balance for a specific chain."""
    try:
        if chain not in EVM_CHAINS:
            return JSONResponse({"error": f"Unsupported chain: {chain}"}, status_code=400)
        client = EVMClient(chain)
        return await client.get_balance(address)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)
