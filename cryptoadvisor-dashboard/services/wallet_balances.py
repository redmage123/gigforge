"""Balances for saved wallets from free, keyless public sources.

- Ethereum: Blockscout (native ETH plus ERC-20 tokens), public RPC fallback for ETH alone
- Other EVM chains: native coin via public JSON-RPC endpoints (first one that answers)
- Bitcoin: Blockstream, mempool.space fallback
- Solana: public mainnet RPC
USD prices come from the market layer (services.market); ERC-20 prices from Blockscout's rate.
"""

import asyncio
import re

import httpx

from services import market
from services.blockchain import blockscout

TIMEOUT = 12.0
_UA = {"User-Agent": "Mozilla/5.0 AssetAdvisor"}

# chain -> (native symbol, market instrument ids to price it, public RPC endpoints in order)
EVM = {
    "ethereum": ("ETH", ["crypto:ETH"], ["https://ethereum-rpc.publicnode.com", "https://cloudflare-eth.com"]),
    "bsc": ("BNB", ["crypto:BNB"], ["https://bsc-dataseed1.binance.org", "https://bsc-rpc.publicnode.com"]),
    "polygon": ("POL", ["crypto:POL", "crypto:MATIC"], ["https://polygon-bor-rpc.publicnode.com", "https://polygon-rpc.com"]),
    "arbitrum": ("ETH", ["crypto:ETH"], ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"]),
    "optimism": ("ETH", ["crypto:ETH"], ["https://mainnet.optimism.io", "https://optimism-rpc.publicnode.com"]),
    "avalanche": ("AVAX", ["crypto:AVAX"], ["https://api.avax.network/ext/bc/C/rpc", "https://avalanche-c-chain-rpc.publicnode.com"]),
    "base": ("ETH", ["crypto:ETH"], ["https://mainnet.base.org", "https://base-rpc.publicnode.com"]),
}
BTC_APIS = ["https://blockstream.info/api", "https://mempool.space/api"]
SOLANA_RPC = "https://api.mainnet-beta.solana.com"
CHAINS = (*EVM, "bitcoin", "solana")

_EVM_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
_SOL_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")
_BTC_RE = re.compile(r"^(bc1[a-z0-9]{8,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$")


class BalanceError(Exception):
    """A provider failure, worded for the user."""


def validate(address: str, chain: str) -> str | None:
    """Error message if `address` isn't plausible for `chain`, else None."""
    if chain not in CHAINS:
        return f"Unsupported chain: {chain}"
    ok = (_EVM_RE.match(address) if chain in EVM else
          _BTC_RE.match(address) if chain == "bitcoin" else _SOL_RE.match(address))
    return None if ok else f"That does not look like a valid {chain} address"


async def _rpc(client: httpx.AsyncClient, url: str, method: str, params: list):
    r = await client.post(url, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
    r.raise_for_status()
    body = r.json()
    if "error" in body or "result" not in body:
        raise BalanceError(str((body.get("error") or {}).get("message") or "RPC error"))
    return body["result"]


async def evm_native(client: httpx.AsyncClient, chain: str, address: str) -> float:
    """Native balance via the first public RPC endpoint that answers."""
    last = None
    for url in EVM[chain][2]:
        try:
            return int(await _rpc(client, url, "eth_getBalance", [address, "latest"]), 16) / 1e18
        except (httpx.HTTPError, BalanceError, ValueError, TypeError) as exc:
            last = exc
    raise BalanceError(f"Public {chain} RPC endpoints did not respond ({type(last).__name__})")


async def eth_with_tokens(client: httpx.AsyncClient, address: str) -> tuple[float, list[dict], str]:
    """(ETH balance, ERC-20 holdings, source). Tokens need Blockscout; ETH falls back to public RPC."""
    try:
        info = await blockscout.get(f"/addresses/{address}", client=client)
        eth, source = int(info.get("coin_balance") or 0) / 1e18, "Blockscout"
    except (blockscout.BlockscoutError, ValueError, TypeError):
        info, eth, source = {}, await evm_native(client, "ethereum", address), "public RPC"
    tokens = []
    if info.get("has_tokens", True):
        try:
            items, _ = await blockscout.paged(f"/addresses/{address}/tokens", {"type": "ERC-20"}, 4, client)
        except blockscout.BlockscoutError:
            return eth, [], f"{source} (token balances unavailable right now)"
        for it in items:
            tok = it.get("token") or {}
            if not blockscout.trusted(tok):
                continue
            amount = blockscout.scaled(it.get("value"), tok.get("decimals"))
            if not amount:
                continue
            price = blockscout.rate(tok)
            tokens.append({"symbol": tok.get("symbol") or "?", "name": tok.get("name") or "", "contract": tok.get("address_hash"),
                           "balance": amount, "usd_price": price,
                           "usd_value": round(amount * price, 2) if price is not None else None})
        tokens.sort(key=lambda t: t["usd_value"] or 0, reverse=True)
        source = "Blockscout" if source == "Blockscout" else "public RPC + Blockscout tokens"
    return eth, tokens, source


async def btc_balance(client: httpx.AsyncClient, address: str) -> float:
    last = None
    for base in BTC_APIS:
        try:
            r = await client.get(f"{base}/address/{address}")
            r.raise_for_status()
            s = r.json().get("chain_stats") or {}
            return (int(s.get("funded_txo_sum", 0)) - int(s.get("spent_txo_sum", 0))) / 1e8
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            last = exc
    raise BalanceError(f"Bitcoin explorers did not respond ({type(last).__name__})")


async def sol_balance(client: httpx.AsyncClient, address: str) -> float:
    try:
        res = await _rpc(client, SOLANA_RPC, "getBalance", [address])
        return int(res["value"]) / 1e9
    except (httpx.HTTPError, KeyError, ValueError, TypeError) as exc:
        raise BalanceError(f"Solana RPC did not respond ({type(exc).__name__})") from exc


def _native(chain: str) -> tuple[str, list[str]]:
    if chain in EVM:
        return EVM[chain][0], EVM[chain][1]
    return ("BTC", ["crypto:BTC"]) if chain == "bitcoin" else ("SOL", ["crypto:SOL"])


async def native_prices(chains) -> dict[str, float]:
    """USD price per native symbol from the market layer; missing prices are simply absent."""
    ids = sorted({i for c in chains if c in CHAINS for i in _native(c)[1]})
    try:
        got = await market.quotes(ids)
    except Exception:  # noqa: BLE001 - balances still show without prices
        return {}
    out = {}
    for c in chains:
        if c not in CHAINS:
            continue
        sym, cands = _native(c)
        for iid in cands:
            if iid in got and got[iid].price:
                out[sym] = got[iid].price
                break
    return out


async def wallet_balance(client: httpx.AsyncClient, wallet: dict, prices: dict[str, float]) -> dict:
    address, chain = wallet.get("address", ""), wallet.get("chain", "ethereum")
    out = {"label": wallet.get("label"), "address": address, "chain": chain}
    bad = validate(address, chain)
    if bad:
        return {**out, "error": bad}
    sym = _native(chain)[0]
    tokens, source = [], "public RPC"
    try:
        if chain == "ethereum":
            bal, tokens, source = await eth_with_tokens(client, address)
        elif chain in EVM:
            bal = await evm_native(client, chain, address)
        elif chain == "bitcoin":
            bal, source = await btc_balance(client, address), "Blockstream / mempool.space"
        else:
            bal = await sol_balance(client, address)
    except BalanceError as exc:
        return {**out, "symbol": sym, "error": str(exc)}
    price = prices.get(sym)
    native_usd = round(bal * price, 2) if price is not None else None
    tokens_usd = round(sum(t["usd_value"] or 0 for t in tokens), 2)
    return {
        **out, "symbol": sym, "balance": round(bal, 8), "usd_price": price, "usd_value": native_usd,
        "tokens": tokens, "tokens_usd": tokens_usd,
        "total_usd": round((native_usd or 0) + tokens_usd, 2),
        "unpriced_tokens": sum(1 for t in tokens if t["usd_value"] is None),
        "source": source,
    }


async def balances(wallets: list[dict]) -> dict:
    """Balances for every saved wallet; one failing provider doesn't hide the others."""
    if not wallets:
        return {"wallets": [], "total_usd": 0.0, "errors": 0}
    prices = await native_prices([w.get("chain") for w in wallets])
    sem = asyncio.Semaphore(4)
    async with httpx.AsyncClient(timeout=TIMEOUT, headers=_UA) as client:
        async def one(w):
            async with sem:
                return await wallet_balance(client, w, prices)
        rows = await asyncio.gather(*(one(w) for w in wallets))
    return {
        "wallets": rows,
        "total_usd": round(sum(r.get("total_usd") or 0 for r in rows), 2),
        "errors": sum(1 for r in rows if r.get("error")),
    }
