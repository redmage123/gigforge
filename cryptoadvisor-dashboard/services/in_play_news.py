"""News catalyst lookup for in-play coins: headline search plus an optional Claude summary."""

import calendar
import logging
import os
import re
import time
from urllib.parse import quote_plus

import anthropic
import feedparser
import httpx

from services import claude_cli, news_scanner

logger = logging.getLogger(__name__)

# Articles from the day before the candle opened to two days after it
WINDOW_BEFORE_S = 86400
WINDOW_AFTER_S = 2 * 86400
AI_MODEL = os.getenv("CATALYST_AI_MODEL", "claude-opus-5-5")


_coin_names: dict[str, set[str]] = {}
_coin_names_at: float = 0

# Headlines that only describe the move itself are not a catalyst
_PRICE_ACTION = re.compile(
    r"\b(price|prices|surg\w*|jump\w*|soar\w*|rall\w*|rise[sn]?|rising|climb\w*|gain\w*|drop\w*|plung\w*|"
    r"tumbl\w*|slump\w*|sink\w*|crash\w*|dump\w*|pump\w*|spike\w*|skyrocket\w*|breakout|breaks? (out|above|below|higher|lower)|"
    r"technical|chart|analysis|prediction|forecast|momentum|bull run|bulls?|bears?|"
    r"overbought|oversold|support|resistance|whales?|shorts?|longs?|traders?)\b|\d+(\.\d+)?\s?%",
    re.IGNORECASE,
)
_CRYPTO_CONTEXT = re.compile(
    r"\b(crypto\w*|token\w*|coin\w*|blockchain|defi|binance|bybit|okx|coinbase|upbit|altcoin\w*|web3|"
    r"airdrop\w*|listing|delist\w*|mainnet|testnet|staking|protocol|dao|nft\w*|layer[- ]?[12]|on-chain)\b",
    re.IGNORECASE,
)


async def _refresh_coin_names(client: httpx.AsyncClient) -> None:
    """Ticker -> project names from Binance's asset list plus CoinGecko top 500 (refreshed daily)."""
    global _coin_names, _coin_names_at
    if time.time() - _coin_names_at < 86400:
        return
    names: dict[str, set[str]] = {}
    try:
        resp = await client.get("https://www.binance.com/bapi/asset/v2/public/asset/asset/get-all-asset")
        resp.raise_for_status()
        for a in resp.json().get("data", []):
            if a.get("assetName"):
                names.setdefault(a["assetCode"].upper(), set()).add(a["assetName"])
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        logger.warning("in_play: Binance asset names failed: %s", exc)
    try:
        for page in (1, 2):
            resp = await client.get(
                "https://api.coingecko.com/api/v3/coins/markets",
                params={"vs_currency": "usd", "order": "market_cap_desc", "per_page": 250, "page": page},
            )
            resp.raise_for_status()
            for c in resp.json():
                names.setdefault(c["symbol"].upper(), set()).add(c["name"])
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        logger.warning("in_play: CoinGecko names failed: %s", exc)
    if names:
        _coin_names, _coin_names_at = names, time.time()


def _name_variants(names: set[str]) -> tuple[set[str], set[str]]:
    """(full names, weaker variants). 'OriginToken' -> variant 'Origin'."""
    variants = set()
    for n in names:
        stripped = re.sub(r"\s*(Token|Coin|Protocol|Network)$", "", re.sub(r"(?<=[a-z])(?=[A-Z])", " ", n)).strip()
        if len(stripped) >= 4 and stripped not in names:
            variants.add(stripped)
    return names, variants


def headline_matches(text: str, base: str, names: set[str], variants: set[str]) -> bool:
    """A full project name matches outright; tickers and weaker name variants need crypto context."""
    if any(re.search(rf"\b{re.escape(n)}\b", text, re.IGNORECASE) for n in names):
        return True
    if re.search(rf"\${re.escape(base)}\b", text):
        return True
    weak = any(re.search(rf"\b{re.escape(v)}\b", text, re.IGNORECASE) for v in variants)
    ticker = len(base) >= 3 and re.search(rf"(?<![A-Za-z0-9]){re.escape(base)}(?![A-Za-z0-9])", text)
    return bool((weak or ticker) and _CRYPTO_CONTEXT.search(text))


