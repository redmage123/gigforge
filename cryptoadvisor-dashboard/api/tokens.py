"""ERC-20 token balance API."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from services.blockchain.etherscan import get_token_balances
from services.user_data import get_username, load_user_data

router = APIRouter()


@router.get("/{chain}/{address}")
async def token_balances(chain: str, address: str):
    try:
        tokens = await get_token_balances(chain, address)
        return {"chain": chain, "address": address, "tokens": tokens}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/all")
async def all_token_balances(request: Request):
    """Token balances across all saved EVM wallets."""
    username = get_username(request)
    wallets = load_user_data(username, "wallets")
    results = []
    for w in wallets:
        chain = w.get("chain", "ethereum")
        if chain in ("solana", "bitcoin"):
            continue
        try:
            tokens = await get_token_balances(chain, w["address"])
            for t in tokens:
                t["_wallet_label"] = w.get("label", "")
                t["_chain"] = chain
            results.extend(tokens)
        except Exception:
            continue
    return {"tokens": results}
