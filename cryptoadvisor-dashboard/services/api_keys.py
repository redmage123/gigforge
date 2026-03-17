"""Per-user API key storage — encrypted at rest via Fernet.

Keys are stored per-user in data/api_keys/{username}.json, each value encrypted.
Only the masked version (last 4 chars) is ever returned to the frontend.
"""

from services.user_data import load_user_data, save_user_data
from services.crypto_utils import encrypt, decrypt

# Registry of supported integrations
INTEGRATIONS = [
    {
        "id": "coingecko",
        "name": "CoinGecko",
        "category": "market_data",
        "description": "Pro/Enterprise API key for higher rate limits",
        "url": "https://www.coingecko.com/en/api/pricing",
        "fields": [{"key": "api_key", "label": "API Key", "type": "password"}],
    },
    {
        "id": "openai",
        "name": "OpenAI",
        "category": "ai",
        "description": "GPT models for AI analysis features",
        "url": "https://platform.openai.com/api-keys",
        "fields": [{"key": "api_key", "label": "API Key", "type": "password"}],
    },
    {
        "id": "anthropic",
        "name": "Anthropic (Claude)",
        "category": "ai",
        "description": "Claude models for AI copilot and analysis",
        "url": "https://console.anthropic.com/settings/keys",
        "fields": [{"key": "api_key", "label": "API Key", "type": "password"}],
    },
    {
        "id": "google_ai",
        "name": "Google AI (Gemini)",
        "category": "ai",
        "description": "Gemini models for AI features",
        "url": "https://aistudio.google.com/app/apikey",
        "fields": [{"key": "api_key", "label": "API Key", "type": "password"}],
    },
    {
        "id": "etherscan",
        "name": "Etherscan",
        "category": "blockchain",
        "description": "Ethereum block explorer API for on-chain data",
        "url": "https://etherscan.io/myapikey",
        "fields": [{"key": "api_key", "label": "API Key", "type": "password"}],
    },
    {
        "id": "bscscan",
        "name": "BscScan",
        "category": "blockchain",
        "description": "BNB Chain block explorer API",
        "url": "https://bscscan.com/myapikey",
        "fields": [{"key": "api_key", "label": "API Key", "type": "password"}],
    },
    {
        "id": "polygonscan",
        "name": "PolygonScan",
        "category": "blockchain",
        "description": "Polygon block explorer API",
        "url": "https://polygonscan.com/myapikey",
        "fields": [{"key": "api_key", "label": "API Key", "type": "password"}],
    },
    {
        "id": "arbiscan",
        "name": "Arbiscan",
        "category": "blockchain",
        "description": "Arbitrum block explorer API",
        "url": "https://arbiscan.io/myapikey",
        "fields": [{"key": "api_key", "label": "API Key", "type": "password"}],
    },
    {
        "id": "infura",
        "name": "Infura",
        "category": "blockchain",
        "description": "Ethereum and multi-chain RPC provider",
        "url": "https://app.infura.io/dashboard",
        "fields": [
            {"key": "project_id", "label": "Project ID", "type": "text"},
            {"key": "api_secret", "label": "API Secret", "type": "password"},
        ],
    },
    {
        "id": "alchemy",
        "name": "Alchemy",
        "category": "blockchain",
        "description": "Multi-chain RPC and enhanced APIs",
        "url": "https://dashboard.alchemy.com/",
        "fields": [{"key": "api_key", "label": "API Key", "type": "password"}],
    },
    {
        "id": "stripe",
        "name": "Stripe",
        "category": "payments",
        "description": "Payment processing for subscriptions",
        "url": "https://dashboard.stripe.com/apikeys",
        "fields": [
            {"key": "publishable_key", "label": "Publishable Key", "type": "text"},
            {"key": "secret_key", "label": "Secret Key", "type": "password"},
        ],
    },
    {
        "id": "telegram",
        "name": "Telegram Bot",
        "category": "notifications",
        "description": "Telegram bot for alerts and notifications",
        "url": "https://t.me/BotFather",
        "fields": [
            {"key": "bot_token", "label": "Bot Token", "type": "password"},
            {"key": "chat_id", "label": "Chat ID", "type": "text"},
        ],
    },
    {
        "id": "coinmarketcap",
        "name": "CoinMarketCap",
        "category": "market_data",
        "description": "Alternative market data provider",
        "url": "https://pro.coinmarketcap.com/account",
        "fields": [{"key": "api_key", "label": "API Key", "type": "password"}],
    },
    {
        "id": "cryptocompare",
        "name": "CryptoCompare",
        "category": "market_data",
        "description": "Historical and real-time market data",
        "url": "https://www.cryptocompare.com/cryptopian/api-keys",
        "fields": [{"key": "api_key", "label": "API Key", "type": "password"}],
    },
    {
        "id": "moralis",
        "name": "Moralis",
        "category": "blockchain",
        "description": "Web3 APIs for NFTs, tokens, and DeFi data",
        "url": "https://admin.moralis.io/",
        "fields": [{"key": "api_key", "label": "API Key", "type": "password"}],
    },
]

CATEGORIES = {
    "ai": "AI Models",
    "market_data": "Market Data",
    "blockchain": "Blockchain & RPC",
    "payments": "Payments",
    "notifications": "Notifications",
}


def get_integrations() -> list[dict]:
    return INTEGRATIONS


def get_categories() -> dict:
    return CATEGORIES


def _mask(value: str) -> str:
    """Return masked version showing only last 4 chars."""
    if len(value) <= 4:
        return "****"
    return "*" * (len(value) - 4) + value[-4:]


def get_user_keys(username: str) -> dict:
    """Get all stored keys for a user (masked)."""
    raw = load_user_data(username, "api_keys")
    if not isinstance(raw, dict):
        return {}
    result = {}
    for integration_id, fields in raw.items():
        if isinstance(fields, dict):
            result[integration_id] = {}
            for field_key, enc_val in fields.items():
                try:
                    plain = decrypt(enc_val)
                    result[integration_id][field_key] = {
                        "set": True,
                        "masked": _mask(plain),
                    }
                except Exception:
                    result[integration_id][field_key] = {"set": False, "masked": ""}
    return result


def save_user_key(username: str, integration_id: str, fields: dict) -> None:
    """Save (encrypt) API key fields for an integration."""
    raw = load_user_data(username, "api_keys")
    if not isinstance(raw, dict):
        raw = {}
    encrypted_fields = {}
    for key, value in fields.items():
        if value:  # Only save non-empty values
            encrypted_fields[key] = encrypt(value)
    if encrypted_fields:
        raw[integration_id] = encrypted_fields
    save_user_data(username, "api_keys", raw)


def delete_user_key(username: str, integration_id: str) -> bool:
    """Remove all stored keys for an integration."""
    raw = load_user_data(username, "api_keys")
    if not isinstance(raw, dict) or integration_id not in raw:
        return False
    del raw[integration_id]
    save_user_data(username, "api_keys", raw)
    return True


def get_plaintext_key(username: str, integration_id: str, field_key: str) -> str | None:
    """Get a decrypted key value (for internal service use only)."""
    raw = load_user_data(username, "api_keys")
    if not isinstance(raw, dict):
        return None
    fields = raw.get(integration_id)
    if not isinstance(fields, dict):
        return None
    enc = fields.get(field_key)
    if not enc:
        return None
    try:
        return decrypt(enc)
    except Exception:
        return None
