"""DCA Calculator page router."""
from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates
from pathlib import Path
router = APIRouter()
templates = Jinja2Templates(directory=Path(__file__).parent.parent / "templates")

@router.get("/dca")
async def dca(request: Request):
    return templates.TemplateResponse("dca.html", {"request": request, "active_page": "dca"})
