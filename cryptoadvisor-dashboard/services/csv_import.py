"""CSV trade import — parse Binance, Coinbase, and Kraken trade history files."""

import csv
import io
import json
from datetime import datetime
from pathlib import Path

from config import DATA_DIR

TRADES_DIR = DATA_DIR / "imported_trades"


def _ensure_trades_dir() -> None:
    TRADES_DIR.mkdir(parents=True, exist_ok=True)


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
    """Return a normalized trade dict."""
    return {
        "coin": coin.upper(),
        "type": trade_type.lower(),
        "amount": amount,
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
            price = float(row.get("Price", "0"))
            executed = float(row.get("Executed", "0").replace(",", ""))
            amount = float(row.get("Amount", "0").replace(",", ""))
            fee = float(row.get("Fee", "0").replace(",", "").split(" ")[0])  # "0.001 BNB" -> 0.001
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
            quantity = float(row.get("Quantity Transacted", "0").replace(",", ""))
            spot_price = float(row.get("Spot Price at Transaction", "0").replace(",", ""))
            total = float(row.get("Total (inclusive of fees and/or spread)", row.get("Total", "0")).replace(",", ""))
            fees = float(row.get("Fees and/or Spread", row.get("Fees", "0")).replace(",", ""))
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
            price = float(row.get("price", "0"))
            cost = float(row.get("cost", "0"))
            fee = float(row.get("fee", "0"))
            vol = float(row.get("vol", "0"))
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
    """Save imported trades for a user. Skips duplicates based on (coin, date, amount, price).

    Returns {imported: N, duplicates_skipped: N}.
    """
    _ensure_trades_dir()
    user_file = TRADES_DIR / f"{username}.json"

    existing: list[dict] = []
    if user_file.exists():
        try:
            existing = json.loads(user_file.read_text())
        except (json.JSONDecodeError, OSError):
            existing = []

    # Build a set of dedup keys from existing trades
    dedup_keys: set[str] = set()
    for t in existing:
        key = f"{t.get('coin')}|{t.get('date')}|{t.get('amount')}|{t.get('price')}"
        dedup_keys.add(key)

    imported = 0
    duplicates = 0
    for t in trades:
        key = f"{t.get('coin')}|{t.get('date')}|{t.get('amount')}|{t.get('price')}"
        if key in dedup_keys:
            duplicates += 1
            continue
        t["source"] = source
        t["imported_at"] = datetime.utcnow().isoformat() + "Z"
        existing.append(t)
        dedup_keys.add(key)
        imported += 1

    user_file.write_text(json.dumps(existing, indent=2, default=str))

    return {"imported": imported, "duplicates_skipped": duplicates}
