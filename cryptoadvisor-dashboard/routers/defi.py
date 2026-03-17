"""DeFi positions page router."""
from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates
from pathlib import Path
router = APIRouter()
templates = Jinja2Templates(directory=Path(__file__).parent.parent / "templates")

@router.get("/defi")
async def defi(request: Request):
    return templates.TemplateResponse("defi.html", {"request": request, "active_page": "defi"})
