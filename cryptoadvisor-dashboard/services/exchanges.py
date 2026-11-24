"""Exchange API integration — Binance and Coinbase balance fetching."""

import hashlib
import hmac
import time
import httpx
from services.crypto_utils import encrypt, decrypt
from services.user_data import load_user_data, save_user_data


SUPPORTED = ("binance", "coinbase")


def _readable(exc: Exception) -> str:
    """Error text safe to show: never echoes keys or signed URLs."""
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        if code in (401, 403):
            return f"The exchange rejected the API key ({code}). Check the key, secret and its read permission."
        return f"The exchange returned HTTP {code}"
    if isinstance(exc, httpx.HTTPError):
        return f"Could not reach the exchange ({exc.__class__.__name__})"
    return f"Balance check failed ({exc.__class__.__name__})"


def get_exchanges(username: str) -> list[dict]:
    """Get configured exchanges (keys hidden)."""
    exchanges = load_user_data(username, "exchanges")
    return [{"id": i, "name": e["name"], "label": e.get("label", e["name"])} for i, e in enumerate(exchanges)]


def add_exchange(username: str, name: str, api_key: str, api_secret: str, label: str = "") -> dict:
    """Add an exchange config with encrypted keys."""
    exchanges = load_user_data(username, "exchanges")
    entry = {
        "name": name,
        "label": label or name,
        "api_key": encrypt(api_key),
        "api_secret": encrypt(api_secret),
        "added_at": time.time(),
    }
    exchanges.append(entry)
    save_user_data(username, "exchanges", exchanges)
    return {"id": len(exchanges) - 1, "name": name, "label": label or name}


def remove_exchange(username: str, index: int) -> bool:
    exchanges = load_user_data(username, "exchanges")
    if 0 <= index < len(exchanges):
        exchanges.pop(index)
        save_user_data(username, "exchanges", exchanges)
        return True
    return False


async def get_exchange_balances(username: str) -> list[dict]:
    """Fetch balances from all configured exchanges."""
    exchanges = load_user_data(username, "exchanges")
    results = []
    for i, ex in enumerate(exchanges):
        try:
            key = decrypt(ex["api_key"])
            secret = decrypt(ex["api_secret"])
            if ex["name"] == "binance":
                balances = await _binance_balances(key, secret)
            elif ex["name"] == "coinbase":
                balances = await _coinbase_balances(key, secret)
            else:
                balances = []
            supported = ex["name"] in SUPPORTED
            results.append({
                "id": i,
                "exchange": ex["name"],
                "label": ex.get("label", ex["name"]),
                "balances": balances,
                "status": "connected" if supported else "unsupported",
                **({} if supported else {"error": f"Balances from {ex['name']} are not supported"}),
            })
        except Exception as e:
            results.append({
                "id": i,
                "exchange": ex["name"],
                "label": ex.get("label", ex["name"]),
                "balances": [],
                "status": "error",
                "error": _readable(e),
            })
    return results


async def _binance_balances(api_key: str, api_secret: str) -> list[dict]:
    """Fetch Binance spot balances."""
    base = "https://api.binance.com"
    timestamp = int(time.time() * 1000)
    query = f"timestamp={timestamp}"
    signature = hmac.new(api_secret.encode(), query.encode(), hashlib.sha256).hexdigest()

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{base}/api/v3/account?{query}&signature={signature}",
            headers={"X-MBX-APIKEY": api_key},
        )
        resp.raise_for_status()
        data = resp.json()
        balances = []
        for b in data.get("balances", []):
            free = float(b.get("free", 0))
            locked = float(b.get("locked", 0))
            total = free + locked
            if total > 0:
                balances.append({
                    "asset": b["asset"],
                    "free": free,
                    "locked": locked,
                    "total": total,
                })
        return balances


async def _coinbase_balances(api_key: str, api_secret: str) -> list[dict]:
    """Fetch Coinbase account balances."""
    timestamp = str(int(time.time()))
    method = "GET"
    path = "/v2/accounts?limit=100"
    message = timestamp + method + path
    signature = hmac.new(api_secret.encode(), message.encode(), hashlib.sha256).hexdigest()

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"https://api.coinbase.com{path}",
            headers={
                "CB-ACCESS-KEY": api_key,
                "CB-ACCESS-SIGN": signature,
                "CB-ACCESS-TIMESTAMP": timestamp,
                "CB-VERSION": "2024-01-01",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        balances = []
        for account in data.get("data", []):
            amount = float(account.get("balance", {}).get("amount", 0))
            if amount > 0:
                balances.append({
                    "asset": account.get("balance", {}).get("currency", "?"),
                    "total": amount,
                    "free": amount,
                    "locked": 0,
                })
        return balances
