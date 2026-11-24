"""Wallet API endpoints — balance aggregation + saved wallet management."""

import json

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from services.blockchain.ethereum import EVMClient
from services.coingecko import get_prices
from config import EVM_CHAINS, BASE_DIR
from services import store, wallet_balances
from services.sanitize import sanitize_filename
from services.user_data import load_user_data, save_user_data, update_user_data

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
    label: str = Field("", max_length=60)
    address: str = Field(min_length=20, max_length=100)
    chain: str  # "ethereum", "solana", "bitcoin", or specific EVM chain


NAMESPACE = "wallets"  # same record the snapshot job, net worth, tokens and NFT pages read


def _load_wallets(username: str) -> list[dict]:
    rows = load_user_data(username, NAMESPACE)
    if rows:
        return rows if isinstance(rows, list) else []
    # Wallets saved before this page used the shared store lived in data/wallets/<user>.json
    legacy = WALLETS_DIR / f"{sanitize_filename(username)}.json"
    if store.using_postgres() and legacy.exists():
        try:
            rows = json.loads(legacy.read_text())
        except (OSError, ValueError):
            return []
        if isinstance(rows, list) and rows:
            save_user_data(username, NAMESPACE, rows)
            return rows
    return []


def _get_username(request: Request) -> str:
    user = getattr(request.state, "user", {})
    return user.get("sub", "anonymous")


@router.get("/saved")
async def list_saved_wallets(request: Request):
    """List all saved wallets for the current user."""
    return _load_wallets(_get_username(request))


@router.post("/saved")
async def add_saved_wallet(request: Request, wallet: SavedWallet):
    """Add a wallet to the user's saved list."""
    username = _get_username(request)
    address, chain = wallet.address.strip(), wallet.chain.strip().lower()
    bad = wallet_balances.validate(address, chain)
    if bad:
        return JSONResponse({"detail": bad}, status_code=400)
    record = {"label": wallet.label.strip() or "Wallet", "address": address, "chain": chain}
    _load_wallets(username)  # migrate a legacy file first so it isn't shadowed

    def add(rows):
        rows = rows if isinstance(rows, list) else []
        if any(w.get("address", "").lower() == address.lower() and w.get("chain") == chain for w in rows):
            raise ValueError("Wallet already saved")
        return rows + [record]

    try:
        update_user_data(username, NAMESPACE, add)
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=409)
    return {"status": "saved", "wallet": record}


@router.delete("/saved/{address}")
async def remove_saved_wallet(request: Request, address: str, chain: str | None = Query(None)):
    """Remove a saved wallet by address (and chain, when the same address is saved on several)."""
    username = _get_username(request)
    _load_wallets(username)
    removed = []

    def drop(rows):
        keep = []
        for w in rows if isinstance(rows, list) else []:
            if w.get("address", "").lower() == address.lower() and (chain is None or w.get("chain") == chain):
                removed.append(w)
            else:
                keep.append(w)
        return keep

    update_user_data(username, NAMESPACE, drop)
    if not removed:
        return JSONResponse({"detail": "Wallet not found"}, status_code=404)
    return {"status": "removed", "wallets": removed}


@router.get("/saved/balances")
async def get_all_saved_balances(request: Request):
    """Balances for all saved wallets, from free public explorers and RPC endpoints."""
    return await wallet_balances.balances(_load_wallets(_get_username(request)))


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
