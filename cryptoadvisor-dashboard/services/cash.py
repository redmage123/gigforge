"""Cash ledger per portfolio: deposits, withdrawals, income and charges, in USD.

External flows (deposit, withdrawal) are what time-weighted returns strip out; income (dividend,
interest) and charges (fee) are part of performance. Trades move cash too, computed from the
journal rather than stored here (see services.performance).
"""

import re
import time
import uuid

from services.user_data import load_user_data, save_user_data

NAMESPACE = "cash"
TYPES = {"deposit": 1, "withdrawal": -1, "dividend": 1, "interest": 1, "fee": -1}
EXTERNAL = ("deposit", "withdrawal")


def get_entries(owner: str, portfolio_ids=None) -> list[dict]:
    from services.portfolios import default_id

    rows = load_user_data(owner, NAMESPACE)
    rows = rows if isinstance(rows, list) else []
    default = None
    for r in rows:
        if not r.get("portfolio_id"):
            default = default or default_id(owner)
            r["portfolio_id"] = default
    if portfolio_ids is not None:
        rows = [r for r in rows if r["portfolio_id"] in portfolio_ids]
    return sorted(rows, key=lambda r: (r["date"], r.get("created_at", 0)))


def add_entry(owner: str, portfolio_id: str, kind: str, amount: float, date: str = "", notes: str = "",
              instrument_id: str = "") -> dict:
    if kind not in TYPES:
        raise ValueError(f"Type must be one of {', '.join(TYPES)}")
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        raise ValueError("Amount must be a number")
    if amount <= 0:
        raise ValueError("Amount must be positive (the type says which way it goes)")
    date = (date or time.strftime("%Y-%m-%d"))[:10]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        raise ValueError("Date must be YYYY-MM-DD")
    entry = {"id": uuid.uuid4().hex[:8], "portfolio_id": portfolio_id, "type": kind, "amount": round(amount, 2),
             "date": date, "notes": str(notes or "")[:300], "instrument_id": instrument_id or "",
             "created_at": time.time()}
    rows = get_entries(owner)
    save_user_data(owner, NAMESPACE, rows + [entry])
    return entry


def remove_entry(owner: str, entry_id: str, portfolio_ids) -> bool:
    rows = get_entries(owner)
    kept = [r for r in rows if not (r["id"] == entry_id and r["portfolio_id"] in portfolio_ids)]
    save_user_data(owner, NAMESPACE, kept)
    return len(kept) != len(rows)


def reassign(owner: str, pid: str, move_to: str | None) -> None:
    """Portfolio deleted: move its cash entries, or drop them."""
    rows = get_entries(owner)
    if move_to:
        for r in rows:
            if r["portfolio_id"] == pid:
                r["portfolio_id"] = move_to
    else:
        rows = [r for r in rows if r["portfolio_id"] != pid]
    save_user_data(owner, NAMESPACE, rows)


def signed(entry: dict) -> float:
    return TYPES[entry["type"]] * float(entry["amount"])
