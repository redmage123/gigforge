"""Per-user RAG memory — stores and retrieves facts for personalized AI context.

Uses SQLite FTS5 for full-text search (BM25 ranking) so relevant facts are
injected into LLM prompts automatically. No external vector DB needed.
"""

import json
import logging
import re
from typing import Optional

from services.database import get_db

logger = logging.getLogger(__name__)

# ── Schema (called from init_memory_tables) ──────────────────────────────────

_MEMORY_SCHEMA = """
CREATE TABLE IF NOT EXISTS user_memories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT    NOT NULL,
    fact        TEXT    NOT NULL,
    category    TEXT    NOT NULL DEFAULT 'general',
    source      TEXT    NOT NULL DEFAULT 'chat',
    confidence  REAL    NOT NULL DEFAULT 1.0,
    access_count INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memories_username ON user_memories(username);
CREATE INDEX IF NOT EXISTS idx_memories_category ON user_memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_user_cat ON user_memories(username, category);

-- FTS5 virtual table for full-text search with BM25 ranking
CREATE VIRTUAL TABLE IF NOT EXISTS user_memories_fts USING fts5(
    fact,
    category,
    content='user_memories',
    content_rowid='id',
    tokenize='porter unicode61'
);

-- Triggers to keep FTS index in sync
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON user_memories BEGIN
    INSERT INTO user_memories_fts(rowid, fact, category)
    VALUES (new.id, new.fact, new.category);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON user_memories BEGIN
    INSERT INTO user_memories_fts(user_memories_fts, rowid, fact, category)
    VALUES ('delete', old.id, old.fact, old.category);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON user_memories BEGIN
    INSERT INTO user_memories_fts(user_memories_fts, rowid, fact, category)
    VALUES ('delete', old.id, old.fact, old.category);
    INSERT INTO user_memories_fts(rowid, fact, category)
    VALUES (new.id, new.fact, new.category);
END;
"""

# Categories for organizing facts
CATEGORIES = [
    "portfolio",       # holdings, allocations, wallet info
    "strategy",        # trading strategies, preferences
    "risk_profile",    # risk tolerance, limits
    "goals",           # financial goals, targets
    "preferences",     # UI, notification, analysis preferences
    "knowledge",       # things the user has told the AI they know/don't know
    "market_views",    # user's opinions on specific coins/markets
    "personal",        # name, timezone, experience level
    "general",         # everything else
]

# Extraction prompt — tells Claude which facts to pull from a conversation
_EXTRACTION_TEMPLATE = """Analyze this conversation between a user and an AI crypto advisor.
Extract ONLY concrete, reusable facts about the USER (not general crypto knowledge).

Rules:
- Each fact must be a single clear statement about the user
- Skip greetings, questions, and general knowledge
- Focus on: holdings, goals, risk tolerance, preferences, strategies, experience, opinions on specific coins
- If no personal facts exist, return an empty array
- Categorize each fact

Return ONLY valid JSON (no markdown, no explanation):
[
  {{"fact": "...", "category": "portfolio|strategy|risk_profile|goals|preferences|knowledge|market_views|personal|general"}}
]

Conversation:
{conversation}"""


async def init_memory_tables():
    """Create memory tables and FTS index. Safe to call multiple times."""
    try:
        async with get_db() as db:
            await db.executescript(_MEMORY_SCHEMA)
            await db.commit()
        logger.info("Memory tables initialized")
    except Exception as e:
        logger.error("Failed to init memory tables: %s", e)


# ── CRUD ─────────────────────────────────────────────────────────────────────

async def add_fact(username: str, fact: str, category: str = "general",
                   source: str = "chat", confidence: float = 1.0) -> int:
    """Store a new fact for a user. Returns the fact ID."""
    category = category if category in CATEGORIES else "general"
    async with get_db() as db:
        cursor = await db.execute(
            """INSERT INTO user_memories (username, fact, category, source, confidence)
               VALUES (?, ?, ?, ?, ?)""",
            (username, fact.strip(), category, source, confidence),
        )
        await db.commit()
        return cursor.lastrowid


