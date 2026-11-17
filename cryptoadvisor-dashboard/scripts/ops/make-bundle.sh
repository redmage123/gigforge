#!/usr/bin/env bash
# Build a deploy bundle from the local edits in /tmp/aa-src relative to its baseline commit.
#   bash make-bundle.sh <bundle-dir> [base-ref]
set -euo pipefail
OUT=$1; BASE=${2:-$(git -C /tmp/aa-src rev-list --max-parents=0 HEAD)}
rm -rf "$OUT"; mkdir -p "$OUT/files"; : > "$OUT/MANIFEST"; : > "$OUT/DELETE"
cd /tmp/aa-src
git add -A >/dev/null
git diff --cached --name-status "$BASE" | while read -r st rel rest; do
  case "$st" in
    D) echo "$rel" >> "$OUT/DELETE"; continue ;;
    A) sha=new ;;
    *) sha=$(git show "$BASE:$rel" | sha256sum | cut -d' ' -f1) ;;
  esac
  mkdir -p "$OUT/files/$(dirname "$rel")"; cp "$rel" "$OUT/files/$rel"
  echo "$sha $rel" >> "$OUT/MANIFEST"
done
git reset -q
echo "bundle: $(wc -l < "$OUT/MANIFEST") files, $(wc -l < "$OUT/DELETE") deletions"
