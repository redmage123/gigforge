"""Market layer: instruments (what exists) and providers (where prices come from).

Features call `quotes()` and `candles()` with instrument ids; they never call a data API directly,
so a provider can be swapped (e.g. a licensed feed for Yahoo) without touching features.
"""

import logging

from services.market import registry
from services.market.models import Candle, Instrument, Quote, split_id  # noqa: F401
from services.market.providers import BINANCE_PERP, BINANCE_SPOT, TIMEFRAMES, YAHOO

logger = logging.getLogger(__name__)


def provider_for(inst: Instrument, prefer_perp: bool = False):
    """Crypto: Binance spot (or perpetual when preferred / perp-only). Everything else: Yahoo."""
    if inst.asset_class == "crypto":
        if prefer_perp and "binance_perp" in inst.providers:
            return BINANCE_PERP
        if "binance" in inst.providers:
            return BINANCE_SPOT
        if "binance_perp" in inst.providers:
            return BINANCE_PERP
        return None
    return YAHOO if "yahoo" in inst.providers else None


async def get_instrument(instrument_id: str) -> Instrument | None:
    await registry.ensure_loaded()
    return registry.get(instrument_id)


async def quotes(instrument_ids: list[str]) -> dict[str, Quote]:
    """Latest quote per id. Unknown ids and provider failures are simply absent from the result."""
    await registry.ensure_loaded()
    by_provider: dict = {}
    for iid in dict.fromkeys(instrument_ids):
        inst = registry.get(iid)
        prov = inst and provider_for(inst)
        if prov:
            by_provider.setdefault(prov, []).append(inst)
    out: dict[str, Quote] = {}
    for prov, insts in by_provider.items():
        try:
            out.update(await prov.quotes(insts))
        except Exception as exc:  # noqa: BLE001 — one provider down must not hide the others' quotes
            logger.warning("%s quotes failed: %s", prov.name, exc)
    return out


async def candles(instrument_id: str, timeframe: str = "1d", bars: int = 100, prefer_perp: bool = False) -> list[Candle]:
    if timeframe not in TIMEFRAMES:
        raise ValueError(f"timeframe must be one of {', '.join(TIMEFRAMES)}")
    inst = await get_instrument(instrument_id)
    prov = inst and provider_for(inst, prefer_perp)
    if not prov:
        raise LookupError(f"no market data for {instrument_id}")
    return await prov.candles(inst, timeframe, bars)


async def usd_per_unit(currencies) -> dict[str, float]:
    """USD value of one unit of each currency, from forex quotes (JPY via USD/JPY, GBP via GBP/USD)."""
    await registry.ensure_loaded()
    wanted = {c.upper() for c in currencies if c and c.upper() != "USD"}
    direct, inverse = {}, {}
    for ccy in wanted:
        if registry.get(f"fx:{ccy}USD"):
            direct[ccy] = f"fx:{ccy}USD"
        elif registry.get(f"fx:USD{ccy}"):
            inverse[ccy] = f"fx:USD{ccy}"
    got = await quotes(list(direct.values()) + list(inverse.values()))
    out = {"USD": 1.0}
    for ccy, iid in direct.items():
        if iid in got and got[iid].price:
            out[ccy] = got[iid].price
    for ccy, iid in inverse.items():
        if iid in got and got[iid].price:
            out[ccy] = 1 / got[iid].price
    return out
