"""Multi-sig / Safe management — read-only interaction with Safe Transaction Service API."""

import httpx

SAFE_API_BASE = "https://safe-transaction-mainnet.safe.global/api/v1"


async def _safe_get(path: str) -> dict | list:
    """GET from the Safe Transaction Service API."""
    url = f"{SAFE_API_BASE}{path}"
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()


async def get_safe_info(address: str) -> dict:
    """Fetch Safe info: owners, threshold, nonce, modules, balance.

    Endpoint: /api/v1/safes/{address}/
    """
    try:
        data = await _safe_get(f"/safes/{address}/")
        return {
            "address": data.get("address"),
            "owners": data.get("owners", []),
            "threshold": data.get("threshold"),
            "nonce": data.get("nonce"),
            "modules": data.get("modules", []),
            "fallback_handler": data.get("fallbackHandler"),
            "version": data.get("version"),
        }
    except httpx.HTTPStatusError as exc:
        return {"error": f"Safe API returned {exc.response.status_code}", "address": address}
    except Exception as exc:
        return {"error": str(exc), "address": address}


async def get_pending_transactions(address: str) -> list[dict]:
    """Fetch pending (un-executed) multisig transactions.

    Endpoint: /api/v1/safes/{address}/multisig-transactions/?executed=false
    """
    try:
        data = await _safe_get(f"/safes/{address}/multisig-transactions/?executed=false")
        results = data.get("results", []) if isinstance(data, dict) else data
        txs: list[dict] = []
        for tx in results:
            txs.append({
                "safe_tx_hash": tx.get("safeTxHash"),
                "to": tx.get("to"),
                "value": tx.get("value"),
                "data": tx.get("data"),
                "operation": tx.get("operation"),
                "nonce": tx.get("nonce"),
                "confirmations_required": tx.get("confirmationsRequired"),
                "confirmations": len(tx.get("confirmations", [])),
                "submissionDate": tx.get("submissionDate"),
            })
        return txs
    except httpx.HTTPStatusError as exc:
        return [{"error": f"Safe API returned {exc.response.status_code}"}]
    except Exception as exc:
        return [{"error": str(exc)}]


async def get_safe_balances(address: str) -> list[dict]:
    """Fetch token balances for a Safe.

    Endpoint: /api/v1/safes/{address}/balances/
    """
    try:
        data = await _safe_get(f"/safes/{address}/balances/")
        if not isinstance(data, list):
            return [{"error": "Unexpected response format"}]

        balances: list[dict] = []
        for item in data:
            token_info = item.get("token") or {}
            balances.append({
                "token_address": item.get("tokenAddress"),
                "token_name": token_info.get("name", "ETH" if item.get("tokenAddress") is None else "Unknown"),
                "token_symbol": token_info.get("symbol", "ETH" if item.get("tokenAddress") is None else "?"),
                "decimals": token_info.get("decimals", 18),
                "balance": item.get("balance", "0"),
            })
        return balances
    except httpx.HTTPStatusError as exc:
        return [{"error": f"Safe API returned {exc.response.status_code}"}]
    except Exception as exc:
        return [{"error": str(exc)}]
