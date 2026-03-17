"""DeFi position tracking — staking, lending, LP detection."""

from services.blockchain.etherscan import get_token_balances
from services.coingecko import get_prices

# Known DeFi token contracts (Ethereum mainnet)
DEFI_TOKENS = {
    "0xae7ab96520de3a18e5e111b5eaab095312d7fe84": {"name": "Lido Staked ETH", "symbol": "stETH", "type": "staking", "underlying": "ethereum"},
    "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0": {"name": "Wrapped stETH", "symbol": "wstETH", "type": "staking", "underlying": "ethereum"},
    "0xbe9895146f7af43049ca1c1ae358b0541ea49704": {"name": "Coinbase Wrapped ETH", "symbol": "cbETH", "type": "staking", "underlying": "ethereum"},
    "0xac3e018457b222d93114458476f3e3416abbe38f": {"name": "Frax Staked ETH", "symbol": "sfrxETH", "type": "staking", "underlying": "ethereum"},
    "0xa17581a9e3356d9a858b789d68b4d866e593ae94": {"name": "Compound cETH", "symbol": "cETH", "type": "lending", "underlying": "ethereum"},
    "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5": {"name": "Compound cETH v2", "symbol": "cETHv2", "type": "lending", "underlying": "ethereum"},
    "0x030ba81f1c18d280636f32af80b9aad02cf0854e": {"name": "Aave aWETH", "symbol": "aWETH", "type": "lending", "underlying": "ethereum"},
}


async def get_defi_positions(address: str, chain: str = "ethereum") -> list[dict]:
    """Detect DeFi positions from token balances."""
    try:
        tokens = await get_token_balances(chain, address)
    except Exception:
        tokens = []

    positions = []
    for token in tokens:
        contract = token.get("contract", "").lower()
        defi_info = DEFI_TOKENS.get(contract)
        if defi_info:
            # Get underlying asset price
            try:
                prices = await get_prices((defi_info["underlying"],))
                usd_price = prices.get(defi_info["underlying"], {}).get("usd", 0)
            except Exception:
                usd_price = 0

            positions.append({
                "protocol": defi_info["name"],
                "symbol": defi_info["symbol"],
                "type": defi_info["type"],
                "balance": token["balance"],
                "usd_value": round(token["balance"] * usd_price, 2),
                "underlying": defi_info["underlying"],
                "chain": chain,
            })
        elif token.get("symbol", "").startswith("UNI-V"):
            # Uniswap LP tokens
            positions.append({
                "protocol": f"Uniswap LP: {token.get('name', 'Unknown')}",
                "symbol": token["symbol"],
                "type": "liquidity",
                "balance": token["balance"],
                "usd_value": 0,  # LP value requires on-chain calculation
                "chain": chain,
            })

    return positions


async def get_all_defi_positions(wallets: list[dict]) -> list[dict]:
    """Get DeFi positions across all saved wallets."""
    all_positions = []
    for w in wallets:
        chain = w.get("chain", "ethereum")
        if chain not in ("ethereum", "polygon", "arbitrum", "optimism", "base"):
            continue
        try:
            positions = await get_defi_positions(w["address"], chain)
            for p in positions:
                p["wallet_label"] = w.get("label", "")
                p["wallet_address"] = w["address"]
            all_positions.extend(positions)
        except Exception:
            continue
    return all_positions
