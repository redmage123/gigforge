"""News for the AI briefing: crypto RSS fallback when Reddit refuses, and the briefing sees every price."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import ai_news_briefing, news  # noqa: E402

RSS = """<?xml version="1.0"?><rss><channel>
<item><title>Bitcoin holds 60K as ETF flows turn</title><link>https://example.test/a</link></item>
<item><title>Ether rally fades</title><link>https://example.test/b</link></item>
</channel></rss>"""


class _Resp:
    def __init__(self, status, text="", payload=None):
        self.status_code, self.text, self._payload = status, text, payload

    def json(self):
        return self._payload or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            import httpx
            raise httpx.HTTPStatusError("x", request=None, response=None)


class _Client:
    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url, **kw):
        if "reddit" in url:
            return _Resp(403)
        return _Resp(200, RSS)


def test_rss_fills_in_when_reddit_refuses(monkeypatch):
    monkeypatch.delenv("CRYPTOPANIC_API_KEY", raising=False)
    monkeypatch.setattr(news.httpx, "AsyncClient", _Client)
    monkeypatch.setattr(news, "_rss_cache", (0.0, []))
    got = asyncio.run(news.get_news(limit=3))
    assert [a["title"] for a in got] == ["Bitcoin holds 60K as ETF flows turn", "Ether rally fades"]
    assert got[0]["source"] in ("CoinDesk", "Cointelegraph") and got[0]["sentiment"] in ("bullish", "bearish", "neutral")


def test_briefing_prompt_includes_crypto_after_the_other_markets(monkeypatch):
    seen = {}

    async def fake_ask(prompt, *a, **k):
        seen["prompt"] = prompt
        return "ok"

    monkeypatch.setattr(ai_news_briefing, "ask_claude", fake_ask)
    prices = {f"Market {i}": {"usd": 1, "usd_24h_change": 0} for i in range(12)}
    prices["Bitcoin"] = {"usd": 60000, "usd_24h_change": -1.5}
    asyncio.run(ai_news_briefing.generate_daily_briefing(prices, [], {}))
    assert "Bitcoin" in seen["prompt"]