# Event words that make a headline a catalyst even when it also reports the price move
_CATALYST_HINT = re.compile(
    r"\b(list(s|ed|ing)|delist\w*|partner\w*|joins?|integrat\w*|acquir\w*|acquisition|merger|launch\w*|"
    r"announc\w*|hack\w*|exploit\w*|breach|unlock\w*|airdrop\w*|burn\w*|buyback|upgrade|hard ?fork|mainnet|"
    r"proposal|vote|governance|etf|sec|lawsuit|sued|court|settle\w*|regulat\w*|ban(s|ned)?|approv\w*|"
    r"treasury|funding|raises|invest\w*|whitepaper|roadmap|rebrand\w*|migration|halt\w*|suspend\w*|outage)\b",
    re.IGNORECASE,
)
# Price pages / converters / presale spam that Google News sometimes returns
_JUNK = re.compile(
    r"\b(convert|to usd|price today|live price|price chart|presale|price analysis|price prediction|"
    r"next crypto|best crypto|cryptos? to (buy|watch)|top \d+ (crypto|altcoin|coin)s?|could (explode|10x|100x))\b",
    re.IGNORECASE,
)


def is_price_action(title: str) -> bool:
    return bool(_PRICE_ACTION.search(title)) and not _CATALYST_HINT.search(title)


async def find_catalyst(client: httpx.AsyncClient, base: str, candle_date: str) -> dict:
    """Look for news explaining a move on the daily candle opening `candle_date` (YYYY-MM-DD, UTC).

    Searches the app's news feeds and Google News around that day. Headlines that merely
    report the price move are kept but labelled `price_action`; `found` is only true when
    at least one headline looks like an actual catalyst. When an Anthropic API key is
    configured, Claude then reads the headlines and writes a short explanation
    (`ai_summary`), and its verdict on whether there is a real catalyst replaces `found`.
    """
    await _refresh_coin_names(client)
    names, variants = _name_variants(_coin_names.get(base, set()))
    day_start = calendar.timegm(time.strptime(candle_date, "%Y-%m-%d"))
    lo, hi = day_start - WINDOW_BEFORE_S, day_start + WINDOW_AFTER_S
    headlines: list[dict] = []

    for a in news_scanner.get_articles(limit=500):
        if lo <= a.get("published_ts", 0) <= hi and headline_matches(f"{a.get('title', '')} {a.get('summary', '')}", base, names, variants):
            headlines.append({"title": a["title"], "source": a.get("source", ""), "url": a.get("url", ""), "published_ts": a.get("published_ts")})

    terms = [f'"{n}"' for n in sorted(names)] + ([f'"{base}"'] if len(base) >= 3 else [])
    if terms:
        after = time.strftime("%Y-%m-%d", time.gmtime(lo))
        before = time.strftime("%Y-%m-%d", time.gmtime(hi + 86400))  # Google's before: is exclusive
        query = f"({' OR '.join(terms)}) crypto after:{after} before:{before}"
        try:
            resp = await client.get(
                f"https://news.google.com/rss/search?q={quote_plus(query)}&hl=en-US&gl=US&ceid=US:en",
                headers={"User-Agent": "Mozilla/5.0 CryptoAdvisor"},
            )
            if resp.status_code == 200:
                for e in feedparser.parse(resp.text).entries[:25]:
                    src = e.get("source")
                    source = src.get("title", "Google News") if isinstance(src, dict) else "Google News"
                    # Google News titles end with " - Publisher"; drop it before matching/classifying
                    title = re.sub(rf"\s+-\s+{re.escape(source)}$", "", e.get("title", ""))
                    published = calendar.timegm(e.published_parsed) if e.get("published_parsed") else None
                    if headline_matches(title, base, names, variants):
                        headlines.append({"title": title, "source": source, "url": e.get("link", ""), "published_ts": published})
        except httpx.HTTPError as exc:
            logger.warning("in_play: Google News lookup failed for %s: %s", base, exc)

    seen: set[str] = set()
    unique = []
    for h in headlines:
        key = h["title"].lower()[:80]
        if key not in seen and not _JUNK.search(h["title"]):
            seen.add(key)
            unique.append({**h, "kind": "price_action" if is_price_action(h["title"]) else "catalyst"})
    unique.sort(key=lambda h: h["kind"] != "catalyst")  # catalysts first, order otherwise preserved

    return {
        "found": any(h["kind"] == "catalyst" for h in unique),
        "coin_name": sorted(names, key=len)[0] if names else None,
        "headlines": unique[:8],
        "checked": f"Google News + {len(news_scanner.RSS_FEEDS)} crypto feeds, Reddit, CryptoPanic ({after} to {time.strftime('%Y-%m-%d', time.gmtime(hi))})"
        if terms else f"{len(news_scanner.RSS_FEEDS)} crypto feeds, Reddit, CryptoPanic",
        "checked_at": time.time(),
    }


