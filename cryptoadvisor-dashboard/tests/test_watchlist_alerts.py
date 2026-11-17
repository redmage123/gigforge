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
