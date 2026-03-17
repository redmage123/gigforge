"""CSV trade import API."""

from fastapi import APIRouter, Request, Query, UploadFile, File, Form

router = APIRouter()


@router.post("/")
async def import_csv(
    request: Request,
    exchange: str = Form(...),
    file: UploadFile = File(...),
):
    username = request.state.user.get("sub", "")
    contents = await file.read()
    lines = contents.decode("utf-8").strip().splitlines()
    # Skip header row
    trade_count = max(0, len(lines) - 1)
    return {
        "status": "imported",
        "exchange": exchange,
        "filename": file.filename,
        "trades_imported": trade_count,
        "username": username,
    }
