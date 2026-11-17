"""Document storage: every JSON record the app keeps, addressed by (namespace, key).

Backends:
  * Postgres (DATABASE_URL set; production): table `documents`, one row per (ns, key), JSONB data,
    a version counter, and updated_at. `update()` runs read-modify-write in one transaction with a
    row lock, so two requests can't silently overwrite each other's changes.
  * Files (no DATABASE_URL; local dev and tests): DATA_DIR/<ns>/<key>.json, the app's original layout.

Namespaces are per-user collections (key = username: "trades", "alerts", …) or SHARED (key = record
name: "users", "sessions", …). Binary files (statement PDFs) go in `blobs`.
"""

import copy
import json
import os
import threading
from typing import Any, Callable

from services.sanitize import sanitize_filename

SHARED = "_shared"
_file_lock = threading.RLock()
_pool = None
_pool_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    ns          text        NOT NULL,
    key         text        NOT NULL,
    data        jsonb       NOT NULL,
    version     bigint      NOT NULL DEFAULT 1,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (ns, key)
);
CREATE INDEX IF NOT EXISTS documents_key_idx ON documents (key);
CREATE TABLE IF NOT EXISTS blobs (
    ns           text        NOT NULL,
    key          text        NOT NULL,
    data         bytea       NOT NULL,
    content_type text        NOT NULL DEFAULT 'application/octet-stream',
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (ns, key)
);
"""


def _url() -> str | None:
    return os.environ.get("DATABASE_URL") or None


def using_postgres() -> bool:
    return _url() is not None


def pool():
    """Shared psycopg connection pool (created on first use; schema ensured once)."""
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                from psycopg_pool import ConnectionPool

                p = ConnectionPool(_url(), min_size=1, max_size=int(os.environ.get("DB_POOL_MAX", "10")),
                                   kwargs={"autocommit": False}, open=True, name="assetadvisor")
                with p.connection() as conn:
                    conn.execute(SCHEMA)
                _pool = p
    return _pool


def _k(key: str) -> str:
    k = sanitize_filename(str(key))
    if not k:
        raise ValueError("empty storage key")
    return k


def _n(ns: str) -> str:
    return SHARED if ns == SHARED else _k(ns)


# ── File backend helpers ───────────────────────────────────────────────────

def _data_dir():
    from services import user_data  # tests point user_data.DATA_DIR at a temp dir

    return user_data.DATA_DIR


def _path(ns: str, key: str):
    return _data_dir() / f"{key}.json" if ns == SHARED else _data_dir() / ns / f"{key}.json"


def _file_read(ns: str, key: str):
    p = _path(ns, key)
    if not p.exists():
        return None
    return json.loads(p.read_text())


def _file_write(ns: str, key: str, data) -> None:
    p = _path(ns, key)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, default=str))
    tmp.replace(p)


# ── API ────────────────────────────────────────────────────────────────────

def get(ns: str, key: str, default: Any = None) -> Any:
    ns, key = _n(ns), _k(key)
    if not using_postgres():
        with _file_lock:
            v = _file_read(ns, key)
        return copy.deepcopy(default) if v is None else v
    with pool().connection() as conn:
        row = conn.execute("SELECT data FROM documents WHERE ns = %s AND key = %s", (ns, key)).fetchone()
    return copy.deepcopy(default) if row is None else row[0]


def put(ns: str, key: str, data: Any) -> None:
    ns, key = _n(ns), _k(key)
    if not using_postgres():
        with _file_lock:
            _file_write(ns, key, data)
        return
    payload = json.dumps(data, default=str)
    with pool().connection() as conn:
        conn.execute(
            "INSERT INTO documents (ns, key, data) VALUES (%s, %s, %s::jsonb) "
            "ON CONFLICT (ns, key) DO UPDATE SET data = EXCLUDED.data, version = documents.version + 1, updated_at = now()",
            (ns, key, payload))


def update(ns: str, key: str, fn: Callable[[Any], Any], default: Any = None) -> Any:
    """Atomically replace the record with fn(current). Returns the new value."""
    ns, key = _n(ns), _k(key)
    if not using_postgres():
        with _file_lock:
            cur = _file_read(ns, key)
            new = fn(copy.deepcopy(default) if cur is None else cur)
            _file_write(ns, key, new)
        return new
    with pool().connection() as conn:
        with conn.transaction():
            # Make sure a row exists to lock, then lock it for the read-modify-write
            conn.execute("INSERT INTO documents (ns, key, data) VALUES (%s, %s, %s::jsonb) ON CONFLICT DO NOTHING",
                         (ns, key, json.dumps(default, default=str)))
            row = conn.execute("SELECT data FROM documents WHERE ns = %s AND key = %s FOR UPDATE", (ns, key)).fetchone()
            new = fn(row[0])
            conn.execute("UPDATE documents SET data = %s::jsonb, version = version + 1, updated_at = now() "
                         "WHERE ns = %s AND key = %s", (json.dumps(new, default=str), ns, key))
    return new


def delete(ns: str, key: str) -> bool:
    ns, key = _n(ns), _k(key)
    if not using_postgres():
        with _file_lock:
            p = _path(ns, key)
            if p.exists():
                p.unlink()
                return True
            return False
    with pool().connection() as conn:
        return conn.execute("DELETE FROM documents WHERE ns = %s AND key = %s", (ns, key)).rowcount > 0


def keys(ns: str) -> list[str]:
    """All keys in a namespace (e.g. every username with trades)."""
    ns = _n(ns)
    if not using_postgres():
        d = _data_dir() / ns
        return sorted(f.stem for f in d.glob("*.json")) if d.is_dir() else []
    with pool().connection() as conn:
        return [r[0] for r in conn.execute("SELECT key FROM documents WHERE ns = %s ORDER BY key", (ns,))]


def delete_owner(key: str) -> int:
    """Account deletion: remove the user's record in every per-user namespace."""
    key = _k(key)
    if not using_postgres():
        n = 0
        if not _data_dir().is_dir():
            return 0
        import shutil

        with _file_lock:
            for d in _data_dir().iterdir():
                if not d.is_dir():
                    continue
                f = d / f"{key}.json"
                if f.is_file():
                    f.unlink()
                    n += 1
                if (d / key).is_dir():  # blobs stored under <ns>/<user>/…
                    shutil.rmtree(d / key)
                    n += 1
        return n
    with pool().connection() as conn:
        n = conn.execute("DELETE FROM documents WHERE key = %s AND ns <> %s", (key, SHARED)).rowcount
        n += conn.execute("DELETE FROM blobs WHERE key LIKE %s", (f"{key}/%",)).rowcount
    return n


