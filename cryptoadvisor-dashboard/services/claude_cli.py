"""Shared Claude CLI helper — runs `claude -p` as a plain text-in/text-out model call.

Auth comes from the environment: CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`) or
ANTHROPIC_API_KEY. The CLAUDECODE env var is stripped to allow nested calls.
"""

import asyncio
import os
import tempfile
from dataclasses import dataclass

from services.sanitize import sanitize_claude_prompt

DEFAULT_MODEL = os.getenv("CLAUDE_CLI_MODEL", "sonnet")
TIMEOUT_S = float(os.getenv("CLAUDE_CLI_TIMEOUT", "180"))

# Run from an empty directory so the CLI never picks up project files (CLAUDE.md etc.)
_WORKDIR = tempfile.mkdtemp(prefix="claude-cli-")


@dataclass(frozen=True)
class ClaudeResult:
    ok: bool
    text: str  # the reply when ok, otherwise a human-readable error


def cli_auth_configured() -> bool:
    return bool(os.getenv("CLAUDE_CODE_OAUTH_TOKEN") or os.getenv("ANTHROPIC_API_KEY"))


async def run_claude(prompt: str, system: str | None = None, model: str = DEFAULT_MODEL) -> ClaudeResult:
    """One-shot `claude -p` call with tools, MCP servers and session saving disabled."""
    args = [
        "claude", "-p", prompt,
        "--model", model,
        "--tools", "",
        "--strict-mcp-config", "--mcp-config", '{"mcpServers": {}}',
        "--disable-slash-commands",
        "--no-session-persistence",
    ]
    if system:
        args += ["--system-prompt", system]
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
    try:
        proc = await asyncio.create_subprocess_exec(
            *args, cwd=_WORKDIR, env=env,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        return ClaudeResult(False, "Claude CLI not found. Ensure 'claude' is on PATH.")
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), TIMEOUT_S)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return ClaudeResult(False, f"Claude CLI timed out after {TIMEOUT_S:.0f}s")
    if proc.returncode != 0:
        # The CLI prints auth/API errors on stdout in -p mode
        detail = (stderr.decode().strip() or stdout.decode().strip())[:500]
        return ClaudeResult(False, detail or f"Claude CLI exited with {proc.returncode}")
    return ClaudeResult(True, stdout.decode().strip())


async def ask_claude(prompt: str) -> str:
    """Shell out to Claude CLI and return the response (or an "Error: ..." string)."""
    result = await run_claude(sanitize_claude_prompt(prompt))
    return result.text if result.ok else f"Error: {result.text}"
