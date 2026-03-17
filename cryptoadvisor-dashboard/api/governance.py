"""Governance proposals API (Snapshot integration)."""

from fastapi import APIRouter, Request, Query

router = APIRouter()


@router.get("/")
async def user_governance(request: Request):
    username = request.state.user.get("sub", "")
    return {
        "proposals": [],
        "held_tokens": [],
        "username": username,
    }


@router.get("/{space}")
async def space_proposals(request: Request, space: str):
    username = request.state.user.get("sub", "")
    return {
        "space": space,
        "proposals": [],
        "username": username,
    }
