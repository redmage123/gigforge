"""Technical analysis page router."""

from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates
from pathlib import Path

router = APIRouter()
templates = Jinja2Templates(directory=Path(__file__).parent.parent / "templates")


@router.get("/technical")
async def technical(request: Request):
    return templates.TemplateResponse("technical.html", {"request": request, "active_page": "technical"})
