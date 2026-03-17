"""Blockchain explorer page router."""

from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates
from pathlib import Path

router = APIRouter()
templates = Jinja2Templates(directory=Path(__file__).parent.parent / "templates")


@router.get("/blockchain")
async def blockchain(request: Request):
    return templates.TemplateResponse("blockchain.html", {"request": request, "active_page": "blockchain"})
