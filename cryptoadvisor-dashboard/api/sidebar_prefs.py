"""Sidebar preferences REST endpoints."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from services.sidebar_prefs import (
    get_sidebar_prefs,
    save_sidebar_prefs,
    toggle_pin,
    toggle_section_collapse,
    toggle_section_visibility,
)

router = APIRouter()


class SidebarPrefsUpdate(BaseModel):
    collapsed_sections: list[str] = []
    pinned_pages: list[str] = []
    hidden_sections: list[str] = []


class PinToggle(BaseModel):
    path: str


class SectionToggle(BaseModel):
    section: str


@router.get("/")
async def get_prefs(request: Request):
    try:
        username = request.state.user.get("sub", "")
        return get_sidebar_prefs(username)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.put("/")
async def update_prefs(request: Request, body: SidebarPrefsUpdate):
    try:
        username = request.state.user.get("sub", "")
        prefs = save_sidebar_prefs(username, body.model_dump())
        return prefs
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/pin")
async def toggle_pin_endpoint(request: Request, body: PinToggle):
    try:
        username = request.state.user.get("sub", "")
        return toggle_pin(username, body.path)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/collapse")
async def toggle_collapse_endpoint(request: Request, body: SectionToggle):
    try:
        username = request.state.user.get("sub", "")
        return toggle_section_collapse(username, body.section)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/visibility")
async def toggle_visibility_endpoint(request: Request, body: SectionToggle):
    try:
        username = request.state.user.get("sub", "")
        return toggle_section_visibility(username, body.section)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