# ── AI summary ──────────────────────────────────────────────────────────────

NO_CATALYST = "NO_CATALYST"

_SYSTEM = (
    "You explain sudden crypto price moves to a trader. You get one coin's daily-candle move and the news "
    "headlines published around that day. Decide whether any headline describes an actual cause (listing, "
    "delisting, partnership, hack, token unlock, governance vote, regulation, product launch, funding, etc.). "
    "Headlines that only describe the price move itself, technical analysis or predictions are not causes. "
    "If no headline describes a cause, reply with exactly NO_CATALYST and nothing else. Otherwise reply with "
    "one or two plain sentences (no markdown, under 60 words) naming the catalyst and how it relates to the move. "
    "Only use facts stated in the headlines."
)


def ai_enabled() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_CODE_OAUTH_TOKEN"))


def _apply_verdict(catalyst: dict, text: str) -> dict:
    text = text.strip()
    if not text:
        return catalyst
    if text.startswith(NO_CATALYST):
        return {**catalyst, "found": False, "ai_summary": None, "ai_verdict": "none"}
    return {**catalyst, "found": True, "ai_summary": text, "ai_verdict": "catalyst"}


async def _summarize_via_cli(entry: dict, prompt: str) -> str | None:
    result = await claude_cli.run_claude(prompt, system=_SYSTEM)
    if not result.ok:
        logger.warning("in_play: Claude CLI summary failed for %s: %s", entry["base"], result.text)
        return None
    return result.text


async def _summarize_via_api(entry: dict, prompt: str) -> str | None:
    try:
        client = anthropic.AsyncAnthropic(timeout=60.0)
        response = await client.beta.messages.create(
            model=AI_MODEL,
            max_tokens=2000,
            system=_SYSTEM,
            output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.AuthenticationError:
        logger.warning("in_play: Anthropic API key rejected; skipping AI summaries")
        return None
    except anthropic.APIError as exc:
        logger.warning("in_play: AI summary failed for %s: %s", entry["base"], exc)
        return None
    if response.stop_reason == "refusal":
        return None
    return " ".join(b.text for b in response.content if b.type == "text")


async def summarize_catalyst(entry: dict, catalyst: dict) -> dict:
    """Add `ai_summary` (and Claude's catalyst verdict) to `catalyst`. Unchanged if AI is off or fails."""
    if not ai_enabled() or not catalyst["headlines"]:
        return catalyst
    listing = "\n".join(
        f"- {h['title']} ({h['source']}, {time.strftime('%Y-%m-%d', time.gmtime(h['published_ts'])) if h.get('published_ts') else 'date unknown'})"
        for h in catalyst["headlines"]
    )
    name = catalyst.get("coin_name") or entry["base"]
    prompt = (
        f"Coin: {name} ({entry['base']})\n"
        f"Daily candle {entry['candle_date']}: {entry['direction']} {entry['change_pct']:+.1f}%, "
        f"volume {entry['volume_ratio']:.1f}x and range {entry['range_ratio']:.1f}x the 60-day average.\n\n"
        f"Headlines:\n{listing}"
    )
    # Prefer the Claude CLI (subscription token); use the API directly only with an API key alone
    if os.getenv("CLAUDE_CODE_OAUTH_TOKEN"):
        text = await _summarize_via_cli(entry, prompt)
    else:
        text = await _summarize_via_api(entry, prompt)
    return _apply_verdict(catalyst, text) if text else catalyst
