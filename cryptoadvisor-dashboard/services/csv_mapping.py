"""Column-mapped CSV import for exchanges without a built-in parser (BTCC and any other).

The user says which column holds what (we suggest a mapping from the headers), previews the
parsed trades, then imports. Handles futures wording ("Open Long", "Close Short", "Buy to open"),
delimiters , ; and tab, preamble lines above the header, many date formats including epoch
seconds/ms, and a quantity multiplier for exchanges that report contracts or lots.
Mappings are remembered per user and header layout, so the next import of the same export is one click.
"""

import csv
import hashlib
import io
import re
from datetime import datetime, timezone

from services.csv_import import _num, resolve_symbol
from services.market import registry
from services.market.models import ASSET_CLASSES, TRADABLE_CLASSES, make_id
from services.user_data import load_user_data, save_user_data

FIELDS = ("date", "symbol", "side", "action", "quantity", "price", "fee")
REQUIRED = ("date", "symbol", "side", "quantity", "price")
# Header aliases, most specific first; matched case-insensitively after stripping units like "(USDT)"
ALIASES = {
    "date": ("filled time", "fill time", "trade time", "execution time", "time(utc)", "date(utc)", "created time",
             "order time", "datetime", "timestamp", "date", "time"),
    "symbol": ("symbol", "contract", "pair", "trading pair", "instrument", "market", "coin", "asset", "ticker"),
    "side": ("side", "direction", "order side", "trade side", "type", "buy/sell", "position side"),
    "action": ("open/close", "position effect", "action", "trade type", "order action"),
    "quantity": ("filled qty", "filled quantity", "executed qty", "filled amount", "filled", "executed",
                 "deal amount", "quantity", "qty", "volume", "lots", "size", "amount", "contracts"),
    "price": ("avg. fill price", "avg fill price", "average price", "filled price", "fill price", "deal price",
              "execution price", "avg price", "trade price", "price"),
    "fee": ("trading fee", "fee", "fees", "commission", "transaction fee"),
}
_QUOTES = ("USDT", "USDC", "BUSD", "FDUSD", "USD")
_SUFFIX = re.compile(r"[-_ ]?(PERP|PERPETUAL|SWAP|UMCBL|DMCBL|FUTURES?)$")
_DATE_FORMATS = ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y/%m/%d %H:%M:%S", "%Y/%m/%d %H:%M",
                 "%Y/%m/%d", "%Y.%m.%d %H:%M:%S", "%Y%m%d %H:%M:%S")
_DMY = ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y", "%d-%m-%Y %H:%M:%S", "%d-%m-%Y", "%d.%m.%Y %H:%M:%S",
        "%d.%m.%Y")
_MDY = ("%m/%d/%Y %H:%M:%S", "%m/%d/%Y %H:%M", "%m/%d/%Y", "%m-%d-%Y %H:%M:%S", "%m-%d-%Y")


def _norm(h: str) -> str:
    return re.sub(r"\s*[(\[][^)\]]*[)\]]\s*$", "", (h or "").strip().lower()).strip() or (h or "").strip().lower()


def read_table(content: bytes) -> tuple[list[str], list[list[str]]]:
    """(headers, rows). Skips title/preamble lines above the header row."""
    text = content.decode("utf-8-sig")
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        raise ValueError("The file is empty.")
    delim = max((",", ";", "\t"), key=lambda d: sum(ln.count(d) for ln in lines[:20]))
    rows = list(csv.reader(io.StringIO("\n".join(lines)), delimiter=delim))
    width = max(len(r) for r in rows[:20])
    # Header = first row as wide as the table with no numeric-looking cells
    start = next((i for i, r in enumerate(rows[:20]) if len([c for c in r if c.strip()]) >= min(width, 4)
                  and not any(re.fullmatch(r"-?[\d.,]+", c.strip()) for c in r if c.strip())), 0)
    headers = [h.strip() for h in rows[start]]
    body = [r + [""] * (len(headers) - len(r)) for r in rows[start + 1:] if any(c.strip() for c in r)]
    return headers, body


def signature(headers: list[str]) -> str:
    return hashlib.sha1("|".join(_norm(h) for h in headers).encode()).hexdigest()[:16]


def suggest_mapping(headers: list[str]) -> dict:
    normed = [_norm(h) for h in headers]
    used, mapping = set(), {}
    for field in FIELDS:
        for alias in ALIASES[field]:
            hit = next((headers[i] for i, h in enumerate(normed) if h == alias and headers[i] not in used), None)
            if hit:
                mapping[field], _ = hit, used.add(hit)
                break
    return mapping


def detect_day_first(values: list[str]) -> bool:
    """True when slash/dot dates put the day first (some first part > 12)."""
    for v in values:
        m = re.match(r"\s*(\d{1,2})[/.-](\d{1,2})[/.-]\d{4}", v or "")
        if m:
            if int(m.group(1)) > 12:
                return True
            if int(m.group(2)) > 12:
                return False
    return True  # ambiguous everywhere: most non-US exchanges are day-first; the preview shows the result


