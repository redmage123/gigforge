"""Tests for the live audience polls (services/live_audience.py, api/live_audience.py).

What: voting rules, presenter control, reveal gating and route permissions.
Why: phones vote without an account, so the public surface must be tightly bounded.
How: service functions are called directly; routes go through the ASGI test client.
"""

import pytest

from services import live_audience as live
from services.errors import BacswnNotFoundError, BacswnValidationError

CLIENT = "phone-abcdef12"


@pytest.fixture(autouse=True)
def _clean():
    """Every test starts with no votes and voting closed."""
    live.reset()
    yield
    live.reset()


def test_vote_only_on_active_poll_and_can_change():
    """A phone votes on the open poll, may change its answer, and is counted once."""
    with pytest.raises(BacswnValidationError):
        live.vote("supply", CLIENT, "lt25")
    live.control(active="supply")
    live.vote("supply", CLIENT, "lt25")
    live.vote("supply", CLIENT, "50-100")
    r = live.results("supply")
    assert r["total"] == 1 and r["counts"]["50-100"] == 1 and r["counts"]["lt25"] == 0


@pytest.mark.parametrize("poll,client,choice,err", [
    ("nope", CLIENT, "x", BacswnNotFoundError),
    ("supply", "bad id!", "lt25", BacswnValidationError),
    ("supply", CLIENT, "not-an-option", BacswnValidationError),
])
def test_bad_votes_rejected(poll, client, choice, err):
    """Unknown polls, malformed client ids and unknown options are refused."""
    live.control(active="supply")
    with pytest.raises(err):
        live.vote(poll, client, choice)


def test_answer_hidden_until_revealed():
    """The public state carries the answer only after the presenter reveals it."""
    live.control(active="integrity")
    assert "answer" not in live.state()["active"]
    live.control(active="integrity", reveal="integrity")
    assert live.state()["active"]["answer"] == "A"


@pytest.mark.asyncio
async def test_public_routes_need_no_login(client):
    """Phones can read state and vote without a token; results stay hidden until revealed."""
    live.control(active="supply")
    assert (await client.get("/api/live/state")).status_code == 200
    r = await client.post("/api/live/vote", json={"poll": "supply", "client": CLIENT, "choice": "gt200"})
    assert r.status_code == 200
    assert (await client.get("/api/live/results/supply")).status_code == 400
    live.control(active="supply", reveal="supply")
    assert (await client.get("/api/live/results/supply")).json()["counts"]["gt200"] == 1


@pytest.mark.asyncio
async def test_presenter_routes_need_admin(client):
    """Without an admin token the control routes are refused."""
    assert (await client.post("/api/live-admin/control", json={"active": "supply"})).status_code in (401, 403)
    assert (await client.post("/api/live-admin/reset")).status_code in (401, 403)


@pytest.mark.asyncio
async def test_presenter_flow_with_admin(client, admin_headers):
    """An admin opens a poll, sees live counts before reveal, then reveals."""
    r = await client.post("/api/live-admin/control", json={"active": "priority"}, headers=admin_headers)
    assert r.json()["active"]["id"] == "priority"
    await client.post("/api/live/vote", json={"poll": "priority", "client": CLIENT, "choice": "supply"})
    polls = (await client.get("/api/live-admin/polls", headers=admin_headers)).json()["polls"]
    assert next(p for p in polls if p["id"] == "priority")["counts"]["supply"] == 1
    r = await client.post("/api/live-admin/control", json={"active": None, "reveal": "priority"}, headers=admin_headers)
    assert r.json()["active"] is None



@pytest.mark.asyncio
async def test_revealed_lists_only_revealed_polls(client):
    """The phone's results tab sees a poll only after the presenter reveals it."""
    live.control(active="supply")
    live.vote("supply", CLIENT, "50-100")
    assert (await client.get("/api/live/revealed")).json()["polls"] == []
    live.control(active=None, reveal="supply")
    polls = (await client.get("/api/live/revealed")).json()["polls"]
    assert [p["poll"] for p in polls] == ["supply"] and polls[0]["counts"]["50-100"] == 1
