"""Live audience polls for on-stage presentations.

What: a fixed set of polls (questions with answer options), one of which the presenter
makes "active"; audience phones read the active poll, vote, and see the results once
the presenter reveals them.

Why: the Paris carbon-markets talk is meant to be interactive rather than a slide
deck. The room answers a question before each demo, and the presenter screen shows
how the room voted next to what the data says.

How: state is kept in memory in this process (polls are short-lived and a restart
between rehearsals is harmless). Each phone sends a random client id it keeps in
localStorage; a client has one vote per poll and may change it. Public reads and
votes are cheap dictionary lookups; presenter actions (activate, reveal, reset) are
admin-only in api/live_audience.py.
"""

from __future__ import annotations

import re
import time

from services.errors import BacswnNotFoundError, BacswnValidationError

# Polls, in the order the talk uses them. `answer` (an option id) is shown on reveal.
POLLS: dict[str, dict] = {
    "supply": {
        "question": "How many CORSIA-eligible units have host countries authorised so far?",
        "options": [
            {"id": "lt25", "label": "Under 25 million", "short": "<25M"},
            {"id": "25-50", "label": "25–50 million", "short": "25–50M"},
            {"id": "50-100", "label": "50–100 million", "short": "50–100M"},
            {"id": "100-200", "label": "100–200 million", "short": "100–200M"},
            {"id": "gt200", "label": "Over 200 million", "short": ">200M"},
        ],
        "answer": "50-100",
        "reveal_note": "About 72 million units under 42 letters of authorisation (IATA, Aug 2026), "
                       "against an estimated 200–250 million needed by 31 January 2028.",
    },
    "integrity": {
        "question": "Three airlines submit these unit cancellations. Which would you accept?",
        "options": [
            {"id": "A", "label": "Claim A — Coral Wing Airways, 8,988 units, Gold Standard, vintage 2024", "claim_id": 3, "short": "Claim A"},
            {"id": "B", "label": "Claim B — Exuma Island Hopper, 1,500 units, Verra, vintage 2023", "claim_id": 6, "short": "Claim B"},
            {"id": "C", "label": "Claim C — Exuma Island Hopper, 500 units, Bahamas national registry, vintage 2025", "claim_id": 13, "short": "Claim C"},
            {"id": "all", "label": "All three look fine", "short": "All three"},
        ],
        "answer": "A",
        "reveal_note": "Only A holds up. B's serial numbers were already claimed by another airline; "
                       "C's units are not authorised for CORSIA and carry no corresponding adjustment.",
    },
    "buffer-before": {
        "question": "How much of a Bahamian seagrass credit would you hold back as a hurricane buffer?",
        "options": [
            {"id": "lt10", "label": "Less than 10%", "short": "<10%"},
            {"id": "10-20", "label": "10–20%", "short": "10–20%"},
            {"id": "20-35", "label": "20–35%", "short": "20–35%"},
            {"id": "gt35", "label": "More than 35%", "short": ">35%"},
            {"id": "no", "label": "I wouldn't buy it", "short": "Won't buy"},
        ],
        "answer": None,
        "reveal_note": "Most programmes apply a generic non-permanence buffer, typically 10–20%.",
    },
    "buffer-after": {
        "question": "Now you've seen measured hurricane exposure: how much would you hold back?",
        "options": [
            {"id": "lt10", "label": "Less than 10%", "short": "<10%"},
            {"id": "10-20", "label": "10–20%", "short": "10–20%"},
            {"id": "20-35", "label": "20–35%", "short": "20–35%"},
            {"id": "gt35", "label": "More than 35%", "short": ">35%"},
            {"id": "no", "label": "I wouldn't buy it", "short": "Won't buy"},
        ],
        "answer": None,
        "reveal_note": "Measured, site-level exposure lets the buffer follow the actual risk of each project.",
    },
    "priority": {
        "question": "Where should a small island state start?",
        "options": [
            {"id": "supply", "label": "Authorise supply: letters of authorisation and registry", "short": "Supply"},
            {"id": "integrity", "label": "Verify claims independently", "short": "Integrity"},
            {"id": "bluecarbon", "label": "Make blue carbon investable with measured risk", "short": "Blue carbon"},
        ],
        "answer": None,
        "reveal_note": "All three run on the same state-side infrastructure.",
    },
}