async def add_facts_bulk(username: str, facts: list[dict], source: str = "chat") -> int:
    """Store multiple facts at once. Returns count of inserted facts."""
    if not facts:
        return 0
    async with get_db() as db:
        count = 0
        for f in facts:
            fact_text = f.get("fact", "").strip()
            if not fact_text or len(fact_text) < 5:
                continue
            category = f.get("category", "general")
            if category not in CATEGORIES:
                category = "general"
            existing = await db.execute(
                "SELECT id FROM user_memories WHERE username = ? AND fact = ?",
                (username, fact_text),
            )
            if await existing.fetchone():
                continue
            await db.execute(
                """INSERT INTO user_memories (username, fact, category, source, confidence)
                   VALUES (?, ?, ?, ?, ?)""",
                (username, fact_text, category, source, f.get("confidence", 0.9)),
            )
            count += 1
        await db.commit()
        return count


async def get_facts(username: str, category: Optional[str] = None,
                    limit: int = 50) -> list[dict]:
    """Get all facts for a user, optionally filtered by category."""
    async with get_db() as db:
        if category:
            cursor = await db.execute(
                """SELECT id, fact, category, source, confidence, access_count,
                          created_at, updated_at
                   FROM user_memories WHERE username = ? AND category = ?
                   ORDER BY updated_at DESC LIMIT ?""",
                (username, category, limit),
            )
        else:
            cursor = await db.execute(
                """SELECT id, fact, category, source, confidence, access_count,
                          created_at, updated_at
                   FROM user_memories WHERE username = ?
                   ORDER BY updated_at DESC LIMIT ?""",
                (username, limit),
            )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def update_fact(username: str, fact_id: int, fact: str,
                      category: Optional[str] = None) -> bool:
    """Update an existing fact. Returns True if updated."""
    async with get_db() as db:
        if category and category in CATEGORIES:
            result = await db.execute(
                """UPDATE user_memories SET fact = ?, category = ?,
                          updated_at = datetime('now')
                   WHERE id = ? AND username = ?""",
                (fact.strip(), category, fact_id, username),
            )
        else:
            result = await db.execute(
                """UPDATE user_memories SET fact = ?, updated_at = datetime('now')
                   WHERE id = ? AND username = ?""",
                (fact.strip(), fact_id, username),
            )
        await db.commit()
        return result.rowcount > 0


async def delete_fact(username: str, fact_id: int) -> bool:
    """Delete a fact. Returns True if deleted."""
    async with get_db() as db:
        result = await db.execute(
            "DELETE FROM user_memories WHERE id = ? AND username = ?",
            (fact_id, username),
        )
        await db.commit()
        return result.rowcount > 0


async def delete_all_facts(username: str) -> int:
    """Delete all facts for a user. Returns count deleted."""
    async with get_db() as db:
        result = await db.execute(
            "DELETE FROM user_memories WHERE username = ?", (username,)
        )
        await db.commit()
        return result.rowcount


# ── Search (BM25 full-text) ─────────────────────────────────────────────────

async def search_facts(username: str, query: str, limit: int = 10) -> list[dict]:
    """Search user facts using FTS5 BM25 ranking."""
    if not query or not query.strip():
        return []

    terms = re.findall(r'\w+', query.lower())
    if not terms:
        return []

    fts_query = " OR ".join(f'"{t}"*' for t in terms[:20])

    async with get_db() as db:
        cursor = await db.execute(
            """SELECT m.id, m.fact, m.category, m.source, m.confidence,
                      m.access_count, m.created_at, m.updated_at,
                      rank AS relevance_score
               FROM user_memories m
               JOIN user_memories_fts fts ON m.id = fts.rowid
               WHERE fts.user_memories_fts MATCH ? AND m.username = ?
               ORDER BY rank
               LIMIT ?""",
            (fts_query, username, limit),
        )
        rows = await cursor.fetchall()

        fact_ids = [dict(r)["id"] for r in rows]
        if fact_ids:
            placeholders = ",".join("?" for _ in fact_ids)
            await db.execute(
                f"UPDATE user_memories SET access_count = access_count + 1 WHERE id IN ({placeholders})",
                fact_ids,
            )
            await db.commit()

        return [dict(row) for row in rows]


# ── RAG Context Builder ─────────────────────────────────────────────────────

