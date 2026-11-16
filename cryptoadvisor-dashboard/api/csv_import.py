"""CSV trade import API: parse an exchange trade-history export into the user's trade journal."""

import json

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse

from services.csv_import import (
    import_trades, parse_binance_csv, parse_coinbase_csv, parse_generic_csv, parse_kraken_csv,
)

router = APIRouter()


def _target(request):
    """(owner, portfolio id) the import goes into: the selected portfolio, or the default one."""
    from api.portfolios import scope_of, writable

    scope = scope_of(request)
    return scope.owner, writable(scope, None if scope.combined else scope.single)

PARSERS = {"binance": parse_binance_csv, "coinbase": parse_coinbase_csv, "kraken": parse_kraken_csv,
           "generic": parse_generic_csv}
MAX_BYTES = 5_000_000


@router.post("/")
async def import_csv(
    request: Request,
    exchange: str = Form(...),
    file: UploadFile = File(...),
):
    username, pid = _target(request)
    parser = PARSERS.get(exchange.strip().lower())
    if not parser:
        return JSONResponse(status_code=400, content={
            "error": f"Unsupported format '{exchange}'. Supported: Binance, Coinbase, Kraken, Generic."})
    contents = await file.read()
    if len(contents) > MAX_BYTES:
        return JSONResponse(status_code=413, content={"error": "File is larger than 5 MB."})
    try:
        trades = await parser(contents)
    except UnicodeDecodeError:
        return JSONResponse(status_code=400, content={"error": "The file is not a UTF-8 text CSV."})
    except ValueError as exc:  # generic format: every row was rejected; say why
        return JSONResponse(status_code=400, content={"error": f"No trades imported. {exc}"})
    if not trades:
        return JSONResponse(status_code=400, content={
            "error": f"No trades found. Check that this is a {exchange} trade-history export "
                     "with its original column headers."})
    result = await import_trades(username, trades, exchange.strip().lower(), pid)
    return {**result, "exchange": exchange, "filename": file.filename}


# ---------------------------------------------------------------------------
# Column-mapped import (BTCC and any exchange without a built-in parser)
# ---------------------------------------------------------------------------

async def _read(file: UploadFile) -> bytes:
    contents = await file.read()
    if len(contents) > MAX_BYTES:
        raise ValueError("File is larger than 5 MB.")
    return contents


@router.post("/inspect")
async def inspect_csv(request: Request, file: UploadFile = File(...)):
    """Headers, a sample, and a suggested (or previously used) column mapping."""
    from services import csv_mapping as cm

    username = request.state.user.get("sub", "")
    try:
        headers, rows = cm.read_table(await _read(file))
    except UnicodeDecodeError:
        return JSONResponse(status_code=400, content={"error": "The file is not a UTF-8 text CSV."})
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    sig = cm.signature(headers)
    saved = cm.saved_mapping(username, sig)
    return {"headers": headers, "sample": rows[:8], "rows": len(rows), "signature": sig,
            "mapping": saved or cm.suggest_mapping(headers), "saved": bool(saved), "fields": list(cm.FIELDS),
            "required": list(cm.REQUIRED)}


@router.post("/mapped")
async def import_mapped(request: Request, file: UploadFile = File(...), mapping: str = Form(...),
                        commit: bool = Form(False), source: str = Form("custom")):
    """Parse with the user's mapping. commit=false previews; commit=true imports and remembers the mapping."""
    from services import csv_mapping as cm
    from services.market import registry

    username = request.state.user.get("sub", "")
    owner, pid = _target(request) if commit else (username, None)
    source = "".join(ch for ch in source.lower() if ch.isalnum())[:20] or "custom"
    try:
        m = json.loads(mapping)
        if not isinstance(m, dict):
            raise ValueError("bad mapping")
        headers, rows = cm.read_table(await _read(file))
        await registry.ensure_loaded()
        trades, warnings = cm.apply_mapping(headers, rows, m)
    except UnicodeDecodeError:
        return JSONResponse(status_code=400, content={"error": "The file is not a UTF-8 text CSV."})
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    if not commit:
        by_inst = {}
        for t in trades:
            b = by_inst.setdefault(t["instrument_id"], {"instrument_id": t["instrument_id"], "trades": 0, "net_quantity": 0.0})
            b["trades"] += 1
            b["net_quantity"] += t["quantity"] if t["side"] == "buy" else -t["quantity"]
        return {"preview": [{**t, "notional": round(t["quantity"] * t["price"], 2)} for t in trades[:25]],
                "count": len(trades), "rows": len(rows), "warnings": warnings[:50], "warning_count": len(warnings),
                "instruments": sorted(by_inst.values(), key=lambda b: -b["trades"])[:20]}
    if not trades:
        return JSONResponse(status_code=400, content={"error": "No trades to import. " + "; ".join(warnings[:3])})
    trades[0]["_warnings"] = warnings
    result = await import_trades(owner, trades, source, pid)
    cm.remember_mapping(username, cm.signature(headers), m)
    return {**result, "exchange": source, "filename": file.filename}
