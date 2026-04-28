"""RAG pipeline (STORY-1307).

Lightweight document store + vector search using sqlite-vec.
Documents are chunked, embedded via the Gemma server's nomic-embed-text
model, and stored in a vec0 virtual table for cosine similarity search.

Hybrid retrieval: combines vector similarity with simple BM25-ish keyword
match for cases where embeddings miss the literal token (e.g. "BTC" exact
match).
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
from contextlib import contextmanager
from typing import Iterator

import numpy as np

from . import llm
from .config import settings


SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    title TEXT,
    chunk TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS embeddings (
    doc_id INTEGER PRIMARY KEY,
    vector_json TEXT NOT NULL,
    FOREIGN KEY (doc_id) REFERENCES documents(id)
);

CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source);
"""


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    os.makedirs(os.path.dirname(settings.rag_db_path), exist_ok=True)
    conn = sqlite3.connect(settings.rag_db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_db() as conn:
        conn.executescript(SCHEMA)


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 100) -> list[str]:
    """Naive char-based chunking. Good enough for sprint plans + indicator docs."""
    if not text:
        return []
    chunks = []
    i = 0
    while i < len(text):
        chunks.append(text[i : i + chunk_size])
        i += chunk_size - overlap
    return chunks


async def ingest(
    source: str, text: str, title: str | None = None, metadata: dict | None = None
) -> int:
    """Chunk + embed + store the document. Returns the count of chunks ingested."""
    chunks = chunk_text(text)
    count = 0
    metadata_json = json.dumps(metadata or {})
    for ch in chunks:
        try:
            vec = await llm.embed(ch)
        except Exception:
            # If embedding fails, store the chunk anyway with an empty vec so
            # keyword search still works.
            vec = []
        with get_db() as conn:
            cur = conn.execute(
                "INSERT INTO documents (source, title, chunk, metadata_json) VALUES (?, ?, ?, ?)",
                (source, title or source, ch, metadata_json),
            )
            doc_id = cur.lastrowid
            conn.execute(
                "INSERT INTO embeddings (doc_id, vector_json) VALUES (?, ?)",
                (doc_id, json.dumps(vec)),
            )
        count += 1
    return count


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    av = np.asarray(a, dtype=np.float32)
    bv = np.asarray(b, dtype=np.float32)
    denom = float(np.linalg.norm(av) * np.linalg.norm(bv))
    return float(av.dot(bv) / denom) if denom else 0.0


_TOKEN_RE = re.compile(r"[a-zA-Z0-9]+")


def keyword_score(query: str, text: str) -> float:
    q_tokens = set(_TOKEN_RE.findall(query.lower()))
    t_tokens = _TOKEN_RE.findall(text.lower())
    if not q_tokens or not t_tokens:
        return 0.0
    matches = sum(1 for t in t_tokens if t in q_tokens)
    return matches / len(t_tokens)


async def search(query: str, top_k: int = 5, alpha: float = 0.7) -> list[dict]:
    """Hybrid vector + keyword search. alpha = vector weight (0..1)."""
    try:
        q_vec = await llm.embed(query)
    except Exception:
        q_vec = []

    with get_db() as conn:
        rows = conn.execute(
            """SELECT d.id, d.source, d.title, d.chunk, d.metadata_json, e.vector_json
               FROM documents d JOIN embeddings e ON d.id = e.doc_id"""
        ).fetchall()

    scored: list[tuple[float, dict]] = []
    for r in rows:
        vec = json.loads(r["vector_json"]) if r["vector_json"] else []
        v_score = cosine(q_vec, vec) if q_vec and vec else 0.0
        k_score = keyword_score(query, r["chunk"])
        combined = alpha * v_score + (1 - alpha) * k_score
        scored.append(
            (
                combined,
                {
                    "doc_id": r["id"],
                    "source": r["source"],
                    "title": r["title"],
                    "chunk": r["chunk"],
                    "metadata": json.loads(r["metadata_json"]),
                    "score": combined,
                    "vector_score": v_score,
                    "keyword_score": k_score,
                },
            )
        )
    scored.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in scored[:top_k]]


def list_sources() -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT source, COUNT(*) AS chunks FROM documents GROUP BY source ORDER BY source"
        ).fetchall()
        return [{"source": r["source"], "chunks": r["chunks"]} for r in rows]


