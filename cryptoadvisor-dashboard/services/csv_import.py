"""CSV trade import — parse Binance, Coinbase, and Kraken trade history files."""

import csv
import io
import json
from datetime import datetime
from pathlib import Path

import re
import time
import uuid

from services.coin_ids import to_coin_id
from services.trades import get_trades
from services.user_data import save_user_data

_NUM = re.compile(r"-?\d+(?:\.\d+)?(?:[eE]-?\d+)?")


def _num(value) -> float:
    """Leading number of an exchange CSV cell: "0.5ETH", "1,200.50 USDT", "0.001 BNB"."""
    m = _NUM.search(str(value or "").replace(",", ""))
    if not m:
        raise ValueError(f"no number in {value!r}")
    return float(m.group(0))


def _normalize_trade(
    coin: str,
    trade_type: str,
    amount: float,
    price: float,
    total: float,
    fee: float,
    date: str,
    source: str,
) -> dict:
    """Return a trade in the trade journal's schema (services.trades.add_trade)."""
    return {
        "coin_id": to_coin_id(coin),
        "symbol": coin.upper(),
        "side": trade_type.lower(),
        "quantity": amount,
        "price": price,
        "total": total,
        "fee": fee,
        "date": date,
        "source": source,
    }


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

async def parse_binance_csv(content: bytes) -> list[dict]:
    """Parse Binance trade history CSV.

    Expected columns: Date(UTC), Pair, Side, Price, Executed, Amount, Fee
    """
    trades: list[dict] = []
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    for row in reader:
        try:
            pair = row.get("Pair", "")
            # Binance pairs like BTCUSDT — split the quote asset (simple heuristic)
            coin = pair
            for quote in ("USDT", "BUSD", "USDC", "BTC", "ETH", "BNB"):
                if pair.endswith(quote):
                    coin = pair[: -len(quote)]
                    break

            side = row.get("Side", "").lower()
            price = _num(row.get("Price", "0"))
            executed = _num(row.get("Executed", "0").replace(",", ""))
            amount = _num(row.get("Amount", "0").replace(",", ""))
            fee = _num(row.get("Fee", "0").replace(",", "").split(" ")[0])  # "0.001 BNB" -> 0.001
            date_str = row.get("Date(UTC)", "")

            trades.append(_normalize_trade(
                coin=coin,
                trade_type=side,
                amount=executed,
                price=price,
                total=amount,
                fee=fee,
                date=date_str,
                source="binance",
            ))
        except (ValueError, KeyError, IndexError):
            continue

    return trades


async def parse_coinbase_csv(content: bytes) -> list[dict]:
    """Parse Coinbase trade history CSV.

    Expected columns: Timestamp, Transaction Type, Asset, Quantity Transacted,
    Spot Price at Transaction, Subtotal, Total, Fees
    """
    trades: list[dict] = []
    text = content.decode("utf-8-sig")

    # Coinbase CSVs sometimes have header rows before the actual CSV
    lines = text.splitlines()
    csv_start = 0
    for i, line in enumerate(lines):
        if line.startswith("Timestamp"):
            csv_start = i
            break

    reader = csv.DictReader(io.StringIO("\n".join(lines[csv_start:])))

    for row in reader:
        try:
            tx_type = row.get("Transaction Type", "").strip().lower()
            if tx_type not in ("buy", "sell"):
                continue

            coin = row.get("Asset", "").strip()
            quantity = _num(row.get("Quantity Transacted", "0").replace(",", ""))
            spot_price = _num(row.get("Spot Price at Transaction", "0").replace(",", ""))
            total = _num(row.get("Total (inclusive of fees and/or spread)", row.get("Total", "0")).replace(",", ""))
            fees = _num(row.get("Fees and/or Spread", row.get("Fees", "0")).replace(",", ""))
            date_str = row.get("Timestamp", "")

            trades.append(_normalize_trade(
                coin=coin,
                trade_type=tx_type,
                amount=quantity,
                price=spot_price,
                total=total,
                fee=fees,
                date=date_str,
                source="coinbase",
            ))
        except (ValueError, KeyError, IndexError):
            continue

    return trades


async def parse_kraken_csv(content: bytes) -> list[dict]:
    """Parse Kraken trade history CSV.

    Expected columns: txid, ordertxid, pair, time, type, ordertype, price, cost, fee, vol
    """
    trades: list[dict] = []
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    for row in reader:
        try:
            pair = row.get("pair", "")
            # Kraken pairs like XXBTZUSD — strip X/Z prefixes for common assets
            coin = pair
            for quote in ("ZUSD", "USD", "ZEUR", "EUR", "XBT"):
                if pair.endswith(quote):
                    coin = pair[: -len(quote)]
                    break
            coin = coin.lstrip("X").lstrip("Z") or coin

            trade_type = row.get("type", "").lower()
            price = _num(row.get("price", "0"))
            cost = _num(row.get("cost", "0"))
            fee = _num(row.get("fee", "0"))
            vol = _num(row.get("vol", "0"))
            date_str = row.get("time", "")

            trades.append(_normalize_trade(
                coin=coin,
                trade_type=trade_type,
                amount=vol,
                price=price,
                total=cost,
                fee=fee,
                date=date_str,
                source="kraken",
            ))
        except (ValueError, KeyError, IndexError):
            continue

    return trades


# ---------------------------------------------------------------------------
# Import / Persist
# ---------------------------------------------------------------------------

async def import_trades(username: str, trades: list[dict], source: str) -> dict:
    """Add parsed trades to the user's trade journal, skipping duplicates and non buy/sell rows.

    Returns {imported: N, duplicates_skipped: N, errors: [...]}.
    """
    existing = get_trades(username)
    if not isinstance(existing, list):
        existing = []

    def key(t: dict) -> str:
        return f"{t.get('coin_id')}|{t.get('date')}|{t.get('quantity')}|{t.get('price')}"

    seen = {key(t) for t in existing}
    imported, duplicates, errors = 0, 0, []
    for t in trades:
        if t.get("side") not in ("buy", "sell") or not t.get("quantity"):
            errors.append(f"Skipped {t.get('symbol', '?')} row on {t.get('date', '?')}: not a buy/sell trade")
            continue
        k = key(t)
        if k in seen:
            duplicates += 1
            continue
        existing.append({**t, "id": str(uuid.uuid4())[:8], "source": source, "created_at": time.time()})
        seen.add(k)
        imported += 1

    save_user_data(username, "trades", existing)
    return {"imported": imported, "duplicates_skipped": duplicates, "errors": errors[:50]}
