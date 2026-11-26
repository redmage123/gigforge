"""Regression tests for the React catch-all route (``main.serve_react``).

What: requests with encoded ``../`` segments must never return files from outside the
React build directory; they get ``index.html`` instead.

Why: the catch-all once joined the raw path onto the build directory, so
``GET /..%2f..%2fconfig.py`` returned server files (``config.py``, ``.env``, the database)
to anyone, because the auth middleware lets non-API paths through.

How: point ``main.REACT_DIR`` at a temporary build containing ``index.html`` and one
asset, put a "secret" file beside it, then request it through several encodings.
"""

import pytest

import main


@pytest.fixture
def react_build(tmp_path, monkeypatch):
    """A fake React build in ``tmp_path/build`` with a secret file one level above it."""
    build = tmp_path / "build"
    (build / "assets").mkdir(parents=True)
    (build / "index.html").write_text("<!doctype html><title>spa</title>")
    (build / "assets" / "app.js").write_text("console.log('ok')")
    (tmp_path / "secret.env").write_text("JWT_SECRET=do-not-serve")
    monkeypatch.setattr(main, "REACT_DIR", build)
    return build


@pytest.mark.asyncio
@pytest.mark.parametrize("path", [
    "/..%2fsecret.env",
    "/%2e%2e%2fsecret.env",
    "/%2e%2e/secret.env",
    "/assets/..%2f..%2fsecret.env",
])
async def test_encoded_traversal_serves_index_not_the_file(client, react_build, path):
    """Encoded parent-directory paths fall back to index.html and never leak the secret."""
    r = await client.get(path)
    assert r.status_code == 200
    assert "do-not-serve" not in r.text
    assert "<title>spa</title>" in r.text


@pytest.mark.asyncio
async def test_real_assets_and_spa_routes_still_work(client, react_build):
    """Files inside the build are served; unknown routes get the SPA shell."""
    assert "console.log('ok')" in (await client.get("/assets/app.js")).text
    assert "<title>spa</title>" in (await client.get("/flights")).text
