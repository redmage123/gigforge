"""Per-user watchlist of instruments (any asset class).

Stored as a list of instrument ids ("stock:AAPL"). Older lists held CoinGecko ids ("bitcoin");
they are converted when read and saved back in the new form.
"""

from services import market
from services.market import registry
from services.market.models import make_id
from services.user_data import load_user_data, save_user_data

# New users start with one of each kind so the dashboard shows the app is multi-asset
DEFAULT_FAVORITES = ["crypto:BTC", "crypto:ETH", "index:SPX", "commodity:GC", "rate:US10Y"]
MAX_FAVORITES = 50
NAMESPACE = "favorites"


def to_instrument_id(value: str) -> str | None:
    """Instrument id for a stored or submitted value: an instrument id, or a legacy CoinGecko id."""
    if not value:
        return None
    if ":" in value:
        return value
    return registry.from_coingecko_id(value)


def _load(username: str) -> list[str]:
    data = load_user_data(username, NAMESPACE)
    if not data:
        save_user_data(username, NAMESPACE, DEFAULT_FAVORITES)
        return list(DEFAULT_FAVORITES)
    ids = []
    for v in data:
        raw = v.get("instrument_id") or v.get("coin_id") if isinstance(v, dict) else v
        iid = to_instrument_id(raw)
        if iid and iid not in ids:
            ids.append(iid)
    if ids != data:
        save_user_data(username, NAMESPACE, ids)
    return ids


def get_favorites(username: str) -> list[str]:
    return _load(username)


def add_favorite(username: str, instrument_id: str) -> list[str]:
    favorites = _load(username)
    if instrument_id in favorites:
        return favorites
    if len(favorites) >= MAX_FAVORITES:
        raise ValueError(f"Maximum of {MAX_FAVORITES} watchlist items reached")
    favorites.append(instrument_id)
    save_user_data(username, NAMESPACE, favorites)
    return favorites


def remove_favorite(username: str, instrument_id: str) -> list[str]:
    favorites = _load(username)
    if instrument_id in favorites:
        favorites.remove(instrument_id)
        save_user_data(username, NAMESPACE, favorites)
    return favorites


def set_favorites(username: str, ids: list[str]) -> list[str]:
    clean = []
    for v in ids:
        iid = to_instrument_id(v)
        if iid and iid not in clean:
            clean.append(iid)
    save_user_data(username, NAMESPACE, clean[:MAX_FAVORITES])
    return clean[:MAX_FAVORITES]


def is_favorite(username: str, instrument_id: str) -> bool:
    return instrument_id in _load(username)


def favorite_coingecko_ids(favs) -> set[str]:
    """CoinGecko ids of the crypto entries in a stored list (crypto news/sentiment is keyed by them)."""
    from services.coin_ids import SYMBOL_TO_ID

    out = set()
    for v in favs if isinstance(favs, list) else []:
        raw = v.get("instrument_id") or v.get("coin_id") if isinstance(v, dict) else v
        if not raw:
            continue
        if ":" not in raw:
            out.add(raw)  # legacy CoinGecko id
            continue
        cls, _, sym = raw.partition(":")
        if cls != "crypto":
            continue
        inst = registry.get(raw)
        cg = (inst.providers.get("coingecko") if inst else None) or SYMBOL_TO_ID.get(sym.upper())
        if cg:
            out.add(cg)
    return out


async def get_favorites_with_prices(username: str) -> list[dict]:
    """Watchlist rows: instrument details + live quote. Legacy fields kept for older pages."""
    await registry.ensure_loaded()
    favorites = _load(username)
    if not favorites:
        return []
    quotes = await market.quotes(favorites)
    rows = []
    for iid in favorites:
        inst = registry.get(iid)
        q = quotes.get(iid)
        cls, _, sym = iid.partition(":")
        rows.append({
            "instrument_id": iid, "coin_id": iid,
            "symbol": inst.symbol if inst else sym, "name": inst.name if inst else iid,
            "asset_class": inst.asset_class if inst else cls, "price_decimals": inst.price_decimals if inst else 2,
            "current_price": q.price if q else None, "price_change_24h": q.change_pct if q else None,
            "volume": q.volume if q else None, "delayed": bool(q and q.delayed), "market_cap": None,
        })
    return rows


def default_symbol_id(asset_class: str, symbol: str) -> str:
    return make_id(asset_class, symbol)
