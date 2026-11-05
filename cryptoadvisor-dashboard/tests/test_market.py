"""Unit tests for the market layer: instrument ids, listings parsing, search, candle building, provider routing.

Run with: pytest tests/test_market.py -q   (no network)
"""

import asyncio
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402

import services.market as market  # noqa: E402
from services.market import registry  # noqa: E402
from services.market.models import Candle, Instrument, Quote, make_id, split_id  # noqa: E402
from services.market.providers import (  # noqa: E402
    BINANCE_PERP, BINANCE_SPOT, YAHOO, aggregate_epoch, aggregate_sessions, parse_yahoo_chart,
)

H = 3600 * 1000
D = 86400 * 1000

NASDAQ = """Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares
AAPL|Apple Inc. - Common Stock|Q|N|N|100|N|N
QQQ|Invesco QQQ Trust, Series 1|G|N|N|100|Y|N
ZZZT|Test Issue Corp - Common Stock|Q|Y|N|100|N|N
ABCDW|Some Corp - Warrant|S|N|N|100|N|N
File Creation Time: 1105202610:01|||||||"""

OTHER = """ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol
BRK.B|Berkshire Hathaway Inc. Class B Common Stock|N|BRK.B|N|100|N|BRK=B
TLT|iShares 20+ Year Treasury Bond ETF|P|TLT|Y|100|N|TLT
ABC$A|ABC Corp Preferred|N|ABC$A|N|100|N|ABC-A
File Creation Time: 1105202610:01|||||||"""


def _listings():
    spot = {"symbols": [
        {"symbol": "BTCUSDT", "baseAsset": "BTC", "quoteAsset": "USDT", "status": "TRADING"},
        {"symbol": "ETHUSDT", "baseAsset": "ETH", "quoteAsset": "USDT", "status": "TRADING"},
        {"symbol": "USDCUSDT", "baseAsset": "USDC", "quoteAsset": "USDT", "status": "TRADING"},
        {"symbol": "BTCUPUSDT", "baseAsset": "BTCUP", "quoteAsset": "USDT", "status": "TRADING"},
        {"symbol": "ETHBTC", "baseAsset": "ETH", "quoteAsset": "BTC", "status": "TRADING"},
    ]}
    perp = {"symbols": [
        {"symbol": "BTCUSDT", "baseAsset": "BTC", "quoteAsset": "USDT", "status": "TRADING", "contractType": "PERPETUAL", "underlyingType": "COIN"},
        {"symbol": "1000PEPEUSDT", "baseAsset": "1000PEPE", "quoteAsset": "USDT", "status": "TRADING", "contractType": "PERPETUAL", "underlyingType": "COIN"},
        {"symbol": "BTCDOMUSDT", "baseAsset": "BTCDOM", "quoteAsset": "USDT", "status": "TRADING", "contractType": "PERPETUAL", "underlyingType": "INDEX"},
        {"symbol": "ETHUSDT_261225", "baseAsset": "ETH", "quoteAsset": "USDT", "status": "TRADING", "contractType": "CURRENT_QUARTER", "underlyingType": "COIN"},
    ]}
    spot["symbols"].append({"symbol": "NVDABUSDT", "baseAsset": "NVDAB", "quoteAsset": "USDT", "status": "TRADING"})
    cg = [{"id": "nvidia-bstocks", "symbol": "nvdab", "name": "NVIDIA (bStocks Tokenized)"},
          {"id": "bitcoin", "symbol": "btc", "name": "Bitcoin"}, {"id": "ethereum", "symbol": "eth", "name": "Ethereum"},
          {"id": "pepe", "symbol": "pepe", "name": "Pepe"}]
    spot["symbols"].append({"symbol": "AAPLBUSDT", "baseAsset": "AAPLB", "quoteAsset": "USDT", "status": "TRADING"})
    us = registry.parse_nasdaq_listed(NASDAQ) + registry.parse_other_listed(OTHER)
    crypto = registry.build_crypto(spot, perp, cg, frozenset(i.symbol for i in us))
    return crypto + us