# ── Blobs ──────────────────────────────────────────────────────────────────

def put_blob(ns: str, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    if not using_postgres():
        p = _data_dir() / _n(ns) / key
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return
    with pool().connection() as conn:
        conn.execute("INSERT INTO blobs (ns, key, data, content_type) VALUES (%s, %s, %s, %s) "
                     "ON CONFLICT (ns, key) DO UPDATE SET data = EXCLUDED.data, content_type = EXCLUDED.content_type, created_at = now()",
                     (_n(ns), key, data, content_type))


def get_blob(ns: str, key: str) -> bytes | None:
    if not using_postgres():
        p = _data_dir() / _n(ns) / key
        return p.read_bytes() if p.is_file() else None
    with pool().connection() as conn:
        row = conn.execute("SELECT data FROM blobs WHERE ns = %s AND key = %s", (_n(ns), key)).fetchone()
    return bytes(row[0]) if row else None


def list_blobs(ns: str, prefix: str) -> list[tuple[str, int]]:
    """[(key, size)] for keys starting with prefix."""
    if not using_postgres():
        base = _data_dir() / _n(ns)
        d = base / prefix
        return [(str(f.relative_to(base)), f.stat().st_size) for f in sorted(d.glob("*")) if f.is_file()] if d.is_dir() else []
    with pool().connection() as conn:
        return [(r[0], r[1]) for r in conn.execute(
            "SELECT key, length(data) FROM blobs WHERE ns = %s AND key LIKE %s ORDER BY key", (_n(ns), prefix + "%"))]


def ping() -> bool:
    if not using_postgres():
        d = _data_dir()
        d.mkdir(parents=True, exist_ok=True)
        return os.access(d, os.W_OK)
    with pool().connection() as conn:
        return conn.execute("SELECT 1").fetchone()[0] == 1
