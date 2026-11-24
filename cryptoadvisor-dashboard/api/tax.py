"""Tax reporting API. Follows the portfolio switcher (X-Portfolio header) like the trades API."""

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse

from api.portfolios import scope_of
from services.market import registry
from services.tax import calculate_tax_report, export_csv
from services.trades import get_trades

router = APIRouter()


async def _report(request: Request, method: str, year: int | None) -> dict:
    scope = scope_of(request)
    trades = get_trades(scope.owner, scope.portfolio_ids)
    # Contract multipliers (futures), as the trades service uses for realized P&L
    await registry.ensure_loaded()
    mult = {}
    for iid in {t["instrument_id"] for t in trades}:
        inst = registry.get(iid)
        mult[iid] = float(inst.multiplier or 1.0) if inst else 1.0
    return calculate_tax_report(trades, method, year, mult)


@router.get("/report")
async def tax_report(request: Request, method: str = "fifo", year: int | None = Query(default=None, ge=1970, le=2100)):
    try:
        return await _report(request, method, year)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@router.get("/export")
async def tax_export(request: Request, method: str = "fifo", year: int | None = Query(default=None, ge=1970, le=2100)):
    try:
        csv_data = export_csv(await _report(request, method, year))
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    filename = f"tax_report_{method}_{year or 'all'}.csv"
    return StreamingResponse(
        iter([csv_data]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
