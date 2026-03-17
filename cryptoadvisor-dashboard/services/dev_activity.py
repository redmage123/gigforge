"""Developer activity scoring service using GitHub API."""

from datetime import datetime, timedelta, timezone

import httpx
from cachetools import TTLCache

_cache = TTLCache(maxsize=64, ttl=300)
_TIMEOUT = 15.0

GITHUB_API = "https://api.github.com"

# Token → GitHub org mapping
TOKEN_ORG_MAP: dict[str, str] = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "SOL": "solana-labs",
    "ADA": "cardano-foundation",
    "DOT": "paritytech",
    "UNI": "Uniswap",
    "AAVE": "aave",
    "LINK": "smartcontractkit",
    "AVAX": "ava-labs",
    "MATIC": "maticnetwork",
    "ARB": "OffchainLabs",
    "OP": "ethereum-optimism",
    "ATOM": "cosmos",
    "NEAR": "near",
    "FTM": "Fantom-foundation",
    "APT": "aptos-labs",
    "SUI": "MystenLabs",
    "SEI": "sei-protocol",
    "INJ": "InjectiveLabs",
    "CRV": "curvefi",
    "MKR": "makerdao",
    "COMP": "compound-finance",
    "SNX": "Synthetixio",
    "DYDX": "dydxprotocol",
    "GMX": "gmx-io",
    "LDO": "lidofinance",
    "RPL": "rocket-pool",
    "PENDLE": "pendle-finance",
}


async def get_github_activity(org: str) -> dict:
    """Fetch recent GitHub activity for an organization."""
    cache_key = f"github_{org}"
    if cache_key in _cache:
        return _cache[cache_key]

    result: dict = {"org": org, "events": [], "error": None}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            # Fetch recent events
            headers = {"Accept": "application/vnd.github.v3+json"}
            resp = await client.get(
                f"{GITHUB_API}/orgs/{org}/events?per_page=30",
                headers=headers,
            )

            if resp.status_code == 404:
                result["error"] = f"GitHub org '{org}' not found"
                return result

            if resp.status_code == 403:
                result["error"] = "GitHub API rate limit exceeded"
                return result

            resp.raise_for_status()
            events = resp.json()

            parsed_events = []
            for event in events:
                parsed_events.append({
                    "type": event.get("type", ""),
                    "repo": event.get("repo", {}).get("name", ""),
                    "actor": event.get("actor", {}).get("login", ""),
                    "created_at": event.get("created_at", ""),
                })
            result["events"] = parsed_events

            # Also fetch repos for count
            repos_resp = await client.get(
                f"{GITHUB_API}/orgs/{org}/repos?per_page=1&type=public",
                headers=headers,
            )
            if repos_resp.status_code == 200:
                # Parse total repo count from Link header
                link_header = repos_resp.headers.get("Link", "")
                if "last" in link_header:
                    import re
                    match = re.search(r'page=(\d+)>; rel="last"', link_header)
                    result["public_repo_count"] = int(match.group(1)) if match else 1
                else:
                    repos_data = repos_resp.json()
                    result["public_repo_count"] = len(repos_data)

    except Exception as e:
        result["error"] = str(e)

    _cache[cache_key] = result
    return result


async def get_dev_score(coin: str) -> dict:
    """Calculate a developer activity score (1-100) for a coin."""
    cache_key = f"devscore_{coin.upper()}"
    if cache_key in _cache:
        return _cache[cache_key]

    coin_upper = coin.upper()
    org = TOKEN_ORG_MAP.get(coin_upper)
    if not org:
        return {
            "coin": coin_upper,
            "error": f"No GitHub org mapped for {coin_upper}",
            "supported_coins": list(TOKEN_ORG_MAP.keys()),
        }

    activity = await get_github_activity(org)
    if activity.get("error"):
        return {"coin": coin_upper, "org": org, "error": activity["error"]}

    events = activity.get("events", [])
    now = datetime.now(timezone.utc)
    cutoff_30d = now - timedelta(days=30)

    # Count events in last 30 days
    recent_events = []
    contributors: set[str] = set()
    push_count = 0
    last_commit_date = None

    for event in events:
        created = event.get("created_at", "")
        try:
            event_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            continue

        if event_dt >= cutoff_30d:
            recent_events.append(event)
            contributors.add(event.get("actor", ""))

            if event["type"] == "PushEvent":
                push_count += 1

            if last_commit_date is None or event_dt > last_commit_date:
                last_commit_date = event_dt

    repo_count = activity.get("public_repo_count", 0)

    # Compute activity score (1-100) based on heuristics
    # Factors: event count, unique contributors, push frequency, repo count
    event_score = min(len(recent_events) / 30 * 40, 40)  # max 40 points
    contributor_score = min(len(contributors) / 10 * 25, 25)  # max 25 points
    push_score = min(push_count / 15 * 20, 20)  # max 20 points
    repo_score = min(repo_count / 50 * 15, 15)  # max 15 points

    activity_score = round(event_score + contributor_score + push_score + repo_score)
    activity_score = max(1, min(100, activity_score))

    result = {
        "coin": coin_upper,
        "org": org,
        "commit_count_30d": push_count,
        "total_events_30d": len(recent_events),
        "contributors": len(contributors),
        "last_commit_date": last_commit_date.isoformat() if last_commit_date else None,
        "repo_count": repo_count,
        "activity_score": activity_score,
        "rating": "very active" if activity_score >= 75 else "active" if activity_score >= 50 else "moderate" if activity_score >= 25 else "low",
    }
    _cache[cache_key] = result
    return result


async def get_dev_comparison(coins: list[str]) -> list[dict]:
    """Compare developer activity across multiple coins."""
    results: list[dict] = []

    for coin in coins:
        score = await get_dev_score(coin)
        results.append(score)

    # Sort by activity score descending
    valid = [r for r in results if "error" not in r]
    errors = [r for r in results if "error" in r]

    valid.sort(key=lambda x: x.get("activity_score", 0), reverse=True)

    # Add rank
    for i, r in enumerate(valid):
        r["rank"] = i + 1

    return valid + errors
