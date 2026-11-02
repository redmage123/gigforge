"""BACSWN — AI trading advisor, backed by Claude Code in headless mode (`claude -p`).

Each question is answered by one `claude -p` run that receives a JSON snapshot
of everything the advisor may use — quotes, the user's account, the signal
engine's ideas and position review, the CORSIA hedge gap, headlines — and must
reply in a fixed JSON schema (`--json-schema`): a plain-language answer plus
optional trade *proposals*. Proposals are validated here and returned to the
desk as tickets the user can load and submit; the advisor never places orders.

The CLI runs with no tools (`--tools ""`), no MCP servers, no session
persistence, a per-call spend cap and a timeout, from an empty working
directory, so it can only reason over the data it is handed.

Configuration (environment):
  ADVISOR_CLAUDE_BIN   path to the `claude` binary (default: found on PATH)
  ADVISOR_MODEL        model alias or name (default: "opus")
  ADVISOR_EFFORT       low | medium | high (default: "medium")
  ADVISOR_MAX_USD      spend cap per answer (default: 0.50)
Credentials are whatever the CLI is logged in with (ANTHROPIC_API_KEY or a login).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import tempfile
import time
from collections import deque

logger = logging.getLogger("bacswn.advisor")

TIMEOUT_S = 180
MAX_CONCURRENT = 2
PER_USER_PER_HOUR = 30
HISTORY_TURNS = 6
MAX_QUESTION_CHARS = 2000

SYSTEM_PROMPT = """You are the trading advisor on the BACSWN Carbon Desk, a simulated market in carbon-offset \
futures modelled on CME Group's GEO (CORSIA-eligible), N-GEO (nature-based) and C-GEO (core) contracts. \
One contract is 1,000 offsets (tonnes CO2e); prices are USD per offset.

You advise one user. Each message gives you a JSON snapshot of the market, their account, ideas from the \
desk's rule-based signal engine, a review of their open positions, and their CORSIA hedge gap. Use only that \
data; if something you'd need isn't there, say so rather than guess.

How to advise:
- Answer the user's question directly first, in plain language a non-specialist can follow. Keep it short.
- Formatting: short paragraphs, "-" bullet lists and **bold** only — no headings, tables or code blocks.
- Ground every claim in the snapshot: name the contract, price, signal or figure you are relying on.
- When you recommend a trade, add it to `proposals` with a size that fits their equity and free margin. \
Prefer limit orders near the touch; give a stop loss and take profit for tactical trades. A CORSIA hedge \
is held to cover the obligation, so it needs no stop or target.
- You may agree with, refine, or argue against the signal engine's ideas. Say which and why.
- Always state the main risk of anything you recommend. Never promise returns.
- You cannot place, change or cancel orders. The user reviews and submits every order themselves; \
never say you have traded.
- If the user asks about something other than this desk, their positions or carbon markets, answer \
briefly and steer back.
This is a simulated market for demonstration; it is not financial advice."""

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["answer", "proposals", "follow_ups"],
    "properties": {
        "answer": {"type": "string", "description": "Plain-language reply to the user."},
        "proposals": {
            "type": "array", "maxItems": 4,
            "items": {
                "type": "object", "additionalProperties": False,
                "required": ["symbol", "side", "qty", "order_type", "limit_price", "stop_loss",
                             "take_profit", "rationale", "main_risk", "confidence"],
                "properties": {
                    "symbol": {"type": "string"},
                    "side": {"type": "string", "enum": ["BUY", "SELL"]},
                    "qty": {"type": "integer"},
                    "order_type": {"type": "string", "enum": ["LMT", "MKT"]},
                    "limit_price": {"type": ["number", "null"]},
                    "stop_loss": {"type": ["number", "null"]},
                    "take_profit": {"type": ["number", "null"]},
                    "rationale": {"type": "string"},
                    "main_risk": {"type": "string"},
                    "confidence": {"type": "number"},
                },
            },
        },
        "follow_ups": {"type": "array", "maxItems": 3, "items": {"type": "string"}},
    },
}

_sem = asyncio.Semaphore(MAX_CONCURRENT)
_calls: dict[str, deque] = {}
_history: dict[str, deque] = {}


class AdvisorUnavailable(RuntimeError):
    """The AI layer can't answer; the message is safe to show the user."""


def _bin() -> str | None:
    return os.getenv("ADVISOR_CLAUDE_BIN") or shutil.which("claude")


def status() -> dict:
    b = _bin()
    return {"available": bool(b), "engine": "claude -p" if b else None,
            "model": os.getenv("ADVISOR_MODEL", "opus"),
            "reason": None if b else "The Claude Code CLI isn't installed on the server, so only rule-based ideas are available."}


def reset(owner: str) -> None:
    _history.pop(owner, None)


def _rate_ok(owner: str) -> bool:
    now = time.time()
    q = _calls.setdefault(owner, deque())
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= PER_USER_PER_HOUR:
        return False
    q.append(now)
    return True


