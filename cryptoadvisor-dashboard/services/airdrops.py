"""Airdrop eligibility checker based on on-chain activity heuristics."""

import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from config import ETHERSCAN_APIS

logger = logging.getLogger(__name__)

# Simple activity thresholds used by most airdrop campaigns
_CRITERIA = {
    "transaction_count": {
        "label": "Transaction Count",
        "threshold": 10,
        "description": "More than 10 transactions on Ethereum",
    },
    "unique_contracts": {
        "label": "Unique Contracts Interacted",
        "threshold": 5,
        "description": "Interacted with more than 5 unique contracts",
    },
    "bridge_usage": {
        "label": "Bridge Usage",
        "threshold": 1,
        "description": "Used at least one cross-chain bridge",
    },
    "defi_interactions": {
        "label": "DeFi Interactions",
        "threshold": 3,
        "description": "Interacted with 3+ DeFi protocols",
    },
    "nft_minting": {
        "label": "NFT Minting Activity",
        "threshold": 1,
        "description": "Minted at least one NFT",
    },
    "wallet_age": {
        "label": "Wallet Age",
        "threshold": 180,  # days
        "description": "Wallet older than 6 months",
    },
}

# Well-known contract addresses for classification
_BRIDGE_CONTRACTS = {
    "0x3ee18b2214aff97000d974cf647e7c347e8fa585",  # Wormhole
    "0x99c9fc46f92e8a1c0dec1b1747d010903e884be1",  # Optimism Bridge
    "0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f",  # Arbitrum Bridge
    "0x3154cf16ccdb4c6d922629664174b904d80f2c35",  # Base Bridge
}

_DEFI_CONTRACTS = {
    "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",  # Uniswap V2 Router
    "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",  # Uniswap V3 Router
    "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f",  # SushiSwap Router
    "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9",  # Aave V2 Lending Pool
    "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",  # Aave V3 Pool
    "0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b",  # Compound Comptroller
}


async def _fetch_transactions(address: str, chain: str = "ethereum") -> list[dict[str, Any]]:
    """Fetch normal transactions for an address from Etherscan-compatible API."""
    api_url = ETHERSCAN_APIS.get(chain)
    if not api_url:
        return []

    params = {
        "module": "account",
        "action": "txlist",
        "address": address,
        "startblock": 0,
        "endblock": 99999999,
        "sort": "asc",
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(api_url, params=params)
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") == "1":
                return data.get("result", [])
            return []
    except Exception as exc:
        logger.warning("Error fetching transactions for %s: %s", address, exc)
        return []


async def check_eligibility(address: str) -> list[dict[str, Any]]:
    """Evaluate an address against common airdrop eligibility criteria.

    Returns a list of criterion results, each with name, met (bool), details, score.
    """
    results: list[dict[str, Any]] = []
    address_lower = address.lower()

    try:
        txs = await _fetch_transactions(address)
    except Exception as exc:
        logger.error("Failed to fetch transactions: %s", exc)
        return [
            {
                "criterion_name": c["label"],
                "met": False,
                "details": "Could not fetch on-chain data",
                "score": 0,
            }
            for c in _CRITERIA.values()
        ]

    tx_count = len(txs)
    unique_contracts: set[str] = set()
    bridge_count = 0
    defi_count = 0
    nft_mint_count = 0
    first_tx_ts: int | None = None
    last_tx_ts: int | None = None

    for tx in txs:
        to_addr = (tx.get("to") or "").lower()
        from_addr = (tx.get("from") or "").lower()
        ts = int(tx.get("timeStamp", 0))

        if first_tx_ts is None or ts < first_tx_ts:
            first_tx_ts = ts
        if last_tx_ts is None or ts > last_tx_ts:
            last_tx_ts = ts

        if to_addr and to_addr != address_lower:
            unique_contracts.add(to_addr)

        if to_addr in _BRIDGE_CONTRACTS:
            bridge_count += 1
        if to_addr in _DEFI_CONTRACTS:
            defi_count += 1

        # Heuristic: NFT mints often have input data and 0 value going to contracts
        input_data = tx.get("input", "0x")
        if len(input_data) > 10 and tx.get("value", "0") == "0" and to_addr:
            # Check for common mint function selectors
            if input_data[:10] in ("0xa0712d68", "0x40c10f19", "0x6a627842"):
                nft_mint_count += 1

    wallet_age_days = 0
    if first_tx_ts and first_tx_ts > 0:
        wallet_age_days = (datetime.now(timezone.utc).timestamp() - first_tx_ts) / 86400

    # Evaluate each criterion
    checks = [
        ("transaction_count", tx_count, _CRITERIA["transaction_count"]["threshold"]),
        ("unique_contracts", len(unique_contracts), _CRITERIA["unique_contracts"]["threshold"]),
        ("bridge_usage", bridge_count, _CRITERIA["bridge_usage"]["threshold"]),
        ("defi_interactions", defi_count, _CRITERIA["defi_interactions"]["threshold"]),
        ("nft_minting", nft_mint_count, _CRITERIA["nft_minting"]["threshold"]),
        ("wallet_age", wallet_age_days, _CRITERIA["wallet_age"]["threshold"]),
    ]

    for key, actual, threshold in checks:
        met = actual >= threshold
        # Score: linear scale capped at 100
        score = min(100, int((actual / threshold) * 100)) if threshold > 0 else 0
        results.append({
            "criterion_name": _CRITERIA[key]["label"],
            "met": met,
            "details": f"{actual:.0f} / {threshold} — {_CRITERIA[key]['description']}",
            "score": score,
        })

    return results


async def get_activity_score(address: str) -> dict[str, Any]:
    """Compute an overall airdrop-readiness score with a per-criterion breakdown."""
    try:
        criteria = await check_eligibility(address)
        if not criteria:
            return {"address": address, "overall_score": 0, "breakdown": [], "tier": "None"}

        total = sum(c["score"] for c in criteria)
        overall = total // len(criteria)

        if overall >= 80:
            tier = "Excellent"
        elif overall >= 60:
            tier = "Good"
        elif overall >= 40:
            tier = "Moderate"
        elif overall >= 20:
            tier = "Low"
        else:
            tier = "Very Low"

        return {
            "address": address,
            "overall_score": overall,
            "tier": tier,
            "criteria_met": sum(1 for c in criteria if c["met"]),
            "criteria_total": len(criteria),
            "breakdown": criteria,
        }
    except Exception as exc:
        logger.error("Error computing activity score for %s: %s", address, exc)
        return {"address": address, "overall_score": 0, "breakdown": [], "tier": "Error", "error": str(exc)}
