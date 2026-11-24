"""Dashboard layout: tiles shown/hidden/ordered/sized and the instruments in each Markets tile."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import dashboard_layout as dl, store  # noqa: E402


def test_default_has_every_tile_once():
    layout = dl.default_layout()
    ids = [t["id"] for t in layout["tiles"]]
    assert len(ids) == len(set(ids)) == len(dl.BUILT_IN) + len(dl.DEFAULT_GROUPS)
    assert ids[:5] == [f"group:{g['id']}" for g in dl.DEFAULT_GROUPS]
    assert dl.sanitize(layout) == layout


def test_sanitize_drops_junk_and_keeps_the_users_order():
    raw = {
        "groups": [
            {"id": "mine", "title": "  My   tech  ", "ids": ["stock:AAPL", "stock:AAPL", "not an id", "stock:NVDA", 5]},
            {"id": "mine", "title": "duplicate", "ids": []},
            {"id": "BAD ID!", "title": "x", "ids": []},
        ],
        "tiles": [
            {"id": "volume", "size": "full", "hidden": True},
            {"id": "group:mine", "size": "huge"},
            {"id": "group:gone"},                # group that no longer exists
            {"id": "<script>"},
            {"id": "volume"},                    # duplicate
        ],
    }
    out = dl.sanitize(raw)
    assert out["groups"] == [{"id": "mine", "title": "My tech", "ids": ["stock:AAPL", "stock:NVDA"]}]
    ids = [t["id"] for t in out["tiles"]]
    assert ids[:2] == ["volume", "group:mine"]
    assert out["tiles"][0] == {"id": "volume", "size": "full", "hidden": True}
    assert out["tiles"][1]["size"] == "m"                  # unknown size -> medium
    assert set(ids) == set(dl.BUILT_IN) | {"group:mine"}  # missing built-ins appended, unknown ids dropped
    assert dl.sanitize("nonsense")["groups"] == []


def test_limits():
    raw = {"groups": [{"id": f"g{i}", "title": "t", "ids": [f"stock:S{j}" for j in range(30)]} for i in range(20)]}
    out = dl.sanitize(raw)
    assert len(out["groups"]) == dl.MAX_GROUPS and all(len(g["ids"]) == dl.MAX_PER_GROUP for g in out["groups"])


def test_old_widget_switches_carry_over():
    store.put("widgets", "olduser", [{"id": "fear_greed", "enabled": False}, {"id": "price_cards", "enabled": False},
                                     {"id": "volume", "enabled": True}])
    hidden = {t["id"] for t in dl.get("olduser")["tiles"] if t["hidden"]}
    assert hidden == {"fear_greed", "top_coins"}


def test_api_round_trip():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from starlette.middleware.base import BaseHTTPMiddleware

    from api.dashboard_layout import router

    app = FastAPI()

    async def as_user(request, call_next):
        request.state.user = {"sub": "dash"}
        return await call_next(request)

    app.add_middleware(BaseHTTPMiddleware, dispatch=as_user)
    app.include_router(router, prefix="/api/dashboard/layout")
    c = TestClient(app)
    layout = c.get("/api/dashboard/layout/").json()
    layout["tiles"].reverse()
    layout["groups"].append({"id": "energy", "title": "Energy", "ids": ["stock:XOM"]})
    saved = c.put("/api/dashboard/layout/", json=layout).json()
    assert saved["tiles"][0]["id"] == "quick_actions" and saved["tiles"][-1]["id"] == "group:energy"
    assert c.get("/api/dashboard/layout/").json() == saved
    assert c.delete("/api/dashboard/layout/").json() == dl.default_layout()
