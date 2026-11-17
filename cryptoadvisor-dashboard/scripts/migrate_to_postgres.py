"""Copy AssetAdvisor's JSON records (and statement PDFs) from the data folder into Postgres, or back.

    python scripts/migrate_to_postgres.py import  --data /app/data [--dry-run] [--overwrite]
    python scripts/migrate_to_postgres.py verify  --data /app/data
    python scripts/migrate_to_postgres.py export  --out /tmp/records      # rollback: Postgres -> file layout

Import never deletes or changes files, and by default never overwrites a row that already exists in
Postgres (re-running is safe). Verify compares every file with its row. Needs DATABASE_URL.

File layout -> (namespace, key):
  <name>.json                         -> ("_shared", name)        users, sessions, audit_log, …
  <ns>/<user>.json                    -> (ns, user)
  settings/<user>_theme.json          -> ("theme", user)          (also _technical_layout, _widgets)
  statements/<user>/<pid>/<m>.pdf     -> blob ("statements", "<user>/<pid>/<m>.pdf")
Skipped: instruments/ (a market-data cache), memory/, *.db, *.key, *.tmp.
"""

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import store  # noqa: E402

SETTINGS_SUFFIXES = {"_technical_layout": "technical_layout", "_theme": "theme", "_widgets": "widgets"}
SKIP_DIRS = {"instruments", "memory", "users", "__pycache__"}


def plan(data: Path):
    """Yield (kind, ns, key, path) for everything to migrate, plus ("skip", reason, None, path)."""
    for p in sorted(data.iterdir()):
        if p.is_file():
            if p.name == "in_play.legacy.json":  # superseded by in_play_candidates; kept on disk only
                yield "skip", "legacy file", None, p
            elif p.suffix == ".json":
                yield "doc", store.SHARED, p.stem, p
            else:
                yield "skip", "not a JSON record", None, p
            continue
        if p.name in SKIP_DIRS:
            yield "skip", "cache or unused folder", None, p
            continue
        if p.name == "statements":
            for f in sorted(p.rglob("*.pdf")):
                yield "blob", "statements", str(f.relative_to(p)), f
            continue
        for f in sorted(p.glob("*.json")):
            ns, key = p.name, f.stem
            if p.name == "settings":
                for suffix, target in SETTINGS_SUFFIXES.items():
                    if key.endswith(suffix):
                        ns, key = target, key[: -len(suffix)]
                        break
            yield "doc", ns, key, f
        for f in sorted(x for x in p.iterdir() if x.suffix != ".json"):
            yield "skip", "not a JSON record", None, f


def do_import(data: Path, dry: bool, overwrite: bool) -> int:
    counts = {"doc": 0, "blob": 0, "skip": 0, "exists": 0}
    with store.pool().connection() as conn:
        for kind, ns, key, path in plan(data):
            if kind == "skip":
                counts["skip"] += 1
                print(f"skip  {path.relative_to(data)}  ({ns})")
                continue
            if kind == "doc":
                try:
                    payload = json.loads(path.read_text())
                except ValueError as exc:
                    print(f"ERROR {path.relative_to(data)}: not valid JSON ({exc})")
                    return 1
                if dry:
                    counts["doc"] += 1
                    continue
                sql = ("INSERT INTO documents (ns, key, data) VALUES (%s, %s, %s::jsonb) ON CONFLICT (ns, key) "
                       + ("DO UPDATE SET data = EXCLUDED.data, version = documents.version + 1, updated_at = now()"
                          if overwrite else "DO NOTHING"))
                n = conn.execute(sql, (ns, store._k(key), json.dumps(payload))).rowcount
            else:
                if dry:
                    counts["blob"] += 1
                    continue
                sql = ("INSERT INTO blobs (ns, key, data, content_type) VALUES (%s, %s, %s, 'application/pdf') "
                       "ON CONFLICT (ns, key) DO " + ("UPDATE SET data = EXCLUDED.data" if overwrite else "NOTHING"))
                n = conn.execute(sql, (ns, key, path.read_bytes())).rowcount
            counts[kind if n else "exists"] += 1
        if not dry:
            conn.commit()
    print(("DRY RUN: would import " if dry else "imported ") +
          f"{counts['doc']} records, {counts['blob']} files; {counts['exists']} already present; {counts['skip']} skipped")
    return 0


def do_verify(data: Path) -> int:
    bad = checked = 0
    for kind, ns, key, path in plan(data):
        if kind == "skip":
            continue
        checked += 1
        if kind == "doc":
            ok = store.get(ns, key) == json.loads(path.read_text())
        else:
            ok = store.get_blob(ns, key) == path.read_bytes()
        if not ok:
            bad += 1
            print(f"MISMATCH {path.relative_to(data)} -> ({ns}, {key})")
    print(f"verified {checked} items, {bad} mismatches")
    return 1 if bad else 0


def do_export(out: Path) -> int:
    inverse = {v: k for k, v in SETTINGS_SUFFIXES.items()}
    n = 0
    with store.pool().connection() as conn:
        for ns, key, data in conn.execute("SELECT ns, key, data FROM documents ORDER BY ns, key"):
            if ns == store.SHARED:
                path = out / f"{key}.json"
            elif ns in inverse:
                path = out / "settings" / f"{key}{inverse[ns]}.json"
            else:
                path = out / ns / f"{key}.json"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(data, indent=2))
            n += 1
        for ns, key, blob in conn.execute("SELECT ns, key, data FROM blobs"):
            path = out / ns / key
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(bytes(blob))
            n += 1
    print(f"exported {n} items to {out}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("action", choices=("import", "verify", "export"))
    ap.add_argument("--data", type=Path, default=Path("data"))
    ap.add_argument("--out", type=Path)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--overwrite", action="store_true")
    a = ap.parse_args()
    if not os.environ.get("DATABASE_URL"):
        print("DATABASE_URL is not set")
        return 2
    if a.action == "import":
        return do_import(a.data, a.dry_run, a.overwrite)
    if a.action == "verify":
        return do_verify(a.data)
    if not a.out:
        print("export needs --out")
        return 2
    return do_export(a.out)


if __name__ == "__main__":
    sys.exit(main())
