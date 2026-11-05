"""Ticker symbol -> CoinGecko coin id, for data that arrives as tickers (exchange CSV exports).

Trades, alerts and P&L key coins by CoinGecko id ("bitcoin"), which is what price lookups use.
Unknown tickers fall back to the lowercased symbol; their P&L shows no live price until mapped here.
"""

SYMBOL_TO_ID = {
    "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana", "ADA": "cardano", "DOT": "polkadot",
    "DOGE": "dogecoin", "AVAX": "avalanche-2", "LINK": "chainlink", "XRP": "ripple",
    "BNB": "binancecoin", "MATIC": "matic-network", "POL": "polygon-ecosystem-token",
    "LTC": "litecoin", "UNI": "uniswap", "ATOM": "cosmos", "NEAR": "near", "TRX": "tron",
    "SUI": "sui", "TON": "the-open-network", "SHIB": "shiba-inu", "PEPE": "pepe", "ARB": "arbitrum",
    "OP": "optimism", "APT": "aptos", "AAVE": "aave", "INJ": "injective-protocol", "TIA": "celestia",
    "SEI": "sei-network", "WIF": "dogwifcoin", "BONK": "bonk", "FET": "fetch-ai", "RNDR": "render-token",
    "RENDER": "render-token", "HBAR": "hedera-hashgraph", "XLM": "stellar", "ETC": "ethereum-classic",
    "BCH": "bitcoin-cash", "FIL": "filecoin", "ICP": "internet-computer", "ENA": "ethena",
}


def to_coin_id(symbol: str) -> str:
    s = (symbol or "").strip()
    return SYMBOL_TO_ID.get(s.upper(), s.lower())
