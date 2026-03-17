"""Input sanitization utilities — text, filenames, blockchain addresses, prompts."""

import re
import html


def sanitize_text(text: str, max_length: int = 5000) -> str:
    """Sanitize user text input — strip dangerous chars, limit length."""
    if not isinstance(text, str):
        return ""
    text = text[:max_length]
    text = html.escape(text)
    return text


def sanitize_filename(name: str) -> str:
    """Sanitize a string for use in file paths."""
    name = re.sub(r'[^a-zA-Z0-9_-]', '', name)
    return name[:100] if name else "unknown"


def sanitize_address(address: str) -> str:
    """Validate and sanitize a blockchain address."""
    address = address.strip()
    # EVM address
    if re.match(r'^0x[a-fA-F0-9]{40}$', address):
        return address
    # Solana (base58, 32-44 chars)
    if re.match(r'^[1-9A-HJ-NP-Za-km-z]{32,44}$', address):
        return address
    # Bitcoin (bech32 or base58)
    if re.match(r'^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$', address):
        return address
    raise ValueError(f"Invalid blockchain address format: {address[:20]}...")


def sanitize_claude_prompt(prompt: str) -> str:
    """Sanitize text before sending to Claude CLI to prevent prompt injection."""
    prompt = prompt[:10000]  # Hard limit
    # Remove potential shell escape sequences
    prompt = prompt.replace('`', "'").replace('$', "").replace('\\', "")
    return prompt
