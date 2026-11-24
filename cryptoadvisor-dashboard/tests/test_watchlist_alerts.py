"""Watchlist migration and multi-asset alerts. Run with: pytest tests/test_watchlist_alerts.py -q (no network)"""

import asyncio
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest  # noqa: E402

from services import alerts, favorites  # noqa: E402
from services.market import registry  # noqa: E402
from services.market.models import Instrument, Quote  # noqa: E402


@pytest.fixture(autouse=True)
def setup():
    registry.load_for_tests([
        Instrument("crypto:BTC", "crypto", "BTC", "Bitcoin", {"binance": "BTCUSDT", "coingecko": "bitcoin"}),
        Instrument("crypto:ETH", "crypto", "ETH", "Ethereum", {"binance": "ETHUSDT", "coingecko": "ethereum"}),
        Instrument("stock:AAPL", "stock", "AAPL", "Apple Inc.", {"yahoo": "AAPL"}, sessions="us_equity"),
    ])
    store = {}
    load = lambda u, n: store.get((u, n), [])  # noqa: E731
    save = lambda u, n, d: store.__setitem__((u, n), d)  # noqa: E731
    with patch.object(favorites, "load_user_data", load), patch.object(favorites, "save_user_data", save), \
            patch.object(alerts, "load_user_data", load), patch.object(alerts, "save_user_data", save):
        yield store


class TestWatchlist:
    def test_new_user_gets_cross_asset_defaults(self, setup):
        assert favorites.get_favorites("u") == favorites.DEFAULT_FAVORITES
        assert setup[("u", "favorites")] == favorites.DEFAULT_FAVORITES

    def test_legacy_coingecko_ids_convert_and_dedupe(self, setup):
        setup[("u", "favorites")] = ["bitcoin", "ethereum", "crypto:BTC", {"coin_id": "solana"}, "no-such-coin"]
        assert favorites.get_favorites("u") == ["crypto:BTC", "crypto:ETH", "crypto:SOL"]  # SOL via the old table
        assert setup[("u", "favorites")] == ["crypto:BTC", "crypto:ETH", "crypto:SOL"]

    def test_add_remove_limit(self, setup):
        setup[("u", "favorites")] = ["stock:AAPL"]
        assert favorites.add_favorite("u", "crypto:BTC") == ["stock:AAPL", "crypto:BTC"]
        assert favorites.remove_favorite("u", "stock:AAPL") == ["crypto:BTC"]
        setup[("u", "favorites")] = [f"stock:S{i}" for i in range(favorites.MAX_FAVORITES)]
        with pytest.raises(ValueError):
            favorites.add_favorite("u", "crypto:BTC")

    def test_sentiment_gets_coingecko_ids_of_crypto_only(self):
        ids = favorites.favorite_coingecko_ids(["crypto:BTC", "stock:AAPL", "ethereum", "crypto:DOGE", {"coin_id": "crypto:ETH"}])
        assert ids == {"bitcoin", "ethereum", "dogecoin"}


class TestAlerts:
    def test_legacy_alert_normalizes(self):
        a = alerts.normalize_alert({"id": "1", "coin_id": "bitcoin", "direction": "above", "target_price": 1})
        assert a["instrument_id"] == a["coin_id"] == "crypto:BTC"

    def test_validation(self):
        with pytest.raises(ValueError):
            alerts.add_alert("u", "stock:AAPL", "sideways", 1)
        with pytest.raises(ValueError):
            alerts.add_alert("u", "stock:AAPL", "above", 0)

    def test_crossed(self):
        assert alerts.crossed({"direction": "above", "target_price": 100}, 100)
        assert not alerts.crossed({"direction": "above", "target_price": 100}, 99.9)
        assert alerts.crossed({"direction": "below", "target_price": 100}, 99)

    def test_checker_fires_once_and_ignores_stale_quotes(self, setup):
        from services import store as record_store
        record_store.put("alerts", "u", [])  # the checker finds users through the store
        alerts.add_alert("u", "stock:AAPL", "below", 300)
        alerts.add_alert("u", "crypto:BTC", "above", 70000)
        quotes = {"stock:AAPL": Quote("stock:AAPL", 290, -1, None, 0, "yahoo"),
                  "crypto:BTC": Quote("crypto:BTC", 80000, 1, None, 0, "binance", stale=True)}
        sent = []

        async def fake_quotes(ids):
            return quotes

        with patch.object(alerts.market, "quotes", fake_quotes), \
                patch.object(alerts, "add_notification", lambda *a, **k: sent.append(a)):
            asyncio.run(alerts.check_all_alerts())
            asyncio.run(alerts.check_all_alerts())
        stored = {a["instrument_id"]: a for a in setup[("u", "alerts")]}
        assert stored["stock:AAPL"]["active"] is False and stored["stock:AAPL"]["triggered_price"] == 290
        assert stored["crypto:BTC"]["active"] is True  # stale quote: not fired
        assert len(sent) == 1 and "Apple Inc." in sent[0][1]


