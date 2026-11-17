"""Help documents: Quick Start, User Guide, FAQ (everyone) and the operations runbook (platform admins).

Sources are docs/help/<slug>.md with a PDF edition next to each (scripts/build_help_pdfs.py).
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from services.auth import load_users
from services.user_data import get_username

router = APIRouter()

HELP_DIR = Path(__file__).resolve().parent.parent / "docs" / "help"

# Order is the order shown in the app
DOCS = {
    "quick-start": {"title": "Quick Start", "summary": "From a new account to a working portfolio in ten minutes.",
                    "admin_only": False},
    "user-guide": {"title": "User Guide", "summary": "Every feature, from portfolios and statements to firm accounts.",
                   "admin_only": False},
    "faq": {"title": "FAQ", "summary": "Answers to common questions about accounts, data, firms and security.",
            "admin_only": False},
    "runbook": {"title": "Operations Runbook", "summary": "Deploying, backups, restores, support tasks and incidents.",
                "admin_only": True},
}


def _is_platform_admin(username: str) -> bool:
    # Read the stored record, not the token: a role removed today must take effect at once
    return any(u.get("username") == username and u.get("role") == "admin" for u in load_users())


def _doc(request: Request, slug: str) -> dict:
    meta = DOCS.get(slug)
    # A hidden document answers exactly like a missing one
    if not meta or (meta["admin_only"] and not _is_platform_admin(get_username(request))):
        raise HTTPException(404, "No such document")
    return meta


@router.get("/")
async def list_docs(request: Request):
    admin = _is_platform_admin(get_username(request))
    return [{"slug": slug, "title": m["title"], "summary": m["summary"], "admin_only": m["admin_only"]}
            for slug, m in DOCS.items() if admin or not m["admin_only"]]


@router.get("/{slug}.pdf")
async def doc_pdf(request: Request, slug: str):
    _doc(request, slug)
    path = HELP_DIR / f"{slug}.pdf"
    if not path.is_file():
        raise HTTPException(404, "The PDF edition isn't available")
    return FileResponse(path, media_type="application/pdf", filename=f"AssetAdvisor-{slug}.pdf")


@router.get("/{slug}.md")
async def doc_markdown_file(request: Request, slug: str):
    _doc(request, slug)
    return FileResponse(HELP_DIR / f"{slug}.md", media_type="text/markdown; charset=utf-8",
                        filename=f"AssetAdvisor-{slug}.md")


@router.get("/{slug}")
async def doc(request: Request, slug: str):
    meta = _doc(request, slug)
    return {"slug": slug, "title": meta["title"],
            "markdown": (HELP_DIR / f"{slug}.md").read_text(encoding="utf-8")}
