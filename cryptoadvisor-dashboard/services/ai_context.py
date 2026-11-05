"""Shared context for AssetAdvisor's AI features: persona, cross-asset market snapshot, the user's real positions.

AI features used to read a shared markdown "portfolio" and crypto-only prices. They now get the
requesting user's positions from the trade journal and a market snapshot across asset classes.
"""

import logging
import time

import feedparser
import httpx

from services import market

logger = logging.getLogger(__name__)

PERSONA = (
    "AssetAdvisor covers US stocks, ETFs, commodity and Treasury futures, Treasury yields and crypto. "
    "Treat each asset class on its own terms: earnings, guidance and valuation for stocks; supply, demand "
    "and inventories for commodities; the Fed, inflation and growth for rates and bonds; adoption, flows and "
    "token supply for crypto. Futures positions are leveraged: note contract size when sizing matters."
)

# Label -> instrument for the daily briefing and trade suggestions
MARKET_SET = [
    ("S&P 500", "index:SPX"), ("Nasdaq-100", "index:NDX"), ("VIX", "index:VIX"),
    ("US 10-year yield (%)", "rate:US10Y"), ("US 3-month T-bill yield (%)", "rate:US3M"), ("US dollar index", "index:DXY"),
    ("Gold", "commodity:GC"), ("WTI crude oil", "commodity:CL"), ("Copper", "commodity:HG"),
    ("Bitcoin", "crypto:BTC"), ("Ethereum", "crypto:ETH"), ("Solana", "crypto:SOL"),
]
BUSINESS_NEWS = "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en"
_headlines_cache: tuple[float, list[dict]] = (0.0, [])


async def market_snapshot(extra_ids: list[str] | None = None) -> dict:
    """{label: {"usd", "usd_24h_change", "usd_24h_vol"}} — the shape the older prompt builders expect."""
    pairs = list(MARKET_SET) + [(i, i) for i in (extra_ids or [])]
    quotes = await market.quotes([iid for _, iid in pairs])
    out = {}
    for label, iid in pairs:
        q = quotes.get(iid)
        if q:
            out[label] = {"usd": q.price, "usd_24h_change": q.change_pct or 0.0, "usd_24h_vol": q.volume or 0.0}
    return out


async def holdings_for_ai(username: str) -> list[dict]:
    """The user's open positions in the field names the AI prompt builders read (Asset/coin/amount/value_usd)."""
    from services.trades import portfolio

    try:
        pf = await portfolio(username)
    except Exception as exc:  # noqa: BLE001 — AI features degrade to "no holdings", never error out
        logger.warning("holdings_for_ai(%s) failed: %s", username, exc)
        return []
    rows = []
    for p in pf.get("positions", []):
        label = f"{p['symbol']} ({p['name']}, {p['asset_class']}{', short' if p['side'] == 'short' else ''})"
        rows.append({
            "Asset": label, "coin": p["symbol"], "name": p["name"], "asset_class": p["asset_class"],
            "instrument_id": p["instrument_id"], "side": p["side"], "amount": p["quantity"],
            "value_usd": p.get("market_value") or 0.0, "Value": p.get("market_value") or 0.0,
            "avg_price": p["avg_price"], "cost_basis": p.get("cost_basis"), "price": p.get("price"),
            "unrealized_pnl": p.get("unrealized_pnl"), "realized_pnl": p.get("realized_pnl"),
        })
    return rows


async def market_headlines(limit: int = 8) -> list[dict]:
    """General business/markets headlines (cached 15 min), to sit next to the crypto news feeds."""
    global _headlines_cache
    at, items = _headlines_cache
    if items and time.time() - at < 900:
        return items[:limit]
    try:
        async with httpx.AsyncClient(timeout=15, headers={"User-Agent": "Mozilla/5.0 AssetAdvisor"}) as client:
            r = await client.get(BUSINESS_NEWS)
            r.raise_for_status()
        items = []
        for e in feedparser.parse(r.text).entries[:20]:
            src = e.get("source")
            items.append({"title": e.get("title", ""), "source": src.get("title", "Google News") if isinstance(src, dict) else "Google News",
                          "url": e.get("link", "")})
        _headlines_cache = (time.time(), items)
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("market headlines failed: %s", exc)
    return items[:limit]


async def quote_context(instrument_or_coin: str) -> tuple[str, dict]:
    """(display name, {"usd", "usd_24h_change"}) for an instrument id or a legacy CoinGecko id."""
    from services.market import registry

    await registry.ensure_loaded()
    iid = instrument_or_coin if ":" in instrument_or_coin else registry.from_coingecko_id(instrument_or_coin.lower())
    inst = registry.get(iid) if iid else None
    if not inst:
        return instrument_or_coin, {}
    q = (await market.quotes([inst.id])).get(inst.id)
    data = {"usd": q.price, "usd_24h_change": q.change_pct or 0.0, "usd_24h_vol": q.volume or 0.0} if q else {}
    return f"{inst.name} ({inst.symbol}, {inst.asset_class})", data