MAX_CLIENTS_PER_POLL = 5000          # bounds memory if the public endpoint is abused
_CLIENT_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")

_state = {"active": None, "revealed": set(), "updated": time.time()}
_votes: dict[str, dict[str, str]] = {pid: {} for pid in POLLS}


def _poll(poll_id: str) -> dict:
    """The poll definition for ``poll_id``.

    Raises:
        BacswnNotFoundError: no such poll.
    """
    if poll_id not in POLLS:
        raise BacswnNotFoundError(f"Unknown poll: {poll_id}")
    return POLLS[poll_id]


def _public_poll(poll_id: str) -> dict:
    """A poll as the audience sees it: question and options, answer only once revealed."""
    p = POLLS[poll_id]
    revealed = poll_id in _state["revealed"]
    return {"id": poll_id, "question": p["question"], "options": p["options"], "revealed": revealed,
            **({"answer": p["answer"], "reveal_note": p["reveal_note"]} if revealed else {})}


def state() -> dict:
    """What every phone shows now: the active poll (or None) and a change stamp for cheap polling."""
    active = _state["active"]
    return {"active": _public_poll(active) if active else None, "updated": _state["updated"]}


def results(poll_id: str) -> dict:
    """Vote counts per option for one poll, plus the total and reveal status."""
    p = _poll(poll_id)
    counts = {o["id"]: 0 for o in p["options"]}
    for choice in _votes[poll_id].values():
        counts[choice] = counts.get(choice, 0) + 1
    return {"poll": poll_id, "counts": counts, "total": len(_votes[poll_id]),
            "revealed": poll_id in _state["revealed"], "answer": p["answer"], "reveal_note": p["reveal_note"]}


def vote(poll_id: str, client: str, choice: str) -> dict:
    """Record (or change) one phone's answer to the active poll.

    Raises:
        BacswnNotFoundError: no such poll.
        BacswnValidationError: the poll is not open, the client id is malformed, the
            option does not exist, or the poll is full.
    """
    p = _poll(poll_id)
    if _state["active"] != poll_id:
        raise BacswnValidationError("This question is closed")
    if not isinstance(client, str) or not _CLIENT_RE.match(client):
        raise BacswnValidationError("Invalid client id")
    if choice not in {o["id"] for o in p["options"]}:
        raise BacswnValidationError("Unknown option")
    votes = _votes[poll_id]
    if client not in votes and len(votes) >= MAX_CLIENTS_PER_POLL:
        raise BacswnValidationError("This question has reached its response limit")
    votes[client] = choice
    return {"ok": True, "poll": poll_id, "choice": choice}


def control(active: str | None = None, reveal: str | None = None, hide: str | None = None) -> dict:
    """Presenter action: set the active poll (None closes voting) and reveal or hide answers.

    Raises:
        BacswnNotFoundError: a named poll does not exist.
    """
    if active is not None and active != "":
        _poll(active)
    _state["active"] = active or None
    if reveal:
        _poll(reveal)
        _state["revealed"].add(reveal)
    if hide:
        _state["revealed"].discard(hide)
    _state["updated"] = time.time()
    return state()


def reset() -> dict:
    """Clear every vote, close voting and hide all answers (for rehearsals)."""
    for pid in _votes:
        _votes[pid].clear()
    _state.update(active=None, revealed=set(), updated=time.time())
    return state()


def revealed() -> list[dict]:
    """Question, options and counts for every poll the presenter has revealed (public)."""
    return [{"question": POLLS[pid]["question"], "options": POLLS[pid]["options"], **results(pid)}
            for pid in POLLS if pid in _state["revealed"]]


def polls() -> list[dict]:
    """Every poll with its options, answer and current results (presenter view)."""
    return [{"id": pid, "question": p["question"], "options": p["options"], **results(pid)} for pid, p in POLLS.items()]
