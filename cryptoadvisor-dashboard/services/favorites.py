"""Per-user favorites/watchlist system."""

from services.user_data import load_user_data, save_user_data
from services.coingecko import get_prices

DEFAULT_FAVORITES = ["bitcoin", "ethereum", "solana", "cardano", "polkadot"]
MAX_FAVORITES = 50
NAMESPACE = "favorites"


def _load(username: str) -> list[str]:
    """Load favorites list, initializing with defaults for new users."""
    data = load_user_data(username, NAMESPACE)
    if not data:
        save_user_data(username, NAMESPACE, DEFAULT_FAVORITES)
        return list(DEFAULT_FAVORITES)
    return data


def get_favorites(username: str) -> list[str]:
    """Return the user's list of favorited coin IDs."""
    return _load(username)


def add_favorite(username: str, coin_id: str) -> list[str]:
    """Add a coin to favorites (max 50). Returns updated list."""
    favorites = _load(username)
    if coin_id in favorites:
        return favorites
    if len(favorites) >= MAX_FAVORITES:
        raise ValueError(f"Maximum of {MAX_FAVORITES} favorites reached")
    favorites.append(coin_id)
    save_user_data(username, NAMESPACE, favorites)
    return favorites


def remove_favorite(username: str, coin_id: str) -> list[str]:
    """Remove a coin from favorites. Returns updated list."""
    favorites = _load(username)
    if coin_id in favorites:
        favorites.remove(coin_id)
        save_user_data(username, NAMESPACE, favorites)
    return favorites


def is_favorite(username: str, coin_id: str) -> bool:
    """Check if a coin is in the user's favorites."""
    return coin_id in _load(username)


async def get_favorites_with_prices(username: str) -> list[dict]:
    """Fetch current prices from CoinGecko for all favorited coins."""
    favorites = _load(username)
    if not favorites:
        return []

    prices = await get_prices(tuple(favorites))

    result = []
    for coin_id in favorites:
        coin_data = prices.get(coin_id, {})
        result.append({
            "coin_id": coin_id,
            "current_price": coin_data.get("usd"),
            "price_change_24h": coin_data.get("usd_24h_change"),
            "market_cap": coin_data.get("usd_market_cap"),
        })
    return result
