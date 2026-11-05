"""Core market types shared by every asset class: Instrument, Quote, Candle."""

from dataclasses import dataclass, field
from typing import Literal

AssetClass = Literal["crypto", "stock", "etf", "commodity", "bond", "fx", "rate", "index"]
ASSET_CLASSES: tuple[str, ...] = ("crypto", "stock", "etf", "commodity", "bond", "fx", "rate", "index")
# Classes a user can hold a position in (rates and indices are reference series)
TRADABLE_CLASSES: tuple[str, ...] = ("crypto", "stock", "etf", "commodity", "bond", "fx")

# Trading-hours regimes: decide what a "candle" covers and when alerts may fire
Sessions = Literal["24/7", "us_equity", "futures", "fx", "index"]


@dataclass(frozen=True)
class Instrument:
    """One tradable or reference series, identified as "<asset_class>:<symbol>" (e.g. stock:AAPL)."""

    id: str
    asset_class: str
    symbol: str
    name: str
    providers: dict = field(default_factory=dict)  # provider -> its symbol, e.g. {"yahoo": "GC=F"}
    currency: str = "USD"  # currency prices are quoted in (forex: the pair's quote currency, e.g. JPY)
    exchange: str = ""
    sessions: str = "24/7"
    has_volume: bool = True  # yields and indices have none: volume rules don't apply
    multiplier: float = 1.0  # contract size for futures P&L ($ per 1.0 of price); 1 for spot assets
    price_decimals: int = 2
    tags: tuple = ()  # e.g. ("bonds",) for bond ETFs, ("sp500",) for index members, ("popular",)

    @property
    def tradable(self) -> bool:
        return self.asset_class in TRADABLE_CLASSES

    def to_dict(self) -> dict:
        return {
            "id": self.id, "asset_class": self.asset_class, "symbol": self.symbol, "name": self.name,
            "currency": self.currency, "exchange": self.exchange, "sessions": self.sessions,
            "has_volume": self.has_volume, "multiplier": self.multiplier, "price_decimals": self.price_decimals,
            "tags": list(self.tags), "tradable": self.tradable, "providers": dict(self.providers),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Instrument":
        return cls(
            id=d["id"], asset_class=d["asset_class"], symbol=d["symbol"], name=d.get("name") or d["symbol"],
            providers=dict(d.get("providers") or {}), currency=d.get("currency", "USD"),
            exchange=d.get("exchange", ""), sessions=d.get("sessions", "24/7"),
            has_volume=d.get("has_volume", True), multiplier=float(d.get("multiplier", 1.0)),
            price_decimals=int(d.get("price_decimals", 2)), tags=tuple(d.get("tags") or ()),
        )


def make_id(asset_class: str, symbol: str) -> str:
    return f"{asset_class}:{symbol.upper()}"


def split_id(instrument_id: str) -> tuple[str, str]:
    """"stock:aapl" -> ("stock", "AAPL"). Raises ValueError on a malformed id."""
    asset_class, sep, symbol = (instrument_id or "").partition(":")
    if not sep or asset_class not in ASSET_CLASSES or not symbol:
        raise ValueError(f"not an instrument id: {instrument_id!r}")
    return asset_class, symbol.upper()


@dataclass(frozen=True)
class Quote:
    instrument_id: str
    price: float
    change_pct: float | None  # vs previous close / 24h ago
    volume: float | None  # quote-currency volume over the last session / 24h (None if not applicable)
    as_of: float  # epoch seconds of the price
    source: str
    delayed: bool = False  # Yahoo stock/futures data is typically ~15 min delayed
    stale: bool = False  # served from cache after the provider failed

    def to_dict(self) -> dict:
        return {
            "id": self.instrument_id, "price": self.price, "change_pct": self.change_pct, "volume": self.volume,
            "as_of": self.as_of, "source": self.source, "delayed": self.delayed, "stale": self.stale,
        }


@dataclass(frozen=True)
class Candle:
    open_time: int  # ms
    open: float
    high: float
    low: float
    close: float
    quote_volume: float  # volume in the quote currency (USD); shares x price for stocks

    @classmethod
    def from_kline(cls, k: list) -> "Candle":
        """Binance kline row."""
        return cls(int(k[0]), float(k[1]), float(k[2]), float(k[3]), float(k[4]), float(k[7]))

    @property
    def range(self) -> float:
        return self.high - self.low

    def to_dict(self) -> dict:
        return {"t": self.open_time, "o": self.open, "h": self.high, "l": self.low, "c": self.close, "v": self.quote_volume}
