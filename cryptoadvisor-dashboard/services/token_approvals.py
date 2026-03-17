"""ERC-20 token approval scanner and revocation helper."""

import logging
from typing import Any

from web3 import Web3
from web3.contract import Contract

from config import EVM_CHAINS

logger = logging.getLogger(__name__)

# keccak256("Approval(address,address,uint256)")
APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"

# Minimal ERC-20 ABI (name, symbol, approve, allowance)
ERC20_ABI: list[dict[str, Any]] = [
    {
        "constant": True,
        "inputs": [],
        "name": "name",
        "outputs": [{"name": "", "type": "string"}],
        "type": "function",
    },
    {
        "constant": True,
        "inputs": [],
        "name": "symbol",
        "outputs": [{"name": "", "type": "string"}],
        "type": "function",
    },
    {
        "constant": False,
        "inputs": [
            {"name": "spender", "type": "address"},
            {"name": "amount", "type": "uint256"},
        ],
        "name": "approve",
        "outputs": [{"name": "", "type": "bool"}],
        "type": "function",
    },
    {
        "constant": True,
        "inputs": [
            {"name": "owner", "type": "address"},
            {"name": "spender", "type": "address"},
        ],
        "name": "allowance",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function",
    },
]


def _get_web3(chain: str) -> Web3:
    """Return a Web3 instance connected to the given chain's RPC."""
    chain_cfg = EVM_CHAINS.get(chain)
    if not chain_cfg:
        raise ValueError(f"Unsupported chain: {chain}. Available: {list(EVM_CHAINS.keys())}")
    return Web3(Web3.HTTPProvider(chain_cfg["rpc"]))


def _token_name(contract: Contract) -> str:
    """Best-effort token name lookup."""
    try:
        return contract.functions.name().call()
    except Exception:
        try:
            return contract.functions.symbol().call()
        except Exception:
            return "Unknown"


async def get_approvals(address: str, chain: str = "ethereum") -> list[dict[str, Any]]:
    """Scan for ERC-20 Approval events emitted for *address* as owner.

    Returns a list of dicts with token_address, token_name, spender, allowance, tx_hash.
    """
    try:
        w3 = _get_web3(chain)
        checksum = w3.to_checksum_address(address)

        # Pad address to 32 bytes for topic filtering (owner = topic1)
        padded_address = "0x" + checksum[2:].lower().zfill(64)

        # Fetch approval logs for the last ~10 000 blocks (RPC-dependent limit)
        latest_block = w3.eth.block_number
        from_block = max(0, latest_block - 10_000)

        logs = w3.eth.get_logs({
            "fromBlock": from_block,
            "toBlock": "latest",
            "topics": [APPROVAL_TOPIC, padded_address],
        })

        approvals: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()

        for log in logs:
            token_address = log["address"]
            spender = "0x" + log["topics"][2].hex()[-40:]
            spender = w3.to_checksum_address(spender)
            allowance_raw = int(log["data"].hex(), 16) if log["data"] else 0

            key = (token_address.lower(), spender.lower())
            if key in seen:
                continue
            seen.add(key)

            # Check current on-chain allowance (the log may be stale)
            try:
                contract = w3.eth.contract(address=w3.to_checksum_address(token_address), abi=ERC20_ABI)
                current_allowance = contract.functions.allowance(checksum, spender).call()
            except Exception:
                current_allowance = allowance_raw

            if current_allowance == 0:
                continue  # Already revoked

            name = _token_name(
                w3.eth.contract(address=w3.to_checksum_address(token_address), abi=ERC20_ABI)
            )

            approvals.append({
                "token_address": token_address,
                "token_name": name,
                "spender": spender,
                "allowance": str(current_allowance),
                "allowance_display": "Unlimited" if current_allowance > 2**128 else str(current_allowance),
                "tx_hash": log["transactionHash"].hex(),
            })

        return approvals

    except ValueError:
        raise
    except Exception as exc:
        logger.error("Error fetching approvals for %s on %s: %s", address, chain, exc)
        return []


def generate_revoke_tx(token_address: str, spender: str, chain: str = "ethereum") -> dict[str, Any]:
    """Build an unsigned transaction that revokes approval (approve(spender, 0)).

    The caller must sign and broadcast this transaction themselves.
    """
    try:
        w3 = _get_web3(chain)
        contract = w3.eth.contract(
            address=w3.to_checksum_address(token_address),
            abi=ERC20_ABI,
        )
        tx_data = contract.functions.approve(
            w3.to_checksum_address(spender), 0
        ).build_transaction({
            "chainId": EVM_CHAINS[chain]["chain_id"],
            "gas": 60_000,
            "gasPrice": 0,  # Caller should set appropriate gas price
            "nonce": 0,     # Caller should set correct nonce
        })

        return {
            "to": token_address,
            "data": tx_data["data"],
            "chainId": EVM_CHAINS[chain]["chain_id"],
            "gas": 60_000,
            "value": 0,
            "description": f"Revoke approval for spender {spender} on token {token_address}",
        }

    except Exception as exc:
        logger.error("Error generating revoke tx: %s", exc)
        return {"error": str(exc)}
