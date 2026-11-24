"""On-chain activity and value for an Ethereum address, from free keyless sources.

What this can honestly compute (Blockscout + market layer prices):
- per ERC-20 token: amounts received and sent, net flow, the balance now and its value at today's price
- native ETH: amounts received and sent in normal transactions, balance now and its value
- gas: every fee the address paid, in ETH, in USD at the ETH price on each transaction's day
  (Blockscout's historic rate) where known, and in USD at today's price
What it can't: cost basis. Transfers don't carry the price paid, so realized/unrealized P&L is not
calculated; the response says so instead of reporting zeros.
"""

import asyncio
import re
import time

from cachetools import TTLCache

from services import market
from services.blockchain import blockscout

MAX_PAGES = 10  # 50 items per page: up to 500 transfers and 500 transactions
_ADDR_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
_cache: TTLCache = TTLCache(maxsize=64, ttl=300)


class PnLError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _hash(party) -> str:
    return ((party or {}).get("hash") or "").lower() if isinstance(party, dict) else str(party or "").lower()


def summarize(address: str, info: dict, balances: list[dict], transfers: list[dict], txs: list[dict],
              eth_price: float | None, truncated: dict[str, bool]) -> dict:
    """Pure aggregation of Blockscout payloads; network-free so it can be tested directly."""
    me = address.lower()
    tokens: dict[str, dict] = {}
    hidden = set()

    def slot(tok: dict) -> dict | None:
        key = (tok.get("address_hash") or tok.get("address") or "").lower()
        if not key:
            return None
        if not blockscout.trusted(tok):
            hidden.add(key)
            return None
        if key not in tokens:
            tokens[key] = {"contract": tok.get("address_hash") or tok.get("address"), "symbol": tok.get("symbol") or "?",
                           "name": tok.get("name") or "", "received": 0.0, "sent": 0.0, "transfers_in": 0,
                           "transfers_out": 0, "balance": 0.0, "price": blockscout.rate(tok)}
        return tokens[key]

    for t in transfers:
        tok = t.get("token") or {}
        s = slot(tok)
        if s is None:
            continue
        total = t.get("total") or {}
        amt = blockscout.scaled(total.get("value"), total.get("decimals") or tok.get("decimals"))
        if amt is None:
            continue
        src, dst = _hash(t.get("from")), _hash(t.get("to"))
        if dst == me and src != me:
            s["received"] += amt
            s["transfers_in"] += 1
        elif src == me and dst != me:
            s["sent"] += amt
            s["transfers_out"] += 1

    for b in balances:
        tok = b.get("token") or {}
        s = slot(tok)
        amt = blockscout.scaled(b.get("value"), tok.get("decimals"))
        if s is not None and amt is not None:
            s["balance"] = amt
            s["price"] = blockscout.rate(tok) or s["price"]

    rows = []
    for s in tokens.values():
        value = round(s["balance"] * s["price"], 2) if s["price"] is not None else None
        rows.append({**s, "net_flow": s["received"] - s["sent"], "value_usd": value})
    rows.sort(key=lambda r: (r["value_usd"] is None, -(r["value_usd"] or 0), r["symbol"]))

    eth_in = eth_out = gas_eth = gas_usd_hist = 0.0
    hist_count = sent_count = 0
    times = []
    for tx in txs:
        src, dst = _hash(tx.get("from")), _hash(tx.get("to"))
        val = (blockscout.scaled(tx.get("value"), 18) or 0.0)
        ok = tx.get("status", "ok") == "ok"
        if tx.get("timestamp"):
            times.append(tx["timestamp"])
        if src == me:
            sent_count += 1
            fee = (tx.get("fee") or {}).get("value") if isinstance(tx.get("fee"), dict) else tx.get("fee")
            fee_eth = blockscout.scaled(fee, 18) or 0.0
            gas_eth += fee_eth
            try:
                hist = float(tx.get("historic_exchange_rate"))
            except (TypeError, ValueError):
                hist = None
            if hist:
                gas_usd_hist += fee_eth * hist
                hist_count += 1
            if ok and dst != me:
                eth_out += val
        elif dst == me and ok:
            eth_in += val

    eth_balance = (blockscout.scaled(info.get("coin_balance"), 18) or 0.0) if info else 0.0
    if eth_price is None:
        try:
            eth_price = float(info.get("exchange_rate")) or None
        except (TypeError, ValueError):
            eth_price = None
    eth_value = round(eth_balance * eth_price, 2) if eth_price is not None else None
    tokens_value = round(sum(r["value_usd"] or 0 for r in rows), 2)

    notes = [
        "Cost basis is not available from free on-chain data, so realized and unrealized profit and loss are "
        "not calculated. Net flow is tokens received minus tokens sent.",
        "Values use today's prices. Token prices come from Blockscout; tokens without a price show no value "
        "and are left out of totals.",
        "ETH flows count normal transactions only; ETH moved by contracts (internal transactions) is not included.",
    ]
    if truncated.get("transfers") or truncated.get("transactions"):
        notes.append(f"This address has more history than the latest {MAX_PAGES * 50} token transfers and "
                     f"{MAX_PAGES * 50} transactions read here, so flows and gas cover only the most recent activity.")
    if hidden:
        notes.append(f"{len(hidden)} token(s) flagged as spam by Blockscout are hidden.")
    if sent_count and hist_count < sent_count:
        notes.append(f"{sent_count - hist_count} of {sent_count} fees had no historical ETH price; the "
                     "historical gas figure leaves them out, the today's-price figure includes them.")

    return {
        "address": address, "chain": "ethereum", "source": "Blockscout (eth.blockscout.com)",
        "eth": {"balance": eth_balance, "price": eth_price, "value_usd": eth_value,
                "received": eth_in, "sent": eth_out, "net_flow": eth_in - eth_out},
        "gas": {"eth": gas_eth, "usd_at_tx_time": round(gas_usd_hist, 2),
                "usd_at_today": round(gas_eth * eth_price, 2) if eth_price is not None else None,
                "transactions_paid": sent_count, "with_historic_price": hist_count},
        "tokens": rows,
        "tokens_value_usd": tokens_value,
        "unpriced_tokens": sum(1 for r in rows if r["value_usd"] is None),
        "total_value_usd": round((eth_value or 0) + tokens_value, 2),
        "transactions_read": len(txs), "transfers_read": len(transfers),
        "first_activity": min(times) if times and not truncated.get("transactions") else None,
        "last_activity": max(times) if times else None,
        "truncated": truncated,
        "pnl_available": False,
        "notes": notes,
        "as_of": time.time(),
    }


