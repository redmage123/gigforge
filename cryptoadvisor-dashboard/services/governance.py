"""Token governance tracker using Snapshot GraphQL API."""

import httpx
from cachetools import TTLCache

_cache = TTLCache(maxsize=64, ttl=300)
_TIMEOUT = 15.0

SNAPSHOT_GRAPHQL_URL = "https://hub.snapshot.org/graphql"

# Token → Snapshot space mapping
TOKEN_SPACE_MAP: dict[str, str] = {
    "ETH": "ens.eth",
    "UNI": "uniswap",
    "AAVE": "aave.eth",
    "ENS": "ens.eth",
    "COMP": "comp-vote.eth",
    "CRV": "curve.eth",
    "MKR": "makerdao.eth",
    "LDO": "lido-snapshot.eth",
    "ARB": "arbitrumfoundation.eth",
    "OP": "opcollective.eth",
    "SAFE": "safe.eth",
    "GNO": "gnosis.eth",
    "BAL": "balancer.eth",
    "SUSHI": "sushigov.eth",
    "1INCH": "1inch.eth",
    "SNX": "snxgov.eth",
    "YFI": "ybaby.eth",
    "DYDX": "dydxgov.eth",
    "HOP": "hop.eth",
    "GTC": "gitcoindao.eth",
    "APE": "apecoin.eth",
    "CAKE": "cakevote.eth",
    "FXS": "frax.eth",
    "RPL": "rocketpool-dao.eth",
    "GMX": "gmx.eth",
    "PENDLE": "pendle-finance.eth",
    "RDNT": "radiantcapital.eth",
}

PROPOSALS_QUERY = """
query Proposals($space: String!, $first: Int!, $state: String!) {
  proposals(
    where: { space: $space, state: $state }
    orderBy: "created"
    orderDirection: desc
    first: $first
  ) {
    id
    title
    body
    state
    start
    end
    choices
    scores
    scores_total
    author
    space {
      id
      name
    }
    link
  }
}
"""


async def get_snapshot_proposals(space: str, state: str = "active", limit: int = 10) -> list[dict]:
    """Fetch proposals from Snapshot GraphQL API for a given space."""
    cache_key = f"snapshot_{space}_{state}_{limit}"
    if cache_key in _cache:
        return _cache[cache_key]

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                SNAPSHOT_GRAPHQL_URL,
                json={
                    "query": PROPOSALS_QUERY,
                    "variables": {"space": space, "first": limit, "state": state},
                },
            )
            resp.raise_for_status()
            data = resp.json()

        proposals_raw = data.get("data", {}).get("proposals", [])
        proposals = []
        for p in proposals_raw:
            # Determine winning choice
            scores = p.get("scores", [])
            choices = p.get("choices", [])
            winning_idx = scores.index(max(scores)) if scores else -1
            winning_choice = choices[winning_idx] if 0 <= winning_idx < len(choices) else None

            proposals.append({
                "space": p.get("space", {}).get("id", space),
                "space_name": p.get("space", {}).get("name", space),
                "title": p.get("title", ""),
                "state": p.get("state", ""),
                "start": p.get("start"),
                "end": p.get("end"),
                "choices": choices,
                "scores": [round(s, 2) for s in scores],
                "scores_total": round(p.get("scores_total", 0), 2),
                "leading_choice": winning_choice,
                "author": p.get("author", ""),
                "link": p.get("link") or f"https://snapshot.org/#/{space}/proposal/{p.get('id', '')}",
            })

        _cache[cache_key] = proposals
        return proposals

    except Exception as e:
        return [{"error": f"Failed to fetch proposals for {space}: {e}"}]


async def get_governance_for_tokens(tokens: list[str]) -> list[dict]:
    """Get active governance proposals for a list of tokens."""
    all_proposals: list[dict] = []

    for token in tokens:
        token_upper = token.upper()
        space = TOKEN_SPACE_MAP.get(token_upper)
        if not space:
            all_proposals.append({
                "token": token_upper,
                "space": None,
                "error": f"No Snapshot space mapped for {token_upper}",
            })
            continue

        proposals = await get_snapshot_proposals(space, state="active")

        if proposals and "error" in proposals[0]:
            all_proposals.append({"token": token_upper, "space": space, **proposals[0]})
            continue

        for p in proposals:
            p["token"] = token_upper

        all_proposals.extend(proposals)

    return all_proposals