class TestCandleAlerts:
    """Alerts with a time scale fire on candle closes, never on candles that closed before they existed."""

    def _run(self, setup, rows, now):
        from services import store as record_store
        record_store.put("alerts", "u", [])
        sent = []

        async def fake_candles(iid, tf, bars):
            return rows

        alerts._next_fetch.clear()
        with patch.object(alerts.market, "candles", fake_candles), patch.object(alerts.time, "time", lambda: now), \
                patch.object(alerts, "add_notification", lambda *a, **k: sent.append(a)):
            asyncio.run(alerts.check_all_alerts())
        return sent

    def _rows(self, closes, start=1_800_000_000, step=1800):
        from services.market.models import Candle
        return [Candle((start + i * step) * 1000, c, c, c, c, 1.0) for i, c in enumerate(closes)]

    def test_validation_of_time_scales_and_levels(self):
        with pytest.raises(ValueError, match="time scale"):
            alerts.add_alert("u", "crypto:BTC", "above", 1, metric="price", timeframe="7m")
        with pytest.raises(ValueError, match="candle time scale"):
            alerts.add_alert("u", "crypto:BTC", "above", 70, metric="rsi")
        with pytest.raises(ValueError, match="between 0 and 100"):
            alerts.add_alert("u", "crypto:BTC", "above", 170, metric="rsi", timeframe="1h")
        a = alerts.add_alert("u", "crypto:BTC", "above", 70, metric="rsi", timeframe="30m")
        assert alerts.describe(a) == "30-minute close: RSI (14) at or above 70"
        legacy = alerts.normalize_alert({"id": "1", "instrument_id": "crypto:BTC", "direction": "below", "target_price": 5})
        assert legacy["timeframe"] == "live" and legacy["metric"] == "price"

    def test_price_alert_fires_on_a_30_minute_close_after_creation(self, setup):
        start = 1_800_000_000
        with patch.object(alerts.time, "time", lambda: start + 99 * 1800 + 60):  # created inside candle 99
            alerts.add_alert("u", "crypto:BTC", "above", 105, timeframe="30m")
        closes = [100] * 98 + [110, 101, 106]   # candle 98 closed above *before* the alert existed
        # Candle 99 (101) has closed, candle 100 (106) is still forming: nothing fires
        assert self._run(setup, self._rows(closes), start + 100 * 1800 + 10) == []
        assert setup[("u", "alerts")][0]["active"] is True
        # Candle 100 closes at 106: fires, naming the time scale
        sent = self._run(setup, self._rows(closes + [100]), start + 101 * 1800 + 10)
        assert len(sent) == 1 and "30-minute candle closed at 106" in sent[0][2]
        a = setup[("u", "alerts")][0]
        assert a["active"] is False and a["triggered_price"] == 106

    def test_rsi_alert_on_hourly_closes(self, setup):
        start = 1_800_000_000
        with patch.object(alerts.time, "time", lambda: start):
            alerts.add_alert("u", "crypto:BTC", "above", 70, metric="rsi", timeframe="1h")
        closes = [100 + (i % 2) for i in range(100)] + [102, 104, 106, 108, 110]   # steady climb at the end
        sent = self._run(setup, self._rows(closes, start=start - 99 * 3600, step=3600), start + 6 * 3600 + 5)
        assert len(sent) == 1 and "RSI (14) closed at" in sent[0][2] and "1-hour" in sent[0][1]

    def test_daily_stock_candle_closes_with_the_session(self):
        open_t = 1_800_000_000
        assert alerts.expected_close(open_t, "1d", "us_equity") == open_t + 6.5 * 3600
        assert alerts.expected_close(open_t, "1d", "24/7") == open_t + 86400
        assert alerts.expected_close(open_t, "1w", "us_equity") == float("inf")   # complete when the next one starts
        assert alerts.expected_close(open_t, "30m", "us_equity") == open_t + 1800