async def _info(address: str, client) -> dict:
    """Address summary (ETH balance). This endpoint is the slowest; fall back to public RPC for the balance."""
    try:
        return await blockscout.get(f"/addresses/{address}", client=client)
    except blockscout.BlockscoutError:
        from services.wallet_balances import BalanceError, evm_native

        try:
            wei = round(await evm_native(client, "ethereum", address) * 1e18)
        except BalanceError:
            raise blockscout.BlockscoutError("Could not read the ETH balance")
        return {"coin_balance": str(wei)}


async def analyze(address: str) -> dict:
    address = (address or "").strip()
    if not _ADDR_RE.match(address):
        raise PnLError("Enter an Ethereum address (0x followed by 40 hex characters)")
    key = address.lower()
    if key in _cache:
        return _cache[key]
    try:
        async with blockscout.client() as c:
            info, (balances, _), (transfers, t_trunc), (txs, x_trunc) = await asyncio.gather(
                _info(address, c),
                blockscout.paged(f"/addresses/{address}/tokens", {"type": "ERC-20"}, 4, c),
                blockscout.paged(f"/addresses/{address}/token-transfers", {"type": "ERC-20"}, MAX_PAGES, c),
                blockscout.paged(f"/addresses/{address}/transactions", None, MAX_PAGES, c),
            )
    except blockscout.BlockscoutError as exc:
        raise PnLError(f"{exc}. On-chain data is unavailable right now; try again shortly.", 502)
    eth_price = None
    try:
        q = (await market.quotes(["crypto:ETH"])).get("crypto:ETH")
        eth_price = q.price if q and q.price else None
    except Exception:  # noqa: BLE001 - fall back to Blockscout's ETH rate
        pass
    out = summarize(address, info, balances, transfers, txs, eth_price,
                    {"transfers": t_trunc, "transactions": x_trunc})
    _cache[key] = out
    return out
