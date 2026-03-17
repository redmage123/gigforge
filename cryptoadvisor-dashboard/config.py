"""Central configuration for CryptoAdvisor Dashboard."""

import os
from pathlib import Path

# Base directory
BASE_DIR = Path(__file__).parent

# EVM chains with public RPC endpoints
EVM_CHAINS = {
    "ethereum": {"rpc": "https://eth.llamarpc.com", "chain_id": 1, "symbol": "ETH"},
    "bsc": {"rpc": "https://bsc-dataseed1.binance.org", "chain_id": 56, "symbol": "BNB"},
    "polygon": {"rpc": "https://polygon-rpc.com", "chain_id": 137, "symbol": "MATIC"},
    "arbitrum": {"rpc": "https://arb1.arbitrum.io/rpc", "chain_id": 42161, "symbol": "ETH"},
    "optimism": {"rpc": "https://mainnet.optimism.io", "chain_id": 10, "symbol": "ETH"},
    "avalanche": {"rpc": "https://api.avax.network/ext/bc/C/rpc", "chain_id": 43114, "symbol": "AVAX"},
    "base": {"rpc": "https://mainnet.base.org", "chain_id": 8453, "symbol": "ETH"},
}

# Solana
SOLANA_RPC = "https://api.mainnet-beta.solana.com"

# Bitcoin (Blockstream)
BITCOIN_API = "https://blockstream.info/api"

# CoinGecko (free tier)
COINGECKO_API = "https://api.coingecko.com/api/v3"

# Cache TTLs (seconds)
CACHE_TTL_PRICES = 60
CACHE_TTL_GLOBAL = 300
CACHE_TTL_OHLCV = 300
CACHE_TTL_BLOCKCHAIN = 30
CACHE_TTL_FEARGREED = 3600

# Default coins to track
DEFAULT_COINS = ["bitcoin", "ethereum", "solana", "cardano", "polkadot"]

# Color palette for charts
COLORS = {
    "primary": "#00d4aa",
    "secondary": "#7b61ff",
    "accent": "#ff6b6b",
    "warning": "#ffd93d",
    "info": "#4ecdc4",
    "bg": "#0a0e1a",
    "card": "#111827",
    "text": "#e2e8f0",
    "muted": "#64748b",
}

# Data directory (users, secrets, wallet configs)
DATA_DIR = BASE_DIR / "data"

# JWT settings
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "24"))

# Etherscan-compatible block explorer APIs
ETHERSCAN_APIS = {
    "ethereum": "https://api.etherscan.io/api",
    "bsc": "https://api.bscscan.com/api",
    "polygon": "https://api.polygonscan.com/api",
    "arbitrum": "https://api.arbiscan.io/api",
    "optimism": "https://api-optimistic.etherscan.io/api",
    "avalanche": "https://api.snowtrace.io/api",
    "base": "https://api.basescan.org/api",
}

# Agent memory directory
MEMORY_DIR = os.getenv("MEMORY_DIR", str(BASE_DIR / ".." / ".." / "memory"))
