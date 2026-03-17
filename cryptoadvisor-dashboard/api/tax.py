"""Tax reporting API."""

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse, JSONResponse
from services.tax import calculate_tax_report, export_csv
from services.user_data import get_username

router = APIRouter()


@router.get("/report")
async def tax_report(request: Request, method: str = "fifo", year: int = None):
    try:
        return calculate_tax_report(get_username(request), method, year)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/export")
async def tax_export(request: Request, method: str = "fifo", year: int = None):
    username = get_username(request)
    csv_data = export_csv(username, method, year)
    filename = f"tax_report_{method}_{year or 'all'}.csv"
    return StreamingResponse(
        iter([csv_data]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
