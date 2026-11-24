"""Help documents: who can read what, both formats served, PDFs in step with their Markdown."""

import hashlib
import re
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi import FastAPI, Request  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from api import help as help_api  # noqa: E402

USERS = [{"username": "alice", "role": "user"}, {"username": "root", "role": "admin"}]


@pytest.fixture
def client():
    app = FastAPI()

    @app.middleware("http")
    async def fake_auth(request: Request, call_next):
        # Stands in for middleware/auth.py: the test picks the signed-in user with a header
        request.state.user = {"sub": request.headers.get("x-test-user", "alice"), "role": "user"}
        return await call_next(request)

    app.include_router(help_api.router, prefix="/api/help")
    with patch.object(help_api, "load_users", lambda: USERS):
        yield TestClient(app)


def test_every_listed_document_has_markdown_and_pdf():
    for slug in help_api.DOCS:
        assert (help_api.HELP_DIR / f"{slug}.md").is_file(), slug
        assert (help_api.HELP_DIR / f"{slug}.pdf").is_file(), slug


def test_pdfs_are_built_from_the_current_markdown():
    # build_help_pdfs.py stamps the source hash into the PDF subject; rebuild after editing a .md
    for slug in help_api.DOCS:
        md = (help_api.HELP_DIR / f"{slug}.md").read_bytes()
        pdf = (help_api.HELP_DIR / f"{slug}.pdf").read_bytes()
        m = re.search(rb"/Subject \(source-sha256:([0-9a-f]{64})\)", pdf)
        assert m, f"{slug}.pdf has no source hash"
        assert m.group(1).decode() == source_hash(md.decode("utf-8")), \
            f"{slug}.pdf is out of date (its Markdown or a screenshot changed): run python scripts/build_help_pdfs.py"


def source_hash(md: str) -> str:
    """Same as scripts/build_help_pdfs.py: the Markdown plus every screenshot it shows."""
    h = hashlib.sha256(md.encode("utf-8"))
    for name in re.findall(r"^!\[[^\]]*\]\(img/([a-z0-9-]+\.(?:png|jpg))\)", md, flags=re.M):
        path = help_api.HELP_DIR / "img" / name
        h.update(path.read_bytes() if path.is_file() else b"missing")
    return h.hexdigest()


def test_every_screenshot_a_guide_shows_exists_and_is_served(client):
    for slug in help_api.DOCS:
        md = (help_api.HELP_DIR / f"{slug}.md").read_text(encoding="utf-8")
        for name in re.findall(r"^!\[[^\]]*\]\(img/([a-z0-9-]+\.(?:png|jpg))\)", md, flags=re.M):
            assert (help_api.HELP_DIR / "img" / name).is_file(), f"{slug} shows missing img/{name}"
    assert client.get("/api/help/img/..%2F..%2Fmain.py").status_code == 404
    assert client.get("/api/help/img/nope.jpg").status_code == 404


def test_users_see_the_guides_but_not_the_runbook(client):
    slugs = [d["slug"] for d in client.get("/api/help/").json()]
    assert slugs == ["quick-start", "user-guide", "faq"]
    r = client.get("/api/help/user-guide")
    assert r.status_code == 200 and r.json()["markdown"].startswith("# AssetAdvisor User Guide")
    for path in ("/api/help/runbook", "/api/help/runbook.pdf", "/api/help/runbook.md"):
        assert client.get(path).status_code == 404, path


def test_platform_admins_also_see_the_runbook(client):
    h = {"x-test-user": "root"}
    assert [d["slug"] for d in client.get("/api/help/", headers=h).json()][-1] == "runbook"
    assert client.get("/api/help/runbook", headers=h).json()["title"] == "Operations Runbook"
    assert client.get("/api/help/runbook.pdf", headers=h).status_code == 200


def test_both_formats_download(client):
    pdf = client.get("/api/help/faq.pdf")
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF") and "attachment" in pdf.headers["content-disposition"]
    md = client.get("/api/help/faq.md")
    assert md.status_code == 200 and md.headers["content-type"].startswith("text/markdown")
    assert md.text.startswith("# AssetAdvisor FAQ")


def test_unknown_or_traversal_slugs_are_refused(client):
    for path in ("/api/help/nope", "/api/help/nope.pdf", "/api/help/..%2F..%2Fmain.py",
                 "/api/help/..%2Fsoc2%2Fcontrols.md"):
        assert client.get(path).status_code == 404, path
