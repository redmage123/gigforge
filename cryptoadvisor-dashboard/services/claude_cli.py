"""Shared Claude CLI helper — strips CLAUDECODE env var to allow nested calls."""

import asyncio
import os

from services.sanitize import sanitize_claude_prompt


async def ask_claude(prompt: str) -> str:
    """Shell out to Claude CLI and return the response."""
    prompt = sanitize_claude_prompt(prompt)
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
    try:
        proc = await asyncio.create_subprocess_exec(
            "claude", "--mcp-config", "/home/bbrelin/.claude/empty-mcp.json",
            "--model", "sonnet", "-p", prompt,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            return f"Error: {stderr.decode().strip()}"
        return stdout.decode().strip()
    except Exception as e:
        return f"Error: {str(e)}"
