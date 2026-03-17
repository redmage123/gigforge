"""NFT Portfolio page router."""
from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates
from pathlib import Path
router = APIRouter()
templates = Jinja2Templates(directory=Path(__file__).parent.parent / "templates")

@router.get("/nfts")
async def nfts(request: Request):
    return templates.TemplateResponse("nfts.html", {"request": request, "active_page": "nfts"})