@pytest.fixture(autouse=True)
def loaded():
    registry.load_for_tests(_listings())
    yield


class TestIds:
    def test_make_and_split(self):
        assert make_id("stock", "aapl") == "stock:AAPL"
        assert split_id("crypto:btc") == ("crypto", "BTC")
        assert split_id("fx:eurusd") == ("fx", "EURUSD")
        for bad in ("AAPL", "options:SPY", "stock:", ""):
            with pytest.raises(ValueError):
                split_id(bad)

    def test_instrument_roundtrip(self):
        i = registry.get("commodity:GC")
        assert Instrument.from_dict(i.to_dict()) == i


class TestListings:
    def test_us_listings(self):
        aapl, brk, tlt, qqq = (registry.get(x) for x in ("stock:AAPL", "stock:BRK.B", "etf:TLT", "etf:QQQ"))
        assert aapl.name == "Apple Inc." and aapl.exchange == "NASDAQ" and "popular" in aapl.tags
        assert brk.providers["yahoo"] == "BRK-B" and brk.exchange == "NYSE"
        assert tlt.exchange == "NYSE Arca" and "bonds" in tlt.tags
        assert qqq.asset_class == "etf" and qqq.sessions == "us_equity"

    def test_skips_tests_warrants_preferreds(self):
        assert registry.get("stock:ZZZT") is None and registry.get("stock:ABCDW") is None
        assert not [i for i in registry.all_instruments() if "$" in i.symbol]

    def test_crypto_merges_spot_and_perp(self):
        btc, eth, pepe = (registry.get(x) for x in ("crypto:BTC", "crypto:ETH", "crypto:1000PEPE"))
        assert btc.providers == {"binance": "BTCUSDT", "binance_perp": "BTCUSDT", "coingecko": "bitcoin"}
        assert "perp" in btc.tags and "perp" not in eth.tags
        assert pepe.providers == {"binance_perp": "1000PEPEUSDT"} and pepe.name == "Pepe x1000"

    def test_crypto_excludes_stables_leveraged_index_and_dated(self):
        for bad in ("crypto:USDC", "crypto:BTCUP", "crypto:BTCDOM", "crypto:NVDAB", "crypto:AAPLB"):
            assert registry.get(bad) is None
        assert registry.get("crypto:ETH").providers.get("binance_perp") is None

    def test_curated_futures_and_rates(self):
        gc, zn, tnx = registry.get("commodity:GC"), registry.get("bond:ZN"), registry.get("rate:US10Y")
        assert gc.providers["yahoo"] == "GC=F" and gc.multiplier == 100 and gc.sessions == "futures"
        assert zn.multiplier == 1000 and zn.tradable
        assert not tnx.has_volume and not tnx.tradable

    def test_legacy_coingecko_ids(self):
        assert registry.from_coingecko_id("bitcoin") == "crypto:BTC"
        assert registry.from_coingecko_id("avalanche-2") == "crypto:AVAX"  # via the old coin_ids table
        assert registry.from_coingecko_id("no-such-coin") is None


class TestSearch:
    def test_exact_symbol_first(self):
        assert registry.search("aapl")[0].id == "stock:AAPL"
        assert registry.search("gc")[0].id == "commodity:GC"
        assert registry.search("gold")[0].id == "commodity:GC"  # exact name beats partial matches

    def test_name_search_and_class_filter(self):
        assert [i.id for i in registry.search("gold")][:1] == ["commodity:GC"]
        assert all(i.asset_class == "etf" for i in registry.search("t", ["etf"]))
        assert registry.search("treasury", ["rate"])[0].asset_class == "rate"

    def test_tradable_only_hides_yields(self):
        assert not [i for i in registry.search("10-year", tradable_only=True) if i.asset_class == "rate"]

    def test_empty_query(self):
        assert registry.search("  ") == []


