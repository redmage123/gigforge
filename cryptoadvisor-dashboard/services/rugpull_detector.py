"""Rug-pull and honeypot detector for ERC-20 tokens."""

from datetime import datetime

import httpx
from web3 import Web3

from config import EVM_CHAINS, ETHERSCAN_APIS

ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD"

# Minimal ABIs for common checks
OWNER_ABI = [{"inputs": [], "name": "owner", "outputs": [{"type": "address"}], "stateMutability": "view", "type": "function"}]
TOTAL_SUPPLY_ABI = [{"inputs": [], "name": "totalSupply", "outputs": [{"type": "uint256"}], "stateMutability": "view", "type": "function"}]
BALANCE_OF_ABI = [{"inputs": [{"name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"type": "uint256"}], "stateMutability": "view", "type": "function"}]


async def _etherscan_get(chain: str, params: dict) -> dict:
    base_url = ETHERSCAN_APIS.get(chain)
    if not base_url:
        raise ValueError(f"Unsupported chain: {chain}")
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(base_url, params=params)
        resp.raise_for_status()
        return resp.json()


def _get_web3(chain: str) -> Web3:
    chain_cfg = EVM_CHAINS.get(chain)
    if not chain_cfg:
        raise ValueError(f"Unsupported chain: {chain}")
    return Web3(Web3.HTTPProvider(chain_cfg["rpc"]))


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------

async def _check_verified(token_address: str, chain: str) -> dict:
    """Check if contract source code is verified on Etherscan."""
    try:
        data = await _etherscan_get(chain, {
            "module": "contract",
            "action": "getabi",
            "address": token_address,
        })
        is_verified = data.get("status") == "1" and data.get("result", "").startswith("[")
        if is_verified:
            return {"name": "Contract Verified", "passed": True, "severity": "low",
                    "details": "Contract source code is verified on block explorer"}
        else:
            return {"name": "Contract Verified", "passed": False, "severity": "high",
                    "details": "Contract is NOT verified — cannot inspect source code"}
    except Exception as exc:
        return {"name": "Contract Verified", "passed": False, "severity": "medium",
                "details": f"Could not check verification: {exc}"}


async def _check_ownership_renounced(token_address: str, chain: str) -> dict:
    """Check if owner() returns the zero address."""
    try:
        w3 = _get_web3(chain)
        contract = w3.eth.contract(
            address=Web3.to_checksum_address(token_address),
            abi=OWNER_ABI,
        )
        owner = contract.functions.owner().call()
        renounced = owner.lower() in (ZERO_ADDRESS.lower(), DEAD_ADDRESS.lower())
        if renounced:
            return {"name": "Ownership Renounced", "passed": True, "severity": "low",
                    "details": f"Owner is {owner} — ownership renounced"}
        else:
            return {"name": "Ownership Renounced", "passed": False, "severity": "high",
                    "details": f"Owner is {owner} — contract is still controlled"}
    except Exception:
        # Many tokens don't have an owner() function (e.g. non-Ownable)
        return {"name": "Ownership Renounced", "passed": True, "severity": "low",
                "details": "No owner() function found — may use a different access model"}


async def _check_hidden_mint(token_address: str, chain: str) -> dict:
    """Look for Mint / Transfer-from-zero events suggesting hidden minting."""
    try:
        transfer_topic = Web3.keccak(text="Transfer(address,address,uint256)").hex()
        zero_topic = "0x" + "0" * 64

        data = await _etherscan_get(chain, {
            "module": "logs",
            "action": "getLogs",
            "address": token_address,
            "fromBlock": "0",
            "toBlock": "latest",
            "topic0": transfer_topic,
            "topic1": zero_topic,  # from == address(0) means mint
        })
        logs = data.get("result", [])
        if not isinstance(logs, list):
            logs = []

        # More than a handful of mint events after deploy is suspicious
        mint_count = len(logs)
        if mint_count <= 1:
            return {"name": "Hidden Mint", "passed": True, "severity": "low",
                    "details": f"Only {mint_count} mint event(s) — likely initial supply only"}
        elif mint_count <= 5:
            return {"name": "Hidden Mint", "passed": True, "severity": "medium",
                    "details": f"{mint_count} mint events found — review if expected"}
        else:
            return {"name": "Hidden Mint", "passed": False, "severity": "critical",
                    "details": f"{mint_count} mint events — possible unlimited minting"}
    except Exception as exc:
        return {"name": "Hidden Mint", "passed": False, "severity": "medium",
                "details": f"Could not check minting: {exc}"}


async def _check_honeypot(token_address: str, chain: str) -> dict:
    """Heuristic honeypot check — look for sell-blocking patterns in source."""
    try:
        data = await _etherscan_get(chain, {
            "module": "contract",
            "action": "getsourcecode",
            "address": token_address,
        })
        results = data.get("result", [])
        if not results or not isinstance(results, list):
            return {"name": "Honeypot Check", "passed": False, "severity": "high",
                    "details": "Could not retrieve source code"}

        source = results[0].get("SourceCode", "")
        if not source:
            return {"name": "Honeypot Check", "passed": False, "severity": "high",
                    "details": "Source code not available — treat as suspicious"}

        # Common honeypot patterns in Solidity source
        blockers = [
            "require(from == owner",
            "require(sender == owner",
            "require(to != uniswapV2Pair",
            "require(!bots[",
            "blacklist[",
            "_isBlacklisted[",
            "tradingEnabled",
            "require(tradingOpen",
        ]
        found: list[str] = [b for b in blockers if b.lower() in source.lower()]

        if not found:
            return {"name": "Honeypot Check", "passed": True, "severity": "low",
                    "details": "No obvious sell-blocking patterns found in source code"}
        elif len(found) <= 2:
            return {"name": "Honeypot Check", "passed": False, "severity": "medium",
                    "details": f"Suspicious patterns found: {', '.join(found)}"}
        else:
            return {"name": "Honeypot Check", "passed": False, "severity": "critical",
                    "details": f"Multiple sell-blocking patterns: {', '.join(found)}"}
    except Exception as exc:
        return {"name": "Honeypot Check", "passed": False, "severity": "medium",
                "details": f"Could not perform honeypot check: {exc}"}


async def _check_liquidity_locked(token_address: str, chain: str) -> dict:
    """Check if LP tokens are sent to dead/lock addresses."""
    try:
        # Look for large transfers of LP tokens to known lock/dead addresses
        transfer_topic = Web3.keccak(text="Transfer(address,address,uint256)").hex()
        dead_padded = "0x000000000000000000000000" + DEAD_ADDRESS[2:].lower()

        data = await _etherscan_get(chain, {
            "module": "logs",
            "action": "getLogs",
            "address": token_address,
            "fromBlock": "0",
            "toBlock": "latest",
            "topic0": transfer_topic,
            "topic2": dead_padded,  # to == dead address
        })
        logs = data.get("result", [])
        if not isinstance(logs, list):
            logs = []

        if len(logs) > 0:
            return {"name": "Liquidity Locked", "passed": True, "severity": "low",
                    "details": f"{len(logs)} transfer(s) to burn/dead address found — liquidity likely locked or burned"}
        else:
            return {"name": "Liquidity Locked", "passed": False, "severity": "high",
                    "details": "No evidence of liquidity lock or burn — rug-pull risk"}
    except Exception as exc:
        return {"name": "Liquidity Locked", "passed": False, "severity": "medium",
                "details": f"Could not check liquidity lock: {exc}"}


async def _check_holder_concentration(token_address: str, chain: str) -> dict:
    """Check top-holder concentration via Etherscan token holder page."""
    try:
        # Use tokentx to approximate top holders
        data = await _etherscan_get(chain, {
            "module": "account",
            "action": "tokentx",
            "contractaddress": token_address,
            "startblock": "0",
            "endblock": "99999999",
            "sort": "desc",
            "page": "1",
            "offset": "200",
        })
        txs = data.get("result", [])
        if not isinstance(txs, list) or len(txs) == 0:
            return {"name": "Holder Concentration", "passed": False, "severity": "medium",
                    "details": "No transfer data available"}

        # Approximate balances from recent transfers
        balances: dict[str, int] = {}
        for tx in txs:
            try:
                value = int(tx.get("value", "0"))
                to_addr = tx.get("to", "").lower()
                from_addr = tx.get("from", "").lower()
                balances[to_addr] = balances.get(to_addr, 0) + value
                balances[from_addr] = balances.get(from_addr, 0) - value
            except (ValueError, TypeError):
                continue

        # Remove zero/dead/contract addresses
        skip = {ZERO_ADDRESS.lower(), DEAD_ADDRESS.lower(), token_address.lower()}
        balances = {k: v for k, v in balances.items() if k not in skip and v > 0}

        if not balances:
            return {"name": "Holder Concentration", "passed": True, "severity": "low",
                    "details": "Could not determine holder distribution from sample"}

        total = sum(balances.values())
        sorted_holders = sorted(balances.values(), reverse=True)
        top5_pct = (sum(sorted_holders[:5]) / total * 100) if total > 0 else 0

        if top5_pct < 30:
            return {"name": "Holder Concentration", "passed": True, "severity": "low",
                    "details": f"Top 5 holders own ~{top5_pct:.1f}% — well distributed"}
        elif top5_pct < 60:
            return {"name": "Holder Concentration", "passed": False, "severity": "medium",
                    "details": f"Top 5 holders own ~{top5_pct:.1f}% — moderately concentrated"}
        else:
            return {"name": "Holder Concentration", "passed": False, "severity": "critical",
                    "details": f"Top 5 holders own ~{top5_pct:.1f}% — highly concentrated, rug-pull risk"}
    except Exception as exc:
        return {"name": "Holder Concentration", "passed": False, "severity": "medium",
                "details": f"Could not check holder concentration: {exc}"}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def analyze_token(token_address: str, chain: str = "ethereum") -> dict:
    """Run all rug-pull / honeypot checks on a token.

    Returns dict with: token_address, chain, checks (list), risk_score (0-100,
    higher = riskier), verdict (safe / caution / dangerous / likely-scam),
    analyzed_at.
    """
    if not Web3.is_address(token_address):
        return {"error": "Invalid token address", "token_address": token_address}

    token_address = Web3.to_checksum_address(token_address)

    checks = [
        await _check_verified(token_address, chain),
        await _check_ownership_renounced(token_address, chain),
        await _check_hidden_mint(token_address, chain),
        await _check_honeypot(token_address, chain),
        await _check_liquidity_locked(token_address, chain),
        await _check_holder_concentration(token_address, chain),
    ]

    # Score: each failed check adds risk based on severity
    severity_weights = {"low": 5, "medium": 15, "high": 25, "critical": 35}
    risk_score = 0
    for check in checks:
        if not check["passed"]:
            risk_score += severity_weights.get(check["severity"], 15)
    risk_score = min(risk_score, 100)

    if risk_score <= 15:
        verdict = "safe"
    elif risk_score <= 40:
        verdict = "caution"
    elif risk_score <= 70:
        verdict = "dangerous"
    else:
        verdict = "likely-scam"

    return {
        "token_address": token_address,
        "chain": chain,
        "checks": checks,
        "risk_score": risk_score,
        "verdict": verdict,
        "analyzed_at": datetime.utcnow().isoformat() + "Z",
    }