def _prompt(owner: str, question: str, snapshot: dict) -> str:
    turns = list(_history.get(owner, ()))
    convo = "\n".join(f"{'User' if r == 'user' else 'Advisor'}: {t}" for r, t in turns)
    return (f"<snapshot>\n{json.dumps(snapshot, separators=(',', ':'), default=str)}\n</snapshot>\n\n"
            + (f"<conversation_so_far>\n{convo}\n</conversation_so_far>\n\n" if convo else "")
            + f"<question>\n{question}\n</question>")


def validate_proposals(raw: list[dict], venue) -> tuple[list[dict], list[str]]:
    """Keep only proposals the desk could actually accept; explain any dropped."""
    from services.carbon_exchange import MAX_ORDER_QTY, PRICE_BAND_PCT
    ok, dropped = [], []
    for p in raw or []:
        inst = venue.instruments.get(str(p.get("symbol", "")).upper())
        if inst is None:
            dropped.append(f"{p.get('symbol')}: not a listed contract")
            continue
        qty = int(p.get("qty") or 0)
        if not 1 <= qty <= MAX_ORDER_QTY:
            dropped.append(f"{inst.symbol}: quantity {qty} outside 1–{MAX_ORDER_QTY}")
            continue
        ref = inst.mark()
        bad = [name for name, v in (("limit", p.get("limit_price")), ("stop", p.get("stop_loss")),
                                    ("target", p.get("take_profit")))
               if v is not None and (v <= 0 or abs(v - ref) > ref * PRICE_BAND_PCT)]
        if bad:
            dropped.append(f"{inst.symbol}: {', '.join(bad)} price outside the ±{int(PRICE_BAND_PCT * 100)}% band")
            continue
        if p.get("order_type") == "LMT" and p.get("limit_price") is None:
            dropped.append(f"{inst.symbol}: limit order without a price")
            continue
        conf = p.get("confidence")
        ok.append({**p, "symbol": inst.symbol, "qty": qty,
                   "confidence": round(min(1.0, max(0.0, conf)), 2) if isinstance(conf, (int, float)) else None})
    return ok, dropped


async def ask(owner: str, question: str, snapshot: dict, venue) -> dict:
    question = (question or "").strip()[:MAX_QUESTION_CHARS]
    if not question:
        raise AdvisorUnavailable("Ask a question first.")
    b = _bin()
    if not b:
        raise AdvisorUnavailable(status()["reason"])
    if not _rate_ok(owner):
        raise AdvisorUnavailable(f"You've reached {PER_USER_PER_HOUR} questions this hour. Try again later.")

    args = [b, "-p", "--output-format", "json", "--json-schema", json.dumps(SCHEMA),
            "--tools", "", "--strict-mcp-config", "--no-session-persistence",
            "--system-prompt", SYSTEM_PROMPT,
            "--model", os.getenv("ADVISOR_MODEL", "opus"),
            "--effort", os.getenv("ADVISOR_EFFORT", "medium"),
            "--max-budget-usd", os.getenv("ADVISOR_MAX_USD", "0.50")]
    started = time.time()
    async with _sem:
        with tempfile.TemporaryDirectory(prefix="advisor-") as cwd:     # no project files, no CLAUDE.md
            proc = await asyncio.create_subprocess_exec(
                *args, cwd=cwd, stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            try:
                out, err = await asyncio.wait_for(proc.communicate(_prompt(owner, question, snapshot).encode()),
                                                  timeout=TIMEOUT_S)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                raise AdvisorUnavailable("The advisor took too long to answer. Try a narrower question.") from None
    try:
        res = json.loads(out.decode() or "{}")
    except ValueError:
        logger.warning(f"advisor: unreadable CLI output (exit {proc.returncode}): {err.decode()[:300]}")
        raise AdvisorUnavailable("The advisor returned an unreadable answer.") from None
    if res.get("is_error") or "structured_output" not in res:
        msg = str(res.get("result") or err.decode() or "unknown error")[:300]
        logger.warning(f"advisor: CLI error: {msg}")
        if "not logged in" in msg.lower() or "/login" in msg or "authentication" in msg.lower():
            raise AdvisorUnavailable("The Claude Code CLI on the server isn't logged in, so only rule-based ideas are available.")
        raise AdvisorUnavailable("The advisor couldn't answer just now. The rule-based ideas are still current.")

    data = res["structured_output"]
    proposals, dropped = validate_proposals(data.get("proposals", []), venue)
    hist = _history.setdefault(owner, deque(maxlen=HISTORY_TURNS * 2))
    hist.append(("user", question))
    hist.append(("advisor", data.get("answer", "")))
    model = next(iter(res.get("modelUsage") or {}), None)
    return {"answer": data.get("answer", ""), "proposals": proposals, "dropped": dropped,
            "follow_ups": data.get("follow_ups", [])[:3], "model": model,
            "cost_usd": res.get("total_cost_usd"), "seconds": round(time.time() - started, 1)}
