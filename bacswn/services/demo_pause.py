"""BACSWN — demo pause.

One switch that freezes the whole demo so a presenter can stop and explain:
the mesh simulation clock stops (storms, stations, hand-offs and the satellite
feed hold still), the simulated market stops quoting, periodic agents stop
running, and nothing is broadcast to the screens. On resume everything carries
on from where it stopped, not from where it would have been.

The pause is shared by every viewer, so a presenter's laptop and a projector
freeze together. Live external feeds (real METARs or ADS-B) cannot be stopped
at source; the browser holds its last picture of them while paused.
"""

import time
from datetime import UTC, datetime

_paused_at: float | None = None      # wall time the current pause began
_paused_total = 0.0                  # seconds spent paused in earlier pauses
_info: dict = {}                     # who paused and when (for the banner)


def is_paused() -> bool:
    return _paused_at is not None


def clock() -> float:
    """Wall-clock seconds minus all time spent paused; stands still while paused."""
    now = _paused_at if _paused_at is not None else time.time()
    return now - _paused_total


def pause(by: str | None = None) -> dict:
    global _paused_at, _info
    if _paused_at is None:
        _paused_at = time.time()
        _info = {"by": by, "since": datetime.now(UTC).isoformat()}
    return status()


def resume() -> dict:
    global _paused_at, _paused_total, _info
    if _paused_at is not None:
        _paused_total += time.time() - _paused_at
        _paused_at = None
        _info = {}
    return status()


def status() -> dict:
    return {"paused": is_paused(), **_info}


def _reset_for_tests() -> None:
    global _paused_at, _paused_total, _info
    _paused_at, _paused_total, _info = None, 0.0, {}
