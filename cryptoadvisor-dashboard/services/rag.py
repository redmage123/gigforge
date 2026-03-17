"""RAG (Retrieval-Augmented Generation) service for CryptoAdvisor.

Uses SQLite FTS5 for hybrid search (BM25 keyword + category filtering).
"""

import json
import logging
import time
from typing import Optional

from services.database import get_db

logger = logging.getLogger(__name__)

RAG_SCHEMA = """
CREATE TABLE IF NOT EXISTS rag_documents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source      TEXT    NOT NULL,
    source_id   TEXT    DEFAULT '',
    title       TEXT    NOT NULL DEFAULT '',
    content     TEXT    NOT NULL,
    category    TEXT    NOT NULL DEFAULT 'general',
    tags        TEXT    NOT NULL DEFAULT '[]',
    metadata    TEXT    NOT NULL DEFAULT '{}',
    username    TEXT    NOT NULL DEFAULT '',
    created_at  REAL    NOT NULL,
    expires_at  REAL    DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_rag_source ON rag_documents(source);
CREATE INDEX IF NOT EXISTS idx_rag_category ON rag_documents(category);
CREATE INDEX IF NOT EXISTS idx_rag_username ON rag_documents(username);
CREATE INDEX IF NOT EXISTS idx_rag_created ON rag_documents(created_at);
CREATE INDEX IF NOT EXISTS idx_rag_source_id ON rag_documents(source, source_id);

CREATE VIRTUAL TABLE IF NOT EXISTS rag_fts USING fts5(
    title, content, category, tags,
    content='rag_documents', content_rowid='id',
    tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS rag_ai AFTER INSERT ON rag_documents BEGIN
    INSERT INTO rag_fts(rowid, title, content, category, tags)
    VALUES (new.id, new.title, new.content, new.category, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS rag_ad AFTER DELETE ON rag_documents BEGIN
    INSERT INTO rag_fts(rag_fts, rowid, title, content, category, tags)
    VALUES ('delete', old.id, old.title, old.content, old.category, old.tags);
END;
CREATE TRIGGER IF NOT EXISTS rag_au AFTER UPDATE ON rag_documents BEGIN
    INSERT INTO rag_fts(rag_fts, rowid, title, content, category, tags)
    VALUES ('delete', old.id, old.title, old.content, old.category, old.tags);
    INSERT INTO rag_fts(rowid, title, content, category, tags)
    VALUES (new.id, new.title, new.content, new.category, new.tags);
END;
"""

CATEGORIES = ["news", "analysis", "market_data", "alert", "conversation", "fundamentals", "trade", "research", "general"]


async def init_rag_tables():
    async with get_db() as db:
        await db.executescript(RAG_SCHEMA)
        await db.commit()


async def ingest(content: str, source: str, title: str = "", category: str = "general",
                 tags: list[str] = None, metadata: dict = None, username: str = "",
                 source_id: str = "", ttl_hours: float = 0) -> int:
    now = time.time()
    expires = now + (ttl_hours * 3600) if ttl_hours > 0 else None
    async with get_db() as db:
        cursor = await db.execute(
            "INSERT INTO rag_documents (source,source_id,title,content,category,tags,metadata,username,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (source, source_id, title, content, category, json.dumps(tags or []), json.dumps(metadata or {}), username, now, expires),
        )
        await db.commit()
        return cursor.lastrowid


async def search(query: str, limit: int = 10, category: str = "", username: str = "",
                 source: str = "", max_age_hours: float = 0) -> list[dict]:
    now = time.time()
    fts_query = " OR ".join(f'"{w}"' for w in query.split() if w.strip())
    if not fts_query:
        return []

    conditions = ["rag_fts MATCH ?"]
    params: list = [fts_query]

    if category:
        conditions.append("d.category = ?")
        params.append(category)
    if username:
        conditions.append("(d.username = ? OR d.username = '')")
        params.append(username)
    if source:
        conditions.append("d.source = ?")
        params.append(source)
    if max_age_hours > 0:
        conditions.append("d.created_at > ?")
        params.append(now - max_age_hours * 3600)
    conditions.append("(d.expires_at IS NULL OR d.expires_at > ?)")
    params.append(now)
    params.append(limit)

    where = " AND ".join(conditions)
    async with get_db() as db:
        rows = await db.execute_fetchall(
            f"""SELECT d.id, d.source, d.title, d.content, d.category, d.tags,
                       d.metadata, d.username, d.created_at, rank
                FROM rag_fts JOIN rag_documents d ON d.id = rag_fts.rowid
                WHERE {where} ORDER BY rank LIMIT ?""",
            params,
        )

    return [{
        "id": r[0], "source": r[1], "title": r[2], "content": r[3][:500],
        "full_content": r[3], "category": r[4],
        "tags": json.loads(r[5]) if r[5] else [],
        "metadata": json.loads(r[6]) if r[6] else {},
        "username": r[7], "created_at": r[8],
        "relevance_score": -r[9],
    } for r in rows]


