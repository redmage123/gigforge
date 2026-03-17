"""Tax reporting page router."""
from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates
from pathlib import Path
router = APIRouter()
templates = Jinja2Templates(directory=Path(__file__).parent.parent / "templates")

@router.get("/tax")
async def tax(request: Request):
    return templates.TemplateResponse("tax.html", {"request": request, "active_page": "tax"})
