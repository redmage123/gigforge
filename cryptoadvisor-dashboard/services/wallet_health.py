"""Wallet health scoring — checks approvals, dust attacks, blacklist, age, diversity."""

import time
from datetime import datetime

import httpx
from web3 import Web3

from config import EVM_CHAINS, ETHERSCAN_APIS

# Well-known blacklisted addresses (expandable)
KNOWN_BLACKLISTS: set[str] = {
    "0x00000000000000000000000000000000000dEaD0",  # placeholder — add real lists
}

# ERC-20 approve function signature
APPROVE_TOPIC = Web3.keccak(text="Approval(address,address,uint256)").hex()
UNLIMITED_APPROVAL = 2**255


async def _etherscan_get(
    chain: str, params: dict, api_key: str = ""
) -> dict:
    """Helper to call an Etherscan-compatible API."""
    base_url = ETHERSCAN_APIS.get(chain)
    if not base_url:
        raise ValueError(f"Unsupported chain: {chain}")
    if api_key:
        params["apikey"] = api_key
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

async def _check_risky_approvals(address: str, chain: str) -> dict:
    """Count unlimited token approvals still active."""
    try:
        data = await _etherscan_get(chain, {
            "module": "logs",
            "action": "getLogs",
            "fromBlock": "0",
            "toBlock": "latest",
            "topic0": APPROVE_TOPIC,
            "topic1": "0x000000000000000000000000" + address[2:].lower(),
        })
        logs = data.get("result", [])
        if not isinstance(logs, list):
            logs = []

        unlimited_count = 0
        for log in logs:
            try:
                value = int(log.get("data", "0x0"), 16)
                if value >= UNLIMITED_APPROVAL:
                    unlimited_count += 1
            except (ValueError, TypeError):
                continue

        if unlimited_count == 0:
            return {"name": "Risky Approvals", "status": "good", "score": 100,
                    "details": "No unlimited token approvals found"}
        elif unlimited_count <= 3:
            return {"name": "Risky Approvals", "status": "warning", "score": 60,
                    "details": f"{unlimited_count} unlimited approval(s) detected — consider revoking"}
        else:
            return {"name": "Risky Approvals", "status": "danger", "score": 20,
                    "details": f"{unlimited_count} unlimited approvals — high risk of token drain"}
    except Exception as exc:
        return {"name": "Risky Approvals", "status": "warning", "score": 50,
                "details": f"Could not check approvals: {exc}"}


async def _check_dust_attacks(address: str, chain: str) -> dict:
    """Detect tiny token transfers from unknown contracts (dust attacks)."""
    try:
        data = await _etherscan_get(chain, {
            "module": "account",
            "action": "tokentx",
            "address": address,
            "startblock": "0",
            "endblock": "99999999",
            "sort": "desc",
            "page": "1",
            "offset": "100",
        })
        txs = data.get("result", [])
        if not isinstance(txs, list):
            txs = []

        dust_count = 0
        for tx in txs:
            try:
                value = int(tx.get("value", "0"))
                decimals = int(tx.get("tokenDecimal", "18"))
                amount = value / (10 ** decimals)
                # Tiny amounts sent TO the wallet from a contract
                if amount < 0.001 and tx.get("to", "").lower() == address.lower():
                    dust_count += 1
            except (ValueError, TypeError, ZeroDivisionError):
                continue

        if dust_count == 0:
            return {"name": "Dust Attacks", "status": "good", "score": 100,
                    "details": "No suspicious dust transfers detected"}
        elif dust_count <= 5:
            return {"name": "Dust Attacks", "status": "warning", "score": 65,
                    "details": f"{dust_count} potential dust transfer(s) — do not interact with unknown tokens"}
        else:
            return {"name": "Dust Attacks", "status": "danger", "score": 30,
                    "details": f"{dust_count} dust transfers detected — wallet is targeted"}
    except Exception as exc:
        return {"name": "Dust Attacks", "status": "warning", "score": 50,
                "details": f"Could not check dust attacks: {exc}"}


async def _check_blacklist_interaction(address: str, chain: str) -> dict:
    """Check if wallet has interacted with known blacklisted addresses."""
    try:
        data = await _etherscan_get(chain, {
            "module": "account",
            "action": "txlist",
            "address": address,
            "startblock": "0",
            "endblock": "99999999",
            "sort": "desc",
            "page": "1",
            "offset": "200",
        })
        txs = data.get("result", [])
        if not isinstance(txs, list):
            txs = []

        flagged: list[str] = []
        for tx in txs:
            counterparty = tx.get("to", "") if tx.get("from", "").lower() == address.lower() else tx.get("from", "")
            if counterparty.lower() in {a.lower() for a in KNOWN_BLACKLISTS}:
                flagged.append(counterparty)

        if not flagged:
            return {"name": "Blacklist Check", "status": "good", "score": 100,
                    "details": "No interactions with known blacklisted addresses"}
        else:
            return {"name": "Blacklist Check", "status": "danger", "score": 10,
                    "details": f"Interacted with {len(flagged)} blacklisted address(es)"}
    except Exception as exc:
        return {"name": "Blacklist Check", "status": "warning", "score": 50,
                "details": f"Could not check blacklist: {exc}"}