async def get_context(query: str, username: str = "", max_tokens: int = 4000, categories: list[str] = None) -> str:
    results = []
    if categories:
        for cat in categories:
            results.extend(await search(query, limit=5, category=cat, username=username))
    else:
        results = await search(query, limit=15, username=username)

    seen = set()
    unique = [r for r in results if r["id"] not in seen and not seen.add(r["id"])]
    unique.sort(key=lambda x: x["relevance_score"], reverse=True)

    parts, total = [], 0
    for doc in unique:
        entry = f"[{doc['category'].upper()}] {doc['title']}\n{doc['full_content']}\n"
        if total + len(entry) > max_tokens * 4:
            break
        parts.append(entry)
        total += len(entry)

    return ("--- Relevant Context ---\n" + "\n---\n".join(parts)) if parts else ""


async def ingest_news_article(article: dict, username: str = ""):
    await ingest(
        content=f"{article.get('title', '')}\n\n{article.get('summary', '')}",
        source="news_scanner", title=article.get("title", ""), category="news",
        tags=article.get("coin_tags", []),
        metadata={"url": article.get("url", ""), "source": article.get("source", ""),
                  "sentiment_score": article.get("sentiment_score", 0)},
        username=username, source_id=article.get("url", ""), ttl_hours=168,
    )


async def ingest_ai_analysis(analysis: str, context: str, category: str = "analysis", username: str = "", tags: list[str] = None):
    await ingest(content=analysis, source="ai_copilot", title=context[:100], category=category, tags=tags or [], username=username, ttl_hours=72)


async def ingest_alert(alert: dict, username: str = ""):
    await ingest(
        content=f"{alert.get('coin_id', '')} — {alert.get('direction', '')} shift of {alert.get('shift', 0)} points",
        source="alert_system", title=f"Sentiment Alert: {alert.get('coin_id', '')}",
        category="alert", tags=[alert.get("coin_id", "")], metadata=alert, username=username, ttl_hours=168,
    )


async def ingest_conversation(question: str, answer: str, username: str = ""):
    await ingest(content=f"Q: {question}\n\nA: {answer}", source="user_chat", title=question[:100], category="conversation", username=username, ttl_hours=720)


async def get_stats(username: str = "") -> dict:
    now = time.time()
    async with get_db() as db:
        total = await db.execute_fetchall(
            "SELECT COUNT(*) FROM rag_documents WHERE (username=? OR username='') AND (expires_at IS NULL OR expires_at>?)", (username, now))
        by_cat = await db.execute_fetchall(
            "SELECT category, COUNT(*) FROM rag_documents WHERE (username=? OR username='') AND (expires_at IS NULL OR expires_at>?) GROUP BY category ORDER BY COUNT(*) DESC", (username, now))
        by_src = await db.execute_fetchall(
            "SELECT source, COUNT(*) FROM rag_documents WHERE (username=? OR username='') AND (expires_at IS NULL OR expires_at>?) GROUP BY source ORDER BY COUNT(*) DESC", (username, now))
    return {
        "total_documents": total[0][0] if total else 0,
        "by_category": {r[0]: r[1] for r in by_cat},
        "by_source": {r[0]: r[1] for r in by_src},
    }


async def cleanup_expired():
    async with get_db() as db:
        cursor = await db.execute("DELETE FROM rag_documents WHERE expires_at IS NOT NULL AND expires_at < ?", (time.time(),))
        await db.commit()
        return cursor.rowcount