def _c(t, o, h, l, c, v=10):
    return Candle(t, o, h, l, c, v)


class TestCandles:
    def test_sessions_merge_within_a_day_and_fold_short_tails(self):
        # Two trading days of 7 hourly bars (13:30-19:30 UTC), 3h bars requested
        day1 = [_c(13 * H + i * H, 10 + i, 11 + i, 9 + i, 10.5 + i) for i in range(7)]
        day2 = [_c(D + 13 * H + i * H, 20 + i, 21 + i, 19 + i, 20.5 + i) for i in range(7)]
        bars = aggregate_sessions(day1 + day2, 3, 3600)
        # 7 = 3 + 4 (the lone last hour joins the second bar) per day
        assert len(bars) == 4
        assert bars[0].open_time == 13 * H and bars[1].quote_volume == 40 and bars[2].open_time == D + 13 * H

    def test_sessions_keep_a_half_bar_tail(self):
        bars = aggregate_sessions([_c(i * H, 1, 2, 0.5, 1.5) for i in range(5)], 3, 3600)  # 3 + 2
        assert [b.quote_volume for b in bars] == [30, 20]

    def test_epoch_drops_partial_head_keeps_forming_tail(self):
        hourly = [_c((i + 1) * H, 1, 2, 0.5, 1.5) for i in range(7)]  # hours 1..7
        bars = aggregate_epoch(hourly, 3, 3 * 3600)
        assert [b.open_time for b in bars] == [3 * H, 6 * H]

    def test_parse_yahoo_chart_skips_gaps_and_values_volume_in_usd(self):
        payload = {"chart": {"result": [{"meta": {"regularMarketPrice": 101.0}, "timestamp": [1, 2, 3],
                                          "indicators": {"quote": [{"open": [100, None, 102], "high": [101, None, 103],
                                                                    "low": [99, None, 101], "close": [100.5, None, 102.5],
                                                                    "volume": [1000, None, None]}]}}]}}
        meta, rows = parse_yahoo_chart(payload, multiplier=10)
        assert meta["regularMarketPrice"] == 101.0
        assert [r.open_time for r in rows] == [1000, 3000]
        assert rows[0].quote_volume == 1000 * 100.5 * 10 and rows[1].quote_volume == 0

    def test_parse_yahoo_error(self):
        with pytest.raises(RuntimeError, match="No data found"):
            parse_yahoo_chart({"chart": {"result": None, "error": {"description": "No data found"}}})


async def _noop():
    return None


class TestRouting:
    def test_provider_for(self):
        assert market.provider_for(registry.get("crypto:BTC")) is BINANCE_SPOT
        assert market.provider_for(registry.get("crypto:BTC"), prefer_perp=True) is BINANCE_PERP
        assert market.provider_for(registry.get("crypto:1000PEPE")) is BINANCE_PERP
        assert market.provider_for(registry.get("stock:AAPL")) is YAHOO
        assert market.provider_for(registry.get("rate:US10Y")) is YAHOO

    def test_quotes_group_by_provider_and_survive_one_outage(self):
        async def spot(insts):
            return {i.id: Quote(i.id, 1.0, 0.0, 1.0, 0.0, "binance") for i in insts}

        async def broken(insts):
            raise RuntimeError("yahoo down")

        with patch.object(BINANCE_SPOT, "quotes", spot), patch.object(YAHOO, "quotes", broken), \
                patch.object(registry, "ensure_loaded", new=_noop):
            got = asyncio.run(market.quotes(["crypto:BTC", "stock:AAPL", "crypto:BTC", "stock:NOPE"]))
        assert list(got) == ["crypto:BTC"]

    def test_candles_rejects_unknown_timeframe(self):
        with pytest.raises(ValueError):
            asyncio.run(market.candles("crypto:BTC", "4h"))