def parse_date(value: str, day_first: bool = True) -> str:
    """Any common export date -> "YYYY-MM-DD HH:MM:SS" (UTC kept as written)."""
    v = (value or "").strip()
    if re.fullmatch(r"\d{10}(\.\d+)?|\d{13}", v):  # epoch seconds / milliseconds
        ts = float(v) / (1000 if len(v) == 13 else 1)
        return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    v = re.sub(r"\s*(UTC|GMT)([+-]\d+(:?\d+)?)?$", "", v).replace("T", " ").rstrip("Z")
    v = re.sub(r"\.\d+$", "", v)  # fractional seconds
    v = re.sub(r"[+-]\d{2}:?\d{2}$", "", v).strip()
    for fmt in _DATE_FORMATS + (_DMY + _MDY if day_first else _MDY + _DMY):
        try:
            return datetime.strptime(v, fmt).strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
    raise ValueError(f"can't read date {value!r}")


def parse_side(side: str, action: str = "") -> str | None:
    """buy/sell from spot or futures wording. Closing a long is a sell; closing a short is a buy."""
    s = f"{side} {action}".strip().lower()
    closing = "close" in s or "reduce" in s
    if "long" in s or "short" in s:
        return "buy" if ("long" in s) != closing else "sell"
    if re.search(r"\b(buy|bought|b)\b", s):
        return "buy"
    if re.search(r"\b(sell|sold|s)\b", s):
        return "sell"
    return None


def base_symbol(raw: str, asset_class: str) -> str:
    sym = _SUFFIX.sub("", (raw or "").strip().upper())
    sym = re.sub(r"[/\-_ ]", "", sym)
    if asset_class == "crypto":
        for q in _QUOTES:
            if sym.endswith(q) and len(sym) > len(q):
                return sym[: -len(q)]
    return sym


def apply_mapping(headers: list[str], rows: list[list[str]], mapping: dict) -> tuple[list[dict], list[str]]:
    """Rows -> journal trades + per-row warnings. Registry must be loaded."""
    missing = [f for f in REQUIRED if not mapping.get(f)]
    if missing:
        raise ValueError(f"Choose a column for: {', '.join(missing)}")
    idx = {}
    for f in FIELDS:
        col = mapping.get(f)
        if col:
            if col not in headers:
                raise ValueError(f"Column '{col}' isn't in this file")
            idx[f] = headers.index(col)
    cls = (mapping.get("asset_class") or "crypto").lower()
    if cls != "auto" and cls not in ASSET_CLASSES:
        raise ValueError(f"Unknown asset class '{cls}'")
    try:
        mult = float(mapping.get("quantity_multiplier") or 1)
    except ValueError:
        raise ValueError("Quantity multiplier must be a number")
    if mult <= 0:
        raise ValueError("Quantity multiplier must be positive")
    day_first = mapping.get("day_first")
    if day_first is None:
        day_first = detect_day_first([r[idx["date"]] for r in rows[:200]])

    trades, warnings = [], []
    for n, r in enumerate(rows, start=2):
        get = lambda f: r[idx[f]].strip() if f in idx and idx[f] < len(r) else ""  # noqa: E731
        try:
            side = parse_side(get("side"), get("action"))
            if not side:
                warnings.append(f"Row {n}: side '{get('side')}' isn't buy/sell or long/short")
                continue
            qty = abs(_num(get("quantity"))) * mult
            if qty == 0:
                warnings.append(f"Row {n}: zero quantity (unfilled or cancelled order?)")
                continue
            price = _num(get("price"))
            if price <= 0:
                warnings.append(f"Row {n}: no fill price")
                continue
            if cls == "auto":
                iid, warn = resolve_symbol(get("symbol"))
            else:
                iid = make_id(cls, base_symbol(get("symbol"), cls))
                warn = None if registry.get(iid) else f"{iid} not found"
                if warn:
                    iid = None
            if not iid:
                warnings.append(f"Row {n}: {warn}")
                continue
            if iid.split(":")[0] not in TRADABLE_CLASSES:
                warnings.append(f"Row {n}: {iid} is a reference series, not tradable")
                continue
            trades.append({"instrument_id": iid, "symbol": iid.split(":", 1)[1], "side": side, "quantity": qty,
                           "price": price, "fee": abs(_num(get("fee"))) if get("fee") else 0.0,
                           "date": parse_date(get("date"), day_first)})
        except ValueError as exc:
            warnings.append(f"Row {n}: {exc}")
    return trades, warnings


def saved_mapping(username: str, sig: str) -> dict | None:
    data = load_user_data(username, "csv_mappings")
    return data.get(sig) if isinstance(data, dict) else None


def remember_mapping(username: str, sig: str, mapping: dict) -> None:
    data = load_user_data(username, "csv_mappings")
    data = data if isinstance(data, dict) else {}
    data[sig] = mapping
    save_user_data(username, "csv_mappings", dict(list(data.items())[-20:]))
