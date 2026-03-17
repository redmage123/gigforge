"""Trades & P&L page router."""
from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates
from pathlib import Path
router = APIRouter()
templates = Jinja2Templates(directory=Path(__file__).parent.parent / "templates")

@router.get("/trades")
async def trades(request: Request):
    return templates.TemplateResponse("trades.html", {"request": request, "active_page": "trades"})
