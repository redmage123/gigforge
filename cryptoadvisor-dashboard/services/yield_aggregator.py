"""DeFi yield aggregation service using DeFi Llama."""

import httpx
from cachetools import TTLCache

_cache = TTLCache(maxsize=32, ttl=300)  # 5 minute cache
_TIMEOUT = 15.0

DEFI_LLAMA_YIELDS_URL = "https://yields.llama.fi/pools"

# Risk classification by token symbol patterns
STABLECOIN_TOKENS = {"USDT", "USDC", "DAI", "FRAX", "LUSD", "TUSD", "BUSD", "GUSD", "USDP", "USDD", "CRVUSD", "GHO", "PYUSD"}
BLUE_CHIP_TOKENS = {"ETH", "WETH", "STETH", "WSTETH", "BTC", "WBTC", "CBETH", "RETH", "SFRXETH"}


def _classify_risk(symbol: str) -> str:
    """Classify pool risk level based on token symbols."""
    parts = {s.strip().upper() for s in symbol.replace("/", "-").split("-")}
    if parts & STABLECOIN_TOKENS:
        if parts <= STABLECOIN_TOKENS:
            return "stablecoin"
        return "blue-chip"  # stablecoin paired with something
    if parts & BLUE_CHIP_TOKENS:
        return "blue-chip"
    return "degen"


async def get_defi_yields() -> list[dict]:
    """Fetch DeFi yield data from DeFi Llama, filtered by top TVL pools."""
    cache_key = "defi_yields"
    if cache_key in _cache:
        return _cache[cache_key]

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(DEFI_LLAMA_YIELDS_URL)
            resp.raise_for_status()
            data = resp.json()
            pools = data.get("data", [])

        # Filter: must have positive APY and meaningful TVL
        valid_pools = [
            p for p in pools
            if p.get("apy") and p["apy"] > 0 and p.get("tvlUsd", 0) > 100_000
        ]

        # Sort by TVL descending, take top 200 for processing
        valid_pools.sort(key=lambda x: x.get("tvlUsd", 0), reverse=True)
        valid_pools = valid_pools[:200]

        results = []
        for p in valid_pools:
            symbol = p.get("symbol", "UNKNOWN")
            results.append({
                "protocol": p.get("project", "unknown"),
                "chain": p.get("chain", "unknown"),
                "token": symbol,
                "apy": round(p.get("apy", 0), 2),
                "tvl": round(p.get("tvlUsd", 0), 2),
                "pool_id": p.get("pool", ""),
                "risk_level": _classify_risk(symbol),
                "il_risk": p.get("ilRisk", "unknown"),
                "reward_tokens": p.get("rewardTokens", []),
            })

        _cache[cache_key] = results
        return results

    except Exception as e:
        return [{"error": f"Failed to fetch yields: {e}"}]


async def get_best_yields_for_token(token: str) -> list[dict]:
    """Get the best yield opportunities for a specific token."""
    cache_key = f"yields_{token.upper()}"
    if cache_key in _cache:
        return _cache[cache_key]

    all_yields = await get_defi_yields()
    if all_yields and "error" in all_yields[0]:
        return all_yields

    token_upper = token.upper()
    # Match pools that contain the token in their symbol
    matching = [
        y for y in all_yields
        if token_upper in y["token"].upper().replace("/", "-").split("-")
        or token_upper in y["token"].upper()
    ]

    # Sort by APY descending
    matching.sort(key=lambda x: x["apy"], reverse=True)

    result = matching[:20]
    _cache[cache_key] = result
    return result


async def get_yield_summary() -> dict:
    """Get a summary of top yields across all tokens, grouped by risk level."""
    cache_key = "yield_summary"
    if cache_key in _cache:
        return _cache[cache_key]

    all_yields = await get_defi_yields()
    if all_yields and "error" in all_yields[0]:
        return {"error": all_yields[0]["error"]}

    # Group by risk level and get top yields per category
    grouped: dict[str, list[dict]] = {"stablecoin": [], "blue-chip": [], "degen": []}
    for y in all_yields:
        risk = y.get("risk_level", "degen")
        if risk in grouped:
            grouped[risk].append(y)

    # Sort each group by APY and take top entries
    for risk_level in grouped:
        grouped[risk_level].sort(key=lambda x: x["apy"], reverse=True)
        grouped[risk_level] = grouped[risk_level][:10]

    # Overall top 20 by APY
    all_sorted = sorted(all_yields, key=lambda x: x["apy"], reverse=True)[:20]

    result = {
        "top_20_overall": all_sorted,
        "top_stablecoin": grouped["stablecoin"],
        "top_blue_chip": grouped["blue-chip"],
        "top_degen": grouped["degen"],
        "stats": {
            "total_pools_tracked": len(all_yields),
            "avg_stablecoin_apy": round(
                sum(y["apy"] for y in grouped["stablecoin"]) / len(grouped["stablecoin"]), 2
            ) if grouped["stablecoin"] else 0,
            "avg_blue_chip_apy": round(
                sum(y["apy"] for y in grouped["blue-chip"]) / len(grouped["blue-chip"]), 2
            ) if grouped["blue-chip"] else 0,
        },
    }
    _cache[cache_key] = result
    return result
