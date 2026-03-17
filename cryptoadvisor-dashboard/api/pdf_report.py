"""PDF portfolio report export endpoint."""

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse, JSONResponse
import io

router = APIRouter()


@router.get("/portfolio")
async def export_portfolio_pdf(request: Request):
    try:
        username = request.state.user.get("sub", "")

        # Placeholder: generate PDF report for user's portfolio
        pdf_buffer = io.BytesIO()
        # PDF generation would go here (e.g., using reportlab or weasyprint)
        pdf_buffer.write(b"%PDF-1.4 placeholder")
        pdf_buffer.seek(0)

        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=portfolio_report_{username}.pdf"
            },
        )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