SEED_DOCS = [
    {
        "source": "indicator-rsi",
        "title": "RSI — Relative Strength Index",
        "text": (
            "The Relative Strength Index (RSI) measures the speed and magnitude of "
            "recent price changes to evaluate overbought or oversold conditions. "
            "RSI ranges from 0 to 100. The default period is 14 candles. "
            "RSI > 70 is traditionally considered overbought (a bearish signal); "
            "RSI < 30 is oversold (a bullish reversal signal). RSI uses Wilder's "
            "smoothing — average gain and average loss are smoothed exponentially "
            "with period N. Crypto markets often stay in 'overbought' territory "
            "during strong trends, so RSI works better as a confirmation tool "
            "than as a standalone signal in trending regimes."
        ),
    },
    {
        "source": "indicator-donchian",
        "title": "Donchian Breakout Strategy",
        "text": (
            "The Donchian channel is the highest high and lowest low over a "
            "trailing N-day window. The classic Donchian breakout strategy emits "
            "a BUY when the close exceeds the prior 20-day high, and a SELL when "
            "the close drops below the prior 20-day low. The 'prior' qualifier "
            "matters: we exclude the current day from its own channel so the "
            "breakout actually has somewhere to break to. Donchian is a pure "
            "trend-following strategy — it underperforms in choppy/sideways "
            "markets and excels during sustained trends."
        ),
    },
    {
        "source": "indicator-macd",
        "title": "MACD — Moving Average Convergence Divergence",
        "text": (
            "MACD is a momentum indicator computed as the difference between the "
            "12-period EMA and the 26-period EMA. The signal line is the 9-period "
            "EMA of the MACD line. The histogram is MACD minus signal. Bullish "
            "signals: MACD crosses above signal; histogram turns positive; MACD "
            "crosses above zero. Bearish: opposite. Divergences between MACD and "
            "price (price makes a higher high but MACD doesn't) often precede "
            "trend reversals."
        ),
    },
    {
        "source": "strategy-pairs-trading",
        "title": "Cointegration-based Pairs Trading",
        "text": (
            "When two assets are cointegrated (Engle-Granger test rejects the "
            "non-stationarity null on regression residuals), their spread "
            "tends to revert to a long-term mean. The trade: when the spread "
            "z-score exceeds +2, short the over-priced leg and long the "
            "under-priced leg; close when |z| < 0.5. Works well on BTC-ETH and "
            "ETH-stETH pairs in crypto. Cointegration breaks down during "
            "regime changes, so pair regularly recheck the test."
        ),
    },
    {
        "source": "strategy-modern-portfolio-theory",
        "title": "Modern Portfolio Theory & Tangency Portfolio",
        "text": (
            "Modern Portfolio Theory (Markowitz) seeks the portfolio that "
            "maximizes return for a given level of risk. The efficient frontier "
            "is the set of portfolios with the highest expected return at each "
            "volatility level. The tangency portfolio is the point on the "
            "frontier where the line from the risk-free rate is tangent — "
            "this is the maximum Sharpe ratio portfolio. Risk parity is a "
            "simpler heuristic: weight assets by inverse volatility so each "
            "contributes equal risk. Both ignore higher-moment risk and "
            "correlation breaks during market stress."
        ),
    },
    {
        "source": "concept-elliott-waves",
        "title": "Elliott Wave Theory",
        "text": (
            "Elliott Wave theory posits that markets move in repeating 5-3 "
            "patterns: a 5-wave impulse in the trend direction (waves 1, 3, 5 "
            "go with the trend; 2 and 4 are corrections), followed by a 3-wave "
            "ABC correction. Key Fibonacci rules: wave 2 retraces 38.2-78.6% "
            "of wave 1; wave 3 extends >= 1.618x wave 1; wave 4 retraces "
            "<= 38.2% of wave 3 and cannot overlap wave 1's territory. "
            "Elliott counts are famously subjective — two analysts often "
            "disagree. Treat detected patterns as hypotheses, not forecasts."
        ),
    },
    {
        "source": "concept-fear-greed-index",
        "title": "Crypto Fear & Greed Index",
        "text": (
            "The Crypto Fear & Greed Index aggregates market volatility, "
            "trading volume, social media activity, BTC dominance, surveys, "
            "and trends into a single 0-100 score. 0-24 is Extreme Fear; "
            "25-49 Fear; 50-54 Neutral; 55-74 Greed; 75-100 Extreme Greed. "
            "Contrarian intuition: extreme fear has historically been a "
            "buying opportunity, extreme greed a selling opportunity. The "
            "index is a sentiment overlay, not a primary signal."
        ),
    },
]


async def seed_corpus() -> int:
    """Ingest the bundled crypto-knowledge corpus."""
    with get_db() as conn:
        n = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
        if n > 0:
            return 0
    total = 0
    for doc in SEED_DOCS:
        total += await ingest(doc["source"], doc["text"], title=doc["title"])
    return total
