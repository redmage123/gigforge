"""Gas price tracking — current prices, history, best-time recommendations."""

import time
from services.blockchain.ethereum import EVMClient
from services.user_data import load_shared_data, save_shared_data
from config import EVM_CHAINS


async def get_current_gas() -> dict:
    """Get current gas prices across all EVM chains."""
    results = {}
    for chain in EVM_CHAINS:
        try:
            client = EVMClient(chain)
            gas = await client.get_gas_price()
            results[chain] = gas
        except Exception:
            results[chain] = {"chain": chain, "gas_gwei": 0, "error": "unavailable"}
    return results


async def sample_gas():
    """Background task: record gas prices for history."""
    current = await get_current_gas()
    history = load_shared_data("gas_history")

    entry = {
        "timestamp": time.time(),
        "hour": int(time.strftime("%H")),
        "day": int(time.strftime("%w")),  # 0=Sunday
        "prices": {chain: data.get("gas_gwei", 0) for chain, data in current.items()},
    }
    history.append(entry)
    # Keep last 2016 samples (~7 days at 5-min intervals)
    history = history[-2016:]
    save_shared_data("gas_history", history)


def get_gas_history(chain: str = "ethereum", hours: int = 24) -> list[dict]:
    """Get historical gas prices for a chain."""
    history = load_shared_data("gas_history")
    cutoff = time.time() - (hours * 3600)
    return [
        {"timestamp": h["timestamp"], "gas_gwei": h["prices"].get(chain, 0)}
        for h in history if h["timestamp"] > cutoff
    ]


def get_best_time(chain: str = "ethereum") -> dict:
    """Analyze historical gas to recommend best transaction times."""
    history = load_shared_data("gas_history")
    if len(history) < 24:
        return {"recommendation": "Not enough data yet. Check back in a few hours.", "best_hour": None}

    # Average gas by hour of day
    hour_totals: dict[int, list] = {h: [] for h in range(24)}
    for entry in history[-288:]:  # Last 24 hours of samples
        hour = entry.get("hour", 0)
        gas = entry["prices"].get(chain, 0)
        if gas > 0:
            hour_totals[hour].append(gas)

    hour_avgs = {}
    for h, prices in hour_totals.items():
        if prices:
            hour_avgs[h] = sum(prices) / len(prices)

    if not hour_avgs:
        return {"recommendation": "No data for this chain.", "best_hour": None}

    best_hour = min(hour_avgs, key=hour_avgs.get)
    worst_hour = max(hour_avgs, key=hour_avgs.get)

    return {
        "best_hour": best_hour,
        "best_avg_gwei": round(hour_avgs[best_hour], 2),
        "worst_hour": worst_hour,
        "worst_avg_gwei": round(hour_avgs[worst_hour], 2),
        "recommendation": f"Best time: ~{best_hour}:00 UTC ({hour_avgs[best_hour]:.1f} Gwei avg). "
                         f"Avoid ~{worst_hour}:00 UTC ({hour_avgs[worst_hour]:.1f} Gwei avg).",
        "hourly_averages": {str(h): round(v, 2) for h, v in sorted(hour_avgs.items())},
    }
