"""NLP Knowledge Graph (STORY-1306).

SQLite-backed KG of entities + relations. Bootstraps with crypto domain
knowledge: assets, indicators, strategies, market events, signal types.
Auto-populates cross-asset relations as cointegration / lead-lag results
flow in via /kg/upsert.

Tables:
  entities (id PRIMARY KEY, name, type, props_json)
  relations (src, dst, type, props_json, PRIMARY KEY (src, dst, type))

Query API is intentionally small: get_entity, get_relations, neighbors,
shortest_path, upsert_entity, upsert_relation.
"""
from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from typing import Iterator

from .config import settings

# ---------- Schema bootstrap ----------

SCHEMA = """
CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    props_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS relations (
    src TEXT NOT NULL,
    dst TEXT NOT NULL,
    type TEXT NOT NULL,
    props_json TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (src, dst, type),
    FOREIGN KEY (src) REFERENCES entities(id),
    FOREIGN KEY (dst) REFERENCES entities(id)
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_relations_src ON relations(src);
CREATE INDEX IF NOT EXISTS idx_relations_dst ON relations(dst);
"""

SEED_ENTITIES = [
    # Assets
    {"id": "asset:BTC", "name": "Bitcoin", "type": "asset",
     "props": {"symbol": "BTC", "chain": "Bitcoin", "consensus": "PoW", "since": "2009"}},
    {"id": "asset:ETH", "name": "Ethereum", "type": "asset",
     "props": {"symbol": "ETH", "chain": "Ethereum", "consensus": "PoS", "since": "2015"}},
    {"id": "asset:SOL", "name": "Solana", "type": "asset",
     "props": {"symbol": "SOL", "chain": "Solana", "consensus": "PoH", "since": "2020"}},
    {"id": "asset:ADA", "name": "Cardano", "type": "asset",
     "props": {"symbol": "ADA", "chain": "Cardano", "consensus": "Ouroboros PoS", "since": "2017"}},

    # Indicators
    {"id": "indicator:sma", "name": "Simple Moving Average", "type": "indicator",
     "props": {"category": "trend", "params": "period"}},
    {"id": "indicator:ema", "name": "Exponential Moving Average", "type": "indicator",
     "props": {"category": "trend", "params": "period"}},
    {"id": "indicator:rsi", "name": "Relative Strength Index", "type": "indicator",
     "props": {"category": "momentum", "default_period": 14, "overbought": 70, "oversold": 30}},
    {"id": "indicator:macd", "name": "Moving Average Convergence Divergence", "type": "indicator",
     "props": {"category": "momentum", "default": "12,26,9"}},
    {"id": "indicator:bollinger", "name": "Bollinger Bands", "type": "indicator",
     "props": {"category": "volatility", "default_period": 20, "default_k": 2}},
    {"id": "indicator:atr", "name": "Average True Range", "type": "indicator",
     "props": {"category": "volatility", "default_period": 14}},
    {"id": "indicator:donchian", "name": "Donchian Channel", "type": "indicator",
     "props": {"category": "breakout", "default_period": 20}},
    {"id": "indicator:elliott", "name": "Elliott Wave", "type": "indicator",
     "props": {"category": "pattern", "subjective": True}},

    # Strategies
    {"id": "strategy:donchian-breakout", "name": "Donchian Breakout", "type": "strategy",
     "props": {"signal": "BUY on close > 20d high; SELL on close < 20d low"}},
    {"id": "strategy:pairs-cointegration", "name": "Cointegration Pairs Trading", "type": "strategy",
     "props": {"signal": "Open spread when |z| > 2; close when |z| < 0.5"}},
    {"id": "strategy:risk-parity", "name": "Risk Parity", "type": "strategy",
     "props": {"basis": "Inverse-volatility weighting"}},
    {"id": "strategy:tangency", "name": "Max Sharpe Tangency", "type": "strategy",
     "props": {"basis": "Modern Portfolio Theory; max Sharpe portfolio on the efficient frontier"}},
    {"id": "strategy:mean-reversion", "name": "Mean Reversion (z-score)", "type": "strategy",
     "props": {"signal": "Open short when z > 2; long when z < -2"}},

    # Market events
    {"id": "event:btc-halving-2024", "name": "Bitcoin Halving April 2024", "type": "event",
     "props": {"date": "2024-04-19", "block": 840000, "reward": "3.125 BTC"}},
    {"id": "event:btc-halving-2028", "name": "Bitcoin Halving 2028 (expected)", "type": "event",
     "props": {"date": "2028 (estimated)", "block": 1050000, "reward": "1.5625 BTC"}},
    {"id": "event:ftx-collapse", "name": "FTX Collapse", "type": "event",
     "props": {"date": "2022-11-11"}},
    {"id": "event:btc-etf-approval", "name": "Bitcoin Spot ETF Approval", "type": "event",
     "props": {"date": "2024-01-10"}},

    # Signal types
    {"id": "signal-type:breakout", "name": "Breakout", "type": "signal-type",
     "props": {"description": "Price closes above a resistance / below a support level"}},
    {"id": "signal-type:divergence", "name": "Divergence", "type": "signal-type",
     "props": {"description": "Price and indicator move in opposite directions"}},
    {"id": "signal-type:regime-change", "name": "Regime Change", "type": "signal-type",
     "props": {"description": "HMM-detected transition between bull/bear/sideways states"}},
]

