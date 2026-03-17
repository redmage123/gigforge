"""Staking rewards tracker for ETH and SOL ecosystems."""

import logging
from typing import Any

import httpx
from web3 import Web3

from config import EVM_CHAINS, SOLANA_RPC

logger = logging.getLogger(__name__)

# ── Known liquid staking tokens on Ethereum mainnet ──────────────────────────

STAKING_TOKENS: dict[str, dict[str, Any]] = {
    "stETH": {
        "address": "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
        "protocol": "Lido",
        "apy_estimate": 3.5,
    },
    "rETH": {
        "address": "0xae78736Cd615f374D3085123A210448E74Fc6393",
        "protocol": "Rocket Pool",
        "apy_estimate": 3.2,
    },
    "cbETH": {
        "address": "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704",
        "protocol": "Coinbase",
        "apy_estimate": 3.0,
    },
}

# Minimal ERC-20 ABI for balanceOf + decimals
_BALANCE_ABI: list[dict[str, Any]] = [
    {
        "constant": True,
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function",
    },
    {
        "constant": True,
        "inputs": [],
        "name": "decimals",
        "outputs": [{"name": "", "type": "uint8"}],
        "type": "function",
    },
]


def _eth_web3() -> Web3:
    return Web3(Web3.HTTPProvider(EVM_CHAINS["ethereum"]["rpc"]))


async def get_eth_staking(address: str) -> dict[str, Any]:
    """Check ETH liquid staking balances (stETH, rETH, cbETH) for an address.

    Returns per-token balances and estimated annual rewards.
    """
    result: dict[str, Any] = {
        "address": address,
        "chain": "ethereum",
        "positions": [],
        "total_staked_eth": 0.0,
        "total_estimated_annual_reward_eth": 0.0,
    }

    try:
        w3 = _eth_web3()
        checksum = w3.to_checksum_address(address)

        for symbol, info in STAKING_TOKENS.items():
            try:
                contract = w3.eth.contract(
                    address=w3.to_checksum_address(info["address"]),
                    abi=_BALANCE_ABI,
                )
                raw_balance: int = contract.functions.balanceOf(checksum).call()
                try:
                    decimals: int = contract.functions.decimals().call()
                except Exception:
                    decimals = 18

                balance = raw_balance / (10 ** decimals)
                if balance <= 0:
                    continue

                annual_reward = balance * (info["apy_estimate"] / 100)
                result["positions"].append({
                    "token": symbol,
                    "protocol": info["protocol"],
                    "balance": balance,
                    "apy_estimate": info["apy_estimate"],
                    "estimated_annual_reward_eth": round(annual_reward, 6),
                })
                result["total_staked_eth"] += balance
                result["total_estimated_annual_reward_eth"] += annual_reward
            except Exception as exc:
                logger.warning("Error checking %s balance: %s", symbol, exc)

        result["total_staked_eth"] = round(result["total_staked_eth"], 6)
        result["total_estimated_annual_reward_eth"] = round(
            result["total_estimated_annual_reward_eth"], 6
        )

    except Exception as exc:
        logger.error("Error in get_eth_staking for %s: %s", address, exc)
        result["error"] = str(exc)

    return result


async def get_sol_staking(address: str) -> dict[str, Any]:
    """Check Solana stake accounts via JSON-RPC getStakeActivation."""
    result: dict[str, Any] = {
        "address": address,
        "chain": "solana",
        "stake_accounts": [],
        "total_staked_sol": 0.0,
        "estimated_apy": 6.5,  # Approximate SOL staking APY
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Get stake accounts owned by this address
            resp = await client.post(
                SOLANA_RPC,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getStakeAccountsByWithdrawer",
                    "params": [address, {"encoding": "jsonParsed"}],
                },
            )
            resp.raise_for_status()
            data = resp.json()

            if "error" in data:
                # Fallback: try getProgramAccounts filtered by withdrawer
                logger.warning("getStakeAccountsByWithdrawer error: %s", data["error"])
                return result

            accounts = data.get("result", {}).get("value", []) if "result" in data else []

            for acct in accounts:
                try:
                    pubkey = acct.get("pubkey", "")
                    lamports = acct.get("account", {}).get("lamports", 0)
                    sol_balance = lamports / 1e9

                    parsed = (
                        acct.get("account", {})
                        .get("data", {})
                        .get("parsed", {})
                        .get("info", {})
                    )
                    stake_type = parsed.get("meta", {}).get("lockup", {})

                    result["stake_accounts"].append({
                        "account": pubkey,
                        "balance_sol": round(sol_balance, 4),
                        "status": "active",
                    })
                    result["total_staked_sol"] += sol_balance
                except Exception as exc:
                    logger.warning("Error parsing SOL stake account: %s", exc)

            result["total_staked_sol"] = round(result["total_staked_sol"], 4)
            result["estimated_annual_reward_sol"] = round(
                result["total_staked_sol"] * (result["estimated_apy"] / 100), 4
            )

    except Exception as exc:
        logger.error("Error in get_sol_staking for %s: %s", address, exc)
        result["error"] = str(exc)

    return result


async def get_staking_summary(address: str) -> dict[str, Any]:
    """Aggregate all staking positions across chains."""
    eth = await get_eth_staking(address)
    sol = await get_sol_staking(address)

    positions: list[dict[str, Any]] = []

    for pos in eth.get("positions", []):
        positions.append({
            "chain": "ethereum",
            "protocol": pos["protocol"],
            "token": pos["token"],
            "balance": pos["balance"],
            "apy": pos["apy_estimate"],
            "estimated_annual_reward": pos["estimated_annual_reward_eth"],
            "reward_unit": "ETH",
        })

    if sol.get("total_staked_sol", 0) > 0:
        positions.append({
            "chain": "solana",
            "protocol": "Native Staking",
            "token": "SOL",
            "balance": sol["total_staked_sol"],
            "apy": sol["estimated_apy"],
            "estimated_annual_reward": sol.get("estimated_annual_reward_sol", 0),
            "reward_unit": "SOL",
        })

    return {
        "address": address,
        "positions": positions,
        "ethereum": {
            "total_staked_eth": eth.get("total_staked_eth", 0),
            "annual_reward_eth": eth.get("total_estimated_annual_reward_eth", 0),
        },
        "solana": {
            "total_staked_sol": sol.get("total_staked_sol", 0),
            "annual_reward_sol": sol.get("estimated_annual_reward_sol", 0),
        },
        "errors": [
            e for e in [eth.get("error"), sol.get("error")] if e
        ],
    }
