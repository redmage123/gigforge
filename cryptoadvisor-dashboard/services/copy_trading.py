"""Whale copy trading and social feed service."""

import json
from datetime import datetime, timezone
from pathlib import Path

import httpx
from cachetools import TTLCache

from config import DATA_DIR, ETHERSCAN_APIS

COPY_DIR = DATA_DIR / "copy_trading"
_cache = TTLCache(maxsize=64, ttl=30)
_TIMEOUT = 10.0

# Known whale labels
KNOWN_WHALES: dict[str, str] = {
    "0x28C6c06298d514Db089934071355E5743bf21d60": "Binance Hot Wallet",
    "0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549": "Binance Cold Wallet",
    "0xDFd5293D8e347dFe59E90eFd55b2956a1343963d": "Alameda Research",
    "0x1B3cB81E51011b549d78bf720b0d924ac763A7C2": "Paradigm",
    "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8": "Binance 7",
}


def _ensure_dir() -> None:
    """Ensure the copy trading directory exists."""
    COPY_DIR.mkdir(parents=True, exist_ok=True)


def _user_file(username: str) -> Path:
    """Get the path to a user's watched wallets file."""
    return COPY_DIR / f"{username}.json"


def _load_wallets(username: str) -> list[dict]:
    """Load a user's watched wallets from disk."""
    path = _user_file(username)
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return []


def _save_wallets(username: str, wallets: list[dict]) -> None:
    """Save a user's watched wallets to disk."""
    _ensure_dir()
    _user_file(username).write_text(json.dumps(wallets, indent=2))


async def add_watched_wallet(username: str, address: str, label: str) -> dict:
    """Add a wallet to the user's watchlist."""
    wallets = _load_wallets(username)

    # Check for duplicates
    for w in wallets:
        if w["address"].lower() == address.lower():
            return {"error": "Wallet already in watchlist", "address": address}

    wallet = {
        "address": address,
        "label": label or KNOWN_WHALES.get(address, "Unknown"),
        "added_at": datetime.now(timezone.utc).isoformat(),
    }
    wallets.append(wallet)
    _save_wallets(username, wallets)
    return wallet


def get_watched_wallets(username: str) -> list[dict]:
    """Get all watched wallets for a user."""
    return _load_wallets(username)


async def remove_watched_wallet(username: str, address: str) -> bool:
    """Remove a wallet from the user's watchlist."""
    wallets = _load_wallets(username)
    original_count = len(wallets)
    wallets = [w for w in wallets if w["address"].lower() != address.lower()]

    if len(wallets) == original_count:
        return False

    _save_wallets(username, wallets)
    return True


async def get_wallet_recent_trades(address: str) -> list[dict]:
    """Fetch recent ERC-20 transfers for a wallet via Etherscan and identify buys/sells."""
    cache_key = f"trades_{address.lower()}"
    if cache_key in _cache:
        return _cache[cache_key]

    trades: list[dict] = []
    etherscan_url = ETHERSCAN_APIS["ethereum"]

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            # ERC-20 token transfers
            params = {
                "module": "account",
                "action": "tokentx",
                "address": address,
                "page": 1,
                "offset": 50,
                "sort": "desc",
            }
            resp = await client.get(etherscan_url, params=params)
            resp.raise_for_status()
            data = resp.json()

            if data.get("status") != "1" or not data.get("result"):
                _cache[cache_key] = trades
                return trades

            for tx in data["result"]:
                token_value = int(tx.get("value", "0"))
                decimals = int(tx.get("tokenDecimal", "18"))
                amount = token_value / (10 ** decimals) if decimals > 0 else token_value

                is_incoming = tx.get("to", "").lower() == address.lower()
                side = "buy" if is_incoming else "sell"

                trades.append({
                    "tx_hash": tx.get("hash", ""),
                    "token_name": tx.get("tokenName", "Unknown"),
                    "token_symbol": tx.get("tokenSymbol", "???"),
                    "contract_address": tx.get("contractAddress", ""),
                    "side": side,
                    "amount": amount,
                    "from": tx.get("from", ""),
                    "to": tx.get("to", ""),
                    "timestamp": datetime.fromtimestamp(
                        int(tx.get("timeStamp", "0")), tz=timezone.utc
                    ).isoformat(),
                    "block": int(tx.get("blockNumber", "0")),
                })

    except Exception as e:
        return [{"error": f"Failed to fetch trades: {e}"}]

    _cache[cache_key] = trades
    return trades


async def get_social_feed(username: str) -> list[dict]:
    """Aggregate recent activity from all of a user's watched wallets."""
    wallets = _load_wallets(username)
    if not wallets:
        return []

    feed: list[dict] = []
    for wallet in wallets:
        trades = await get_wallet_recent_trades(wallet["address"])
        for trade in trades:
            if "error" in trade:
                continue
            trade["wallet_label"] = wallet["label"]
            trade["wallet_address"] = wallet["address"]
            feed.append(trade)

    # Sort all entries by timestamp descending
    feed.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

    # Return the most recent 100 events
    return feed[:100]
