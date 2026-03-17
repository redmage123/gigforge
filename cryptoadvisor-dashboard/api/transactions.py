"""Transaction history API."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from services.blockchain.etherscan import get_transactions
from services.user_data import get_username, load_user_data

router = APIRouter()


@router.get("/{chain}/{address}")
async def tx_history(chain: str, address: str, page: int = 1):
    try:
        txs = await get_transactions(chain, address, page=page, limit=25)
        return {"chain": chain, "address": address, "transactions": txs, "page": page}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/all")
async def all_tx_history(request: Request, page: int = 1):
    """Transaction history across all saved wallets."""
    username = get_username(request)
    wallets = load_user_data(username, "wallets")
    results = []
    for w in wallets:
        chain = w.get("chain", "ethereum")
        if chain in ("solana", "bitcoin"):
            continue  # Etherscan API only for EVM
        try:
            txs = await get_transactions(chain, w["address"], page=page, limit=10)
            for tx in txs:
                tx["_wallet_label"] = w.get("label", "")
                tx["_chain"] = chain
            results.extend(txs)
        except Exception:
            continue
    # Sort by timestamp descending
    results.sort(key=lambda t: int(t.get("timeStamp", "0")), reverse=True)
    return {"transactions": results[:50], "page": page}