SEED_RELATIONS = [
    # Strategy → indicator dependencies
    ("strategy:donchian-breakout", "indicator:donchian", "uses"),
    ("strategy:tangency", "indicator:rsi", "informs"),
    ("strategy:mean-reversion", "indicator:bollinger", "uses"),
    # Asset relationships
    ("asset:BTC", "asset:ETH", "leads"),
    ("asset:BTC", "asset:SOL", "leads"),
    ("asset:BTC", "asset:ADA", "leads"),
    # Events affect assets
    ("event:btc-halving-2024", "asset:BTC", "affects"),
    ("event:btc-halving-2028", "asset:BTC", "affects"),
    ("event:ftx-collapse", "asset:BTC", "affects"),
    ("event:ftx-collapse", "asset:ETH", "affects"),
    ("event:btc-etf-approval", "asset:BTC", "affects"),
    # Signal types
    ("strategy:donchian-breakout", "signal-type:breakout", "emits"),
]


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    os.makedirs(os.path.dirname(settings.kg_db_path), exist_ok=True)
    conn = sqlite3.connect(settings.kg_db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_db() as conn:
        conn.executescript(SCHEMA)
        # Seed only if empty
        cur = conn.execute("SELECT COUNT(*) FROM entities")
        if cur.fetchone()[0] > 0:
            return
        for e in SEED_ENTITIES:
            conn.execute(
                "INSERT OR IGNORE INTO entities (id, name, type, props_json) VALUES (?, ?, ?, ?)",
                (e["id"], e["name"], e["type"], json.dumps(e["props"])),
            )
        for src, dst, rtype in SEED_RELATIONS:
            conn.execute(
                "INSERT OR IGNORE INTO relations (src, dst, type, props_json) VALUES (?, ?, ?, ?)",
                (src, dst, rtype, "{}"),
            )


# ---------- Public API ----------


def upsert_entity(entity_id: str, name: str, type_: str, props: dict | None = None) -> None:
    with get_db() as conn:
        conn.execute(
            """INSERT INTO entities (id, name, type, props_json) VALUES (?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type,
                   props_json=excluded.props_json""",
            (entity_id, name, type_, json.dumps(props or {})),
        )


def upsert_relation(
    src: str, dst: str, type_: str, props: dict | None = None
) -> None:
    with get_db() as conn:
        conn.execute(
            """INSERT INTO relations (src, dst, type, props_json) VALUES (?, ?, ?, ?)
               ON CONFLICT(src, dst, type) DO UPDATE SET props_json=excluded.props_json""",
            (src, dst, type_, json.dumps(props or {})),
        )


def get_entity(entity_id: str) -> dict | None:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM entities WHERE id = ?", (entity_id,)).fetchone()
        if row is None:
            return None
        d = dict(row)
        d["props"] = json.loads(d.pop("props_json"))
        return d


def list_entities(type_: str | None = None) -> list[dict]:
    with get_db() as conn:
        if type_:
            rows = conn.execute(
                "SELECT * FROM entities WHERE type = ? ORDER BY name", (type_,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM entities ORDER BY type, name").fetchall()
        out = []
        for row in rows:
            d = dict(row)
            d["props"] = json.loads(d.pop("props_json"))
            out.append(d)
        return out


def neighbors(entity_id: str, depth: int = 1) -> list[dict]:
    """Return outgoing + incoming neighbors up to `depth` hops."""
    with get_db() as conn:
        seen = {entity_id}
        frontier = {entity_id}
        result_relations = []
        for _ in range(depth):
            next_frontier = set()
            placeholders = ",".join("?" * len(frontier))
            rows = conn.execute(
                f"""SELECT src, dst, type, props_json FROM relations
                    WHERE src IN ({placeholders}) OR dst IN ({placeholders})""",
                list(frontier) + list(frontier),
            ).fetchall()
            for r in rows:
                d = dict(r)
                d["props"] = json.loads(d.pop("props_json"))
                result_relations.append(d)
                for n in (d["src"], d["dst"]):
                    if n not in seen:
                        next_frontier.add(n)
                        seen.add(n)
            frontier = next_frontier
            if not frontier:
                break
        # Resolve all touched entities
        placeholders = ",".join("?" * len(seen))
        ent_rows = conn.execute(
            f"SELECT * FROM entities WHERE id IN ({placeholders})", list(seen)
        ).fetchall()
        entities = []
        for row in ent_rows:
            d = dict(row)
            d["props"] = json.loads(d.pop("props_json"))
            entities.append(d)
        return [{"entities": entities, "relations": result_relations}]


def context_for_asset(symbol: str) -> str:
    """Build a short text block summarizing what the KG knows about a symbol.
    Used as system-prompt context for the LLM (STORY-1308)."""
    eid = f"asset:{symbol}"
    asset = get_entity(eid)
    if not asset:
        return ""
    nb = neighbors(eid, depth=1)
    ents_by_id = {e["id"]: e for e in nb[0]["entities"]} if nb else {}
    relations = nb[0]["relations"] if nb else []
    lines = [f"{asset['name']} ({symbol}) — {asset['props']}"]
    for r in relations:
        other_id = r["dst"] if r["src"] == eid else r["src"]
        other = ents_by_id.get(other_id)
        if other:
            arrow = "→" if r["src"] == eid else "←"
            lines.append(f"  {arrow} [{r['type']}] {other['name']} ({other['type']})")
    return "\n".join(lines)
