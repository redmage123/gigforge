"""On-chain profit/loss calculator using Etherscan + CoinGecko."""

import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import httpx

from config import COINGECKO_API, ETHERSCAN_APIS

logger = logging.getLogger(__name__)


async def _fetch_token_transfers(address: str, chain: str = "ethereum") -> list[dict[str, Any]]:
    """Fetch ERC-20 token transfer events for an address from Etherscan."""
    api_url = ETHERSCAN_APIS.get(chain)
    if not api_url:
        return []

    params = {
        "module": "account",
        "action": "tokentx",
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
        logger.warning("Error fetching token transfers for %s on %s: %s", address, chain, exc)
        return []


async def _fetch_normal_txs(address: str, chain: str = "ethereum") -> list[dict[str, Any]]:
    """Fetch normal (ETH) transactions for an address."""
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
        logger.warning("Error fetching normal txs for %s: %s", address, exc)
        return []


async def _fetch_current_prices(symbols: list[str]) -> dict[str, float]:
    """Best-effort price lookup via CoinGecko search.

    Maps token symbols to USD prices. Missing tokens return 0.
    """
    if not symbols:
        return {}

    # CoinGecko /simple/price accepts ids, not symbols.
    # We try to find ids by searching; fall back to 0 for unknowns.
    prices: dict[str, float] = {}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            for symbol in symbols[:20]:  # Limit to avoid rate-limiting
                try:
                    resp = await client.get(
                        f"{COINGECKO_API}/search",
                        params={"query": symbol},
                    )
                    resp.raise_for_status()
                    coins = resp.json().get("coins", [])
                    if coins:
                        coin_id = coins[0]["id"]
                        price_resp = await client.get(
                            f"{COINGECKO_API}/simple/price",
                            params={"ids": coin_id, "vs_currencies": "usd"},
                        )
                        price_resp.raise_for_status()
                        price_data = price_resp.json()
                        prices[symbol.upper()] = price_data.get(coin_id, {}).get("usd", 0)
                    else:
                        prices[symbol.upper()] = 0
                except Exception:
                    prices[symbol.upper()] = 0
    except Exception as exc:
        logger.warning("Error fetching current prices: %s", exc)

    return prices


async def calculate_pnl(address: str, chain: str = "ethereum") -> dict[str, Any]:
    """Calculate profit/loss for all ERC-20 tokens held or traded by an address.

    Groups transfers by token, computes average cost basis, and estimates
    realized + unrealized P&L using current CoinGecko prices.
    """
    try:
        transfers = await _fetch_token_transfers(address, chain)
        address_lower = address.lower()

        # Group transfers by token symbol
        token_data: dict[str, dict[str, Any]] = defaultdict(lambda: {
            "symbol": "",
            "token_name": "",
            "decimals": 18,
            "total_bought": 0.0,
            "total_sold": 0.0,
            "cost_basis_sum": 0.0,  # sum of (amount * estimated price at time)
            "revenue_sum": 0.0,
        })

        for tx in transfers:
            symbol = tx.get("tokenSymbol", "UNKNOWN")
            decimals = int(tx.get("tokenDecimal", 18))
            raw_value = int(tx.get("value", 0))
            amount = raw_value / (10 ** decimals) if decimals > 0 else raw_value

            entry = token_data[symbol]
            entry["symbol"] = symbol
            entry["token_name"] = tx.get("tokenName", symbol)
            entry["decimals"] = decimals

            if tx.get("to", "").lower() == address_lower:
                # Incoming = buy
                entry["total_bought"] += amount
            elif tx.get("from", "").lower() == address_lower:
                # Outgoing = sell
                entry["total_sold"] += amount

        # Fetch current prices for all tokens
        symbols = list(token_data.keys())
        current_prices = await _fetch_current_prices(symbols)

        tokens: list[dict[str, Any]] = []
        total_unrealized = 0.0
        total_realized = 0.0

        for symbol, data in token_data.items():
            current_price = current_prices.get(symbol.upper(), 0)
            net_held = data["total_bought"] - data["total_sold"]

            # Without historical price data, we approximate:
            # avg_buy_price ~ 0 (unknown), so unrealized = net_held * current_price
            unrealized_pnl = net_held * current_price if net_held > 0 else 0
            realized_pnl = data["total_sold"] * current_price  # Rough estimate

            tokens.append({
                "symbol": symbol,
                "token_name": data["token_name"],
                "total_bought": round(data["total_bought"], 6),
                "total_sold": round(data["total_sold"], 6),
                "net_held": round(net_held, 6),
                "avg_buy_price": 0,  # Requires historical price data to compute accurately
                "current_price": current_price,
                "realized_pnl": round(realized_pnl, 2),
                "unrealized_pnl": round(unrealized_pnl, 2),
            })

            total_unrealized += unrealized_pnl
            total_realized += realized_pnl

        # Sort by unrealized P&L descending
        tokens.sort(key=lambda t: t["unrealized_pnl"], reverse=True)

        return {
            "address": address,
            "chain": chain,
            "tokens": tokens,
            "total_realized_pnl": round(total_realized, 2),
            "total_unrealized_pnl": round(total_unrealized, 2),
            "token_count": len(tokens),
            "note": "P&L is approximate — historical buy prices are not available from free APIs.",
        }

    except Exception as exc:
        logger.error("Error calculating PnL for %s: %s", address, exc)
        return {
            "address": address,
            "chain": chain,
            "tokens": [],
            "total_realized_pnl": 0,
            "total_unrealized_pnl": 0,
            "error": str(exc),
        }


async def get_transaction_summary(address: str, chain: str = "ethereum") -> dict[str, Any]:
    """Return high-level transaction statistics for an address."""
    try:
        txs = await _fetch_normal_txs(address, chain)
        if not txs:
            return {
                "address": address,
                "chain": chain,
                "total_transactions": 0,
                "total_gas_spent_eth": 0,
                "first_tx_date": None,
                "last_tx_date": None,
            }

        total_gas_wei = 0
        first_ts = int(txs[0].get("timeStamp", 0))
        last_ts = int(txs[-1].get("timeStamp", 0))

        for tx in txs:
            gas_used = int(tx.get("gasUsed", 0))
            gas_price = int(tx.get("gasPrice", 0))
            total_gas_wei += gas_used * gas_price

        total_gas_eth = total_gas_wei / 1e18

        return {
            "address": address,
            "chain": chain,
            "total_transactions": len(txs),
            "total_gas_spent_eth": round(total_gas_eth, 6),
            "first_tx_date": datetime.fromtimestamp(first_ts, tz=timezone.utc).isoformat() if first_ts else None,
            "last_tx_date": datetime.fromtimestamp(last_ts, tz=timezone.utc).isoformat() if last_ts else None,
        }

    except Exception as exc:
        logger.error("Error getting transaction summary for %s: %s", address, exc)
        return {
            "address": address,
            "chain": chain,
            "total_transactions": 0,
            "total_gas_spent_eth": 0,
            "first_tx_date": None,
            "last_tx_date": None,
            "error": str(exc),
        }