class TestClientIp:
    def scope(self, peer, **headers):
        return {"client": (peer, 1234), "headers": [(k.replace("_", "-").encode(), v.encode()) for k, v in headers.items()]}

    def test_behind_our_proxy_uses_forwarded_headers(self):
        from middleware.client_ip import client_ip
        assert client_ip(self.scope("172.17.0.1", cf_connecting_ip="203.0.113.7", x_real_ip="162.158.1.1")) == "203.0.113.7"
        assert client_ip(self.scope("127.0.0.1", x_real_ip="198.51.100.4")) == "198.51.100.4"
        assert client_ip(self.scope("172.17.0.1", x_forwarded_for="198.51.100.9, 10.0.0.1")) == "198.51.100.9"

    def test_direct_public_clients_cannot_spoof(self):
        from middleware.client_ip import client_ip
        assert client_ip(self.scope("8.8.8.8", cf_connecting_ip="1.2.3.4", x_forwarded_for="1.2.3.4")) == "8.8.8.8"


class TestDeleteAccount:
    def test_removes_records_shared_rows_and_anonymizes_audit(self):
        from services import account, store, user_data
        for ns in ("trades", "alerts", "favorites", "in_play_rules", "theme"):
            store.put(ns, "alice", [])
            store.put(ns, "bob", [])
        store.put_blob("statements", "alice/p0123456789a/2026-10.pdf", b"%PDF-")
        (user_data.DATA_DIR / "memory" / "alice").mkdir(parents=True)
        store.put(store.SHARED, "users", [{"username": "alice"}, {"username": "bob"}])
        store.put(store.SHARED, "sessions", [{"username": "alice"}, {"username": "bob"}])
        store.put(store.SHARED, "telegram_config", {"alice": {"chat_id": 1}, "bob": {"chat_id": 2}})
        store.put(store.SHARED, "audit_log", [{"username": "alice", "action": "login"}])
        store.put(store.SHARED, "in_play_candidates", {"k": {"matched": {"alice": 1, "bob": 2}}})
        out = asyncio.run(account.delete_account("alice"))
        assert all(store.get(ns, "alice") is None and store.get(ns, "bob") == [] for ns in ("trades", "alerts", "theme"))
        assert store.get_blob("statements", "alice/p0123456789a/2026-10.pdf") is None
        assert not (user_data.DATA_DIR / "memory" / "alice").exists()
        assert store.get(store.SHARED, "users") == [{"username": "bob"}]
        assert store.get(store.SHARED, "sessions") == [{"username": "bob"}]
        assert list(store.get(store.SHARED, "telegram_config")) == ["bob"]
        assert store.get(store.SHARED, "audit_log")[0]["username"] == "deleted-user"
        assert store.get(store.SHARED, "in_play_candidates")["k"]["matched"] == {"bob": 2}
        assert out["files"] >= 5

    def test_rejects_path_tricks(self):
        from services import account
        with pytest.raises(ValueError):
            asyncio.run(account.delete_account("../etc"))


class TestHttps:
    def test_cloudflare_visitor_scheme_trusted_only_from_proxy(self):
        from middleware.client_ip import is_https
        s = lambda peer, v: {"client": (peer, 1), "headers": [(b"cf-visitor", v.encode())]}  # noqa: E731
        assert is_https(s("172.17.0.1", '{"scheme":"https"}'))
        assert not is_https(s("172.17.0.1", '{"scheme":"http"}'))
        assert not is_https(s("8.8.8.8", '{"scheme":"https"}'))
