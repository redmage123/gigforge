"""Dashboard layout API: the signed-in user's tiles and Markets groups."""

from fastapi import APIRouter, Request

from services import dashboard_layout
from services.user_data import get_username

router = APIRouter()


@router.get("/")
async def get_layout(request: Request):
    return dashboard_layout.get(get_username(request))


@router.put("/")
async def save_layout(request: Request):
    return dashboard_layout.save(get_username(request), await request.json())


@router.delete("/")
async def reset_layout(request: Request):
    return dashboard_layout.reset(get_username(request))