async def build_memory_context(username: str, query: str, max_facts: int = 15) -> str:
    """Build a memory context string to inject into the LLM prompt.

    Combines:
    1. Top BM25-matched facts for the query
    2. High-confidence core facts (portfolio, goals, risk profile)
    3. Recently updated facts
    """
    seen_ids = set()
    all_facts = []

    # 1. Search-matched facts
    if query:
        matched = await search_facts(username, query, limit=8)
        for f in matched:
            if f["id"] not in seen_ids:
                seen_ids.add(f["id"])
                all_facts.append(f)

    # 2. Core facts — always include
    async with get_db() as db:
        cursor = await db.execute(
            """SELECT id, fact, category, confidence FROM user_memories
               WHERE username = ? AND category IN ('portfolio', 'goals', 'risk_profile', 'personal')
               ORDER BY confidence DESC, updated_at DESC LIMIT 8""",
            (username,),
        )
        core = await cursor.fetchall()
        for f in core:
            f = dict(f)
            if f["id"] not in seen_ids:
                seen_ids.add(f["id"])
                all_facts.append(f)

    # 3. Recently accessed facts
    async with get_db() as db:
        cursor = await db.execute(
            """SELECT id, fact, category, confidence FROM user_memories
               WHERE username = ? AND access_count > 0
               ORDER BY updated_at DESC LIMIT 5""",
            (username,),
        )
        recent = await cursor.fetchall()
        for f in recent:
            f = dict(f)
            if f["id"] not in seen_ids:
                seen_ids.add(f["id"])
                all_facts.append(f)

    if not all_facts:
        return ""

    all_facts = all_facts[:max_facts]

    lines = ["## What I know about this user:"]
    by_cat = {}
    for f in all_facts:
        cat = f.get("category", "general")
        by_cat.setdefault(cat, []).append(f["fact"])

    for cat in ["personal", "portfolio", "goals", "risk_profile", "strategy",
                "market_views", "preferences", "knowledge", "general"]:
        if cat in by_cat:
            lines.append(f"\n### {cat.replace('_', ' ').title()}")
            for fact in by_cat[cat]:
                lines.append(f"- {fact}")

    return "\n".join(lines)


# ── Fact Extraction from Conversations ───────────────────────────────────────

async def extract_facts_from_conversation(conversation: list[dict]) -> list[dict]:
    """Use Claude to extract personal facts from a conversation."""
    import asyncio

    conv_text = "\n".join(
        f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}"
        for m in conversation[-10:]
    )

    if len(conv_text) < 20:
        return []

    prompt = _EXTRACTION_TEMPLATE.format(conversation=conv_text)

    # Shell out to Claude directly to avoid sanitize_claude_prompt stripping
    # characters needed for the JSON format in the extraction prompt
    import os
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
            logger.warning("Fact extraction CLI error: %s", stderr.decode().strip())
            return []
        response = stdout.decode().strip()
    except Exception as e:
        logger.warning("Fact extraction failed: %s", e)
        return []

    try:
        match = re.search(r'\[.*\]', response, re.DOTALL)
        if match:
            facts = json.loads(match.group())
            if isinstance(facts, list):
                return [
                    f for f in facts
                    if isinstance(f, dict)
                    and isinstance(f.get("fact"), str)
                    and len(f["fact"].strip()) >= 5
                ]
    except (json.JSONDecodeError, Exception) as e:
        logger.warning("Failed to parse extracted facts: %s", e)

    return []


# ── Stats ────────────────────────────────────────────────────────────────────

async def get_memory_stats(username: str) -> dict:
    """Get memory statistics for a user."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT COUNT(*) as total FROM user_memories WHERE username = ?",
            (username,),
        )
        total = (await cursor.fetchone())[0]

        cursor = await db.execute(
            """SELECT category, COUNT(*) as count FROM user_memories
               WHERE username = ? GROUP BY category ORDER BY count DESC""",
            (username,),
        )
        by_category = {row[0]: row[1] for row in await cursor.fetchall()}

        cursor = await db.execute(
            """SELECT created_at FROM user_memories
               WHERE username = ? ORDER BY created_at ASC LIMIT 1""",
            (username,),
        )
        row = await cursor.fetchone()
        oldest = row[0] if row else None

        return {
            "total_facts": total,
            "by_category": by_category,
            "categories": CATEGORIES,
            "oldest_fact": oldest,
        }