async def _check_wallet_age(address: str, chain: str) -> dict:
    """Determine wallet age from earliest transaction."""
    try:
        data = await _etherscan_get(chain, {
            "module": "account",
            "action": "txlist",
            "address": address,
            "startblock": "0",
            "endblock": "99999999",
            "sort": "asc",
            "page": "1",
            "offset": "1",
        })
        txs = data.get("result", [])
        if not isinstance(txs, list) or len(txs) == 0:
            return {"name": "Wallet Age", "status": "warning", "score": 30,
                    "details": "No transactions found — new or inactive wallet"}

        first_ts = int(txs[0].get("timeStamp", "0"))
        age_days = (time.time() - first_ts) / 86400

        if age_days > 365:
            return {"name": "Wallet Age", "status": "good", "score": 100,
                    "details": f"Wallet is {int(age_days)} days old (established)"}
        elif age_days > 90:
            return {"name": "Wallet Age", "status": "good", "score": 80,
                    "details": f"Wallet is {int(age_days)} days old"}
        elif age_days > 30:
            return {"name": "Wallet Age", "status": "warning", "score": 55,
                    "details": f"Wallet is only {int(age_days)} days old"}
        else:
            return {"name": "Wallet Age", "status": "danger", "score": 25,
                    "details": f"Very new wallet — {int(age_days)} days old"}
    except Exception as exc:
        return {"name": "Wallet Age", "status": "warning", "score": 50,
                "details": f"Could not determine wallet age: {exc}"}


async def _check_tx_diversity(address: str, chain: str) -> dict:
    """Measure how many unique counterparties the wallet has interacted with."""
    try:
        data = await _etherscan_get(chain, {
            "module": "account",
            "action": "txlist",
            "address": address,
            "startblock": "0",
            "endblock": "99999999",
            "sort": "desc",
            "page": "1",
            "offset": "200",
        })
        txs = data.get("result", [])
        if not isinstance(txs, list):
            txs = []

        counterparties: set[str] = set()
        for tx in txs:
            cp = tx.get("to", "") if tx.get("from", "").lower() == address.lower() else tx.get("from", "")
            if cp:
                counterparties.add(cp.lower())

        count = len(counterparties)
        if count >= 50:
            return {"name": "Transaction Diversity", "status": "good", "score": 100,
                    "details": f"Interacted with {count} unique addresses — very diverse"}
        elif count >= 20:
            return {"name": "Transaction Diversity", "status": "good", "score": 80,
                    "details": f"Interacted with {count} unique addresses"}
        elif count >= 5:
            return {"name": "Transaction Diversity", "status": "warning", "score": 55,
                    "details": f"Only {count} unique counterparties — limited diversity"}
        else:
            return {"name": "Transaction Diversity", "status": "danger", "score": 25,
                    "details": f"Only {count} unique counterparties — very low diversity"}
    except Exception as exc:
        return {"name": "Transaction Diversity", "status": "warning", "score": 50,
                "details": f"Could not check diversity: {exc}"}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def scan_wallet_health(address: str, chain: str = "ethereum") -> dict:
    """Run all health checks and return an aggregated health report.

    Returns dict with keys: address, chain, checks (list), health_score (0-100),
    risk_level (healthy / caution / at-risk), scanned_at.
    """
    if not Web3.is_address(address):
        return {"error": "Invalid Ethereum address", "address": address}

    address = Web3.to_checksum_address(address)

    checks = [
        await _check_risky_approvals(address, chain),
        await _check_dust_attacks(address, chain),
        await _check_blacklist_interaction(address, chain),
        await _check_wallet_age(address, chain),
        await _check_tx_diversity(address, chain),
    ]

    avg_score = sum(c["score"] for c in checks) / len(checks) if checks else 0

    if avg_score >= 75:
        risk_level = "healthy"
    elif avg_score >= 45:
        risk_level = "caution"
    else:
        risk_level = "at-risk"

    return {
        "address": address,
        "chain": chain,
        "checks": checks,
        "health_score": round(avg_score),
        "risk_level": risk_level,
        "scanned_at": datetime.utcnow().isoformat() + "Z",
    }
