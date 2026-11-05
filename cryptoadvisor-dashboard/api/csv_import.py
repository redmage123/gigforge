"""CSV trade import API: parse an exchange trade-history export into the user's trade journal."""

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse

from services.csv_import import import_trades, parse_binance_csv, parse_coinbase_csv, parse_kraken_csv

router = APIRouter()

PARSERS = {"binance": parse_binance_csv, "coinbase": parse_coinbase_csv, "kraken": parse_kraken_csv}
MAX_BYTES = 5_000_000


@router.post("/")
async def import_csv(
    request: Request,
    exchange: str = Form(...),
    file: UploadFile = File(...),
):
    username = request.state.user.get("sub", "")
    parser = PARSERS.get(exchange.strip().lower())
    if not parser:
        return JSONResponse(status_code=400, content={
            "error": f"Unsupported exchange '{exchange}'. Supported: Binance, Coinbase, Kraken."})
    contents = await file.read()
    if len(contents) > MAX_BYTES:
        return JSONResponse(status_code=413, content={"error": "File is larger than 5 MB."})
    try:
        trades = await parser(contents)
    except UnicodeDecodeError:
        return JSONResponse(status_code=400, content={"error": "The file is not a UTF-8 text CSV."})
    if not trades:
        return JSONResponse(status_code=400, content={
            "error": f"No trades found. Check that this is a {exchange} trade-history export "
                     "with its original column headers."})
    result = await import_trades(username, trades, exchange.strip().lower())
    return {**result, "exchange": exchange, "filename": file.filename}
