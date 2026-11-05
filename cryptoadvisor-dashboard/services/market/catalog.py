"""Curated instruments that no public listing file provides: futures, yields, indices.

Futures are Yahoo continuous front-month contracts ("GC=F"). `multiplier` is the dollar value of a
1.0 move in the quoted price, so P&L = (exit - entry) x quantity x multiplier. Grains, softs and
meats are quoted in US cents, which the multiplier accounts for.
"""

from services.market.models import Instrument, make_id

# (symbol, yahoo, name, exchange, multiplier, price_decimals, tags)
_COMMODITIES = [
    ("GC", "GC=F", "Gold", "COMEX", 100, 1, ("metals",)),
    ("SI", "SI=F", "Silver", "COMEX", 5000, 3, ("metals",)),
    ("HG", "HG=F", "Copper", "COMEX", 25000, 4, ("metals",)),
    ("PL", "PL=F", "Platinum", "NYMEX", 50, 1, ("metals",)),
    ("PA", "PA=F", "Palladium", "NYMEX", 100, 1, ("metals",)),
    ("CL", "CL=F", "Crude Oil WTI", "NYMEX", 1000, 2, ("energy",)),
    ("BZ", "BZ=F", "Brent Crude", "NYMEX", 1000, 2, ("energy",)),
    ("NG", "NG=F", "Natural Gas", "NYMEX", 10000, 3, ("energy",)),
    ("RB", "RB=F", "RBOB Gasoline", "NYMEX", 42000, 4, ("energy",)),
    ("HO", "HO=F", "Heating Oil", "NYMEX", 42000, 4, ("energy",)),
    ("ZC", "ZC=F", "Corn", "CBOT", 50, 2, ("grains",)),  # cents/bu x 5,000 bu
    ("ZW", "ZW=F", "Wheat", "CBOT", 50, 2, ("grains",)),
    ("ZS", "ZS=F", "Soybeans", "CBOT", 50, 2, ("grains",)),
    ("KC", "KC=F", "Coffee", "ICE", 375, 2, ("softs",)),  # cents/lb x 37,500 lb
    ("CC", "CC=F", "Cocoa", "ICE", 10, 0, ("softs",)),  # $/t x 10 t
    ("SB", "SB=F", "Sugar No. 11", "ICE", 1120, 2, ("softs",)),  # cents/lb x 112,000 lb
    ("CT", "CT=F", "Cotton", "ICE", 500, 2, ("softs",)),
    ("LE", "LE=F", "Live Cattle", "CME", 400, 3, ("meats",)),
    ("HE", "HE=F", "Lean Hogs", "CME", 400, 3, ("meats",)),
]

# Treasury futures: price in points of par
_BONDS = [
    ("ZT", "ZT=F", "2-Year T-Note", "CBOT", 2000, 4),
    ("ZF", "ZF=F", "5-Year T-Note", "CBOT", 1000, 4),
    ("ZN", "ZN=F", "10-Year T-Note", "CBOT", 1000, 4),
    ("ZB", "ZB=F", "30-Year T-Bond", "CBOT", 1000, 4),
    ("UB", "UB=F", "Ultra T-Bond", "CBOT", 1000, 4),
]

# Treasury yields in percent: reference only (no volume, not tradable)
_RATES = [
    ("US3M", "^IRX", "US 13-Week T-Bill Yield"),
    ("US5Y", "^FVX", "US 5-Year Treasury Yield"),
    ("US10Y", "^TNX", "US 10-Year Treasury Yield"),
    ("US30Y", "^TYX", "US 30-Year Treasury Yield"),
]

_INDICES = [
    ("SPX", "^GSPC", "S&P 500"),
    ("NDX", "^NDX", "Nasdaq-100"),
    ("DJI", "^DJI", "Dow Jones Industrial Average"),
    ("RUT", "^RUT", "Russell 2000"),
    ("VIX", "^VIX", "CBOE Volatility Index"),
    ("DXY", "DX-Y.NYB", "US Dollar Index"),
]

# Listed ETFs come from the Nasdaq Trader directory; these get category tags and rank first in search
ETF_TAGS = {
    **dict.fromkeys(["SPY", "VOO", "IVV", "VTI", "QQQ", "DIA", "IWM", "EFA", "EEM", "VEA", "VWO"], ("equity", "popular")),
    **dict.fromkeys(["XLE", "XLF", "XLK", "XLV", "XLI", "XLY", "XLP", "XLU", "XLB", "XLRE", "XLC", "SMH", "ARKK", "VNQ"],
                    ("sector", "popular")),
    **dict.fromkeys(["TLT", "IEF", "SHY", "AGG", "BND", "LQD", "HYG", "TIP", "GOVT", "MUB", "EMB", "JNK"], ("bonds", "popular")),
    **dict.fromkeys(["GLD", "IAU", "SLV", "USO", "UNG", "DBC", "PDBC", "GDX", "CPER", "DBA"], ("commodities", "popular")),
}

# Large, much-searched US stocks: rank first in search
POPULAR_STOCKS = set(
    "AAPL MSFT NVDA AMZN GOOGL GOOG META TSLA BRK.B JPM V UNH XOM JNJ WMT MA PG HD CVX MRK ABBV KO PEP AVGO "
    "COST LLY ORCL BAC ADBE CRM NFLX AMD INTC CSCO TMO ABT DIS WFC MCD QCOM TXN PLTR COIN MSTR HOOD UBER".split()
)


def curated() -> list[Instrument]:
    out = []
    for sym, yahoo, name, exch, mult, dec, tags in _COMMODITIES:
        out.append(Instrument(make_id("commodity", sym), "commodity", sym, name, {"yahoo": yahoo},
                              exchange=exch, sessions="futures", multiplier=mult, price_decimals=dec, tags=tags))
    for sym, yahoo, name, exch, mult, dec in _BONDS:
        out.append(Instrument(make_id("bond", sym), "bond", sym, name, {"yahoo": yahoo},
                              exchange=exch, sessions="futures", multiplier=mult, price_decimals=dec, tags=("treasury",)))
    for sym, yahoo, name in _RATES:
        out.append(Instrument(make_id("rate", sym), "rate", sym, name, {"yahoo": yahoo},
                              sessions="index", has_volume=False, price_decimals=3, tags=("treasury",)))
    for sym, yahoo, name in _INDICES:
        out.append(Instrument(make_id("index", sym), "index", sym, name, {"yahoo": yahoo},
                              sessions="index", has_volume=False, price_decimals=2))
    return out
